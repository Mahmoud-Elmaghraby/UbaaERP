import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import { OnOutboxEvent } from './on-outbox-event.decorator';
import { registerOutboxFeatureChecker } from './outbox-feature-gate';

@Injectable()
class FailingListeners {
  @OnOutboxEvent('test.outbox')
  async outbox(): Promise<void> {
    throw new Error('journal entry could not be posted');
  }

  @OnEvent('test.plain')
  async plain(): Promise<void> {
    throw new Error('swallowed');
  }
}

describe('OnOutboxEvent', () => {
  it('lets a listener failure reach emitAsync (so the outbox retries) — plain @OnEvent swallows it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [FailingListeners],
    }).compile();
    await moduleRef.init();
    const emitter = moduleRef.get(EventEmitter2);

    await expect(emitter.emitAsync('test.outbox', {})).rejects.toThrow('journal entry could not be posted');
    // The bug this decorator exists for: the default resolves as if nothing happened.
    await expect(emitter.emitAsync('test.plain', {})).resolves.toBeDefined();
    await moduleRef.close();
  });
});

@Injectable()
class GatedListener {
  calls: string[] = [];

  @OnOutboxEvent('test.gated', { requiresFeature: 'accounting' })
  async handle(payload: { schema: string }): Promise<void> {
    this.calls.push(payload.schema);
  }
}

describe('OnOutboxEvent({ requiresFeature })', () => {
  afterEach(() => registerOutboxFeatureChecker(null));

  it('skips the handler for tenants without the feature and runs it for the rest', async () => {
    registerOutboxFeatureChecker({ isEnabledForSchema: async (schema) => schema === 'with_accounting' });
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [GatedListener],
    }).compile();
    await moduleRef.init();
    const emitter = moduleRef.get(EventEmitter2);
    const listener = moduleRef.get(GatedListener);

    await emitter.emitAsync('test.gated', { schema: 'without_accounting' });
    await emitter.emitAsync('test.gated', { schema: 'with_accounting' });
    expect(listener.calls).toEqual(['with_accounting']);
    await moduleRef.close();
  });

  it('runs the handler when no checker is registered (direct unit-test construction)', async () => {
    const listener = new GatedListener();
    await listener.handle({ schema: 'any' });
    expect(listener.calls).toEqual(['any']);
  });
});
