import { Reflector } from '@nestjs/core';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AuditChanges, AuditChangesInterceptor, auditableChanges } from './audit-changes.interceptor';

@AuditChanges('settings', 'tax_rule')
class TaxRulesTestController {
  update(): void {}
}

function context(method: string, body: unknown): ExecutionContext {
  return {
    getClass: () => TaxRulesTestController,
    getHandler: () => TaxRulesTestController.prototype.update,
    switchToHttp: () => ({
      getRequest: () => ({ method, body, params: { id: 'tax-1' }, user: { sub: 'u1', schema: 'tenant_x' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuditChangesInterceptor', () => {
  it('emits <module>.<entity>.<action> after a successful write, without secrets', async () => {
    const emitter = { emit: jest.fn() } as unknown as EventEmitter2;
    const interceptor = new AuditChangesInterceptor(new Reflector(), emitter);
    const next: CallHandler = { handle: () => of({ id: 'tax-1' }) };
    await lastValueFrom(interceptor.intercept(context('PATCH', { rate: '14', apiSecret: 'x' }), next));
    expect(emitter.emit).toHaveBeenCalledWith(
      'settings.tax_rule.updated',
      expect.objectContaining({
        entityType: 'tax_rule',
        entityId: 'tax-1',
        actorUserId: 'u1',
        schema: 'tenant_x',
        metadata: { changes: { rate: '14', apiSecret: '••••' } },
      }),
    );
  });

  it('does nothing on GET', async () => {
    const emitter = { emit: jest.fn() } as unknown as EventEmitter2;
    const interceptor = new AuditChangesInterceptor(new Reflector(), emitter);
    await lastValueFrom(interceptor.intercept(context('GET', undefined), { handle: () => of([]) }));
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('keeps small values and drops large ones', () => {
    expect(auditableChanges({ a: 1, b: { c: 'x' }, d: { big: 'y'.repeat(600) } })).toEqual({ a: 1, b: { c: 'x' } });
  });
});
