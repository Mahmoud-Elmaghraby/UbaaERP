import { applyDecorators, Injectable, SetMetadata, UseInterceptors, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { tap, type Observable } from 'rxjs';
import type { JwtAccessPayload } from '../auth/jwt-payload.type';
import type { DomainEventPayload } from '../events/domain-event';

const AUDIT_KEY = 'auditChanges';
const NO_AUDIT_KEY = 'auditChangesSkip';
const SECRET = /password|secret|token|certificate|pin|private/i;
const MAX_VALUE = 500;

interface AuditTarget {
  module: string;
  entityType: string;
}

/** What a settings-style write changed, without secrets or large values. */
export function auditableChanges(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SECRET.test(key)) {
      out[key] = '••••';
    } else if (value === null || typeof value !== 'object') {
      out[key] = typeof value === 'string' && value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
    } else if (JSON.stringify(value).length <= MAX_VALUE) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Records every successful write on a controller as a '<module>.<entityType>.<action>' event, which
 * Users & Permissions' DomainAuditListener turns into an audit-log row (Event Bus only, CLAUDE.md
 * §2.6). Meant for configuration controllers — settings, numbering, taxes, templates, module
 * switches — where "who changed this, when, to what" matters and the services have no events of
 * their own. Business documents keep their own explicit events.
 */
@Injectable()
export class AuditChangesInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly emitter: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const target = this.reflector.get<AuditTarget | undefined>(AUDIT_KEY, context.getClass());
    const request = context.switchToHttp().getRequest<{
      method: string;
      user?: JwtAccessPayload;
      params?: Record<string, string>;
      body?: unknown;
    }>();
    const skip = this.reflector.get<boolean | undefined>(NO_AUDIT_KEY, context.getHandler());
    if (!target || skip || request.method === 'GET' || !request.user) return next.handle();

    const action = request.method === 'POST' ? 'created' : request.method === 'DELETE' ? 'deleted' : 'updated';
    const params = request.params ?? {};
    const paramId = params.id ?? params.code ?? params.featureKey ?? Object.values(params)[0];
    return next.handle().pipe(
      tap((result) => {
        const resultId = result && typeof result === 'object' ? (result as { id?: unknown }).id : undefined;
        const payload: DomainEventPayload = {
          schema: request.user!.schema,
          entityType: target.entityType,
          entityId: paramId ?? (typeof resultId === 'string' ? resultId : target.entityType),
          action,
          actorUserId: request.user!.sub,
          metadata: { changes: auditableChanges(request.body) },
          occurredAt: new Date(),
        };
        this.emitter.emit(`${target.module}.${target.entityType}.${action}`, payload);
      }),
    );
  }
}

/** Audit every write of this controller as `<module>.<entityType>.<created|updated|deleted>`. */
export const AuditChanges = (module: string, entityType: string): ClassDecorator =>
  applyDecorators(SetMetadata(AUDIT_KEY, { module, entityType }), UseInterceptors(AuditChangesInterceptor));

/** A write on an audited controller that isn't a configuration change (e.g. allocating a number). */
export const NoAudit = (): MethodDecorator => SetMetadata(NO_AUDIT_KEY, true);
