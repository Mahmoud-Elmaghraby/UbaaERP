import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import { OnOutboxEvent } from './on-outbox-event.decorator';

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
