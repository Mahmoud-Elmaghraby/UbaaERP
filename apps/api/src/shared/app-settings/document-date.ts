import { applyDecorators, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload } from '../auth/jwt-payload.type';
import { BusinessRuleError } from '../errors/domain-errors';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { localIsoDate } from '../time/local-date';
import { AppSettingsRepository } from './app-settings.repository';

/** Holders may date a document anywhere ('documents.backdate', migration 0120). */
export const BACKDATE_PERMISSION = 'documents.backdate';
const FIELDS_KEY = 'documentDateFields';

/** Whole days from `from` to `to` (ISO dates, yyyy-mm-dd). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type DocumentDateProblem = { kind: 'too_old'; maxDays: number } | { kind: 'future' } | null;

/**
 * Is a document date inside what the settings allow? `backdateDays` null = any past date,
 * 0 = today only; a future date only while 'documents.allowFutureDates' is on.
 */
export function documentDateProblem(
  date: string,
  today: string,
  rules: { backdateDays: number | null; allowFutureDates: boolean },
): DocumentDateProblem {
  const age = daysBetween(date, today);
  if (age < 0) return rules.allowFutureDates ? null : { kind: 'future' };
  if (rules.backdateDays !== null && age > rules.backdateDays) return { kind: 'too_old', maxDays: rules.backdateDays };
  return null;
}

/**
 * Checks the date fields of a create / update request against the settings hub's document-date
 * rules ('documents.backdateDays', 'documents.allowFutureDates'). One guard for every module: the
 * endpoint names its date fields with @CheckDocumentDates('invoiceDate'). An empty date means
 * "today" (set when posting), which is always allowed.
 */
@Injectable()
export class DocumentDateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly connections: TenantConnectionManager,
    private readonly settings: AppSettingsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const fields = this.reflector.get<string[] | undefined>(FIELDS_KEY, context.getHandler()) ?? [];
    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload; body?: Record<string, unknown> }>();
    const user = request.user;
    if (!user || fields.length === 0 || user.permissions.includes(BACKDATE_PERMISSION)) return true;
    const dates = fields
      .map((field) => [field, request.body?.[field]] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(entry[1]));
    if (dates.length === 0) return true;
    const db = this.connections.getClient(user.schema);
    const rules = await this.settings.getMany(db, ['documents.backdateDays', 'documents.allowFutureDates']);
    const today = localIsoDate();
    for (const [field, value] of dates) {
      const date = value.slice(0, 10);
      const problem = documentDateProblem(date, today, {
        backdateDays: rules['documents.backdateDays'],
        allowFutureDates: rules['documents.allowFutureDates'],
      });
      if (problem?.kind === 'future') {
        throw new BusinessRuleError(`The date ${date} is in the future.`, { code: 'DOCUMENT_DATE.FUTURE', params: { field, date } });
      }
      if (problem?.kind === 'too_old') {
        throw new BusinessRuleError(`The date ${date} is more than ${problem.maxDays} days back.`, {
          code: 'DOCUMENT_DATE.TOO_OLD',
          params: { field, date, maxDays: problem.maxDays },
        });
      }
    }
    return true;
  }
}

/** Check these body date fields against the document-date settings (after the auth guards). */
export function CheckDocumentDates(...fields: string[]) {
  return applyDecorators(SetMetadata(FIELDS_KEY, fields), UseGuards(DocumentDateGuard));
}
