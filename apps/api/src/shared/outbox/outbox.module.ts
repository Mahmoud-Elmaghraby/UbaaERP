import { Global, Module } from '@nestjs/common';
import { OUTBOX_EVENT_REPOSITORY } from './application/ports/outbox-event.repository';
import { KyselyOutboxEventRepository } from './infrastructure/persistence/kysely-outbox-event.repository';
import { OutboxWriterService } from './application/services/outbox-writer.service';
import { OutboxDispatcherService } from './application/services/outbox-dispatcher.service';

/**
 * Global module for the Outbox Pattern (master doc §5/§2.7 [مستقر]) —
 * see shared/outbox/ file comments for the full design. Global (like
 * TenancyModule/EventsModule/PrismaModule) so any business module can
 * inject OutboxWriterService without re-wiring it; PurchasesModule
 * (purchase invoice posting) is the first consumer.
 *
 * OutboxDispatcherService isn't exported — nothing needs to inject it,
 * it just needs to exist as a provider so Nest instantiates it (and
 * starts its OnModuleInit poller) once, at app boot.
 */
@Global()
@Module({
  providers: [
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: KyselyOutboxEventRepository },
    OutboxWriterService,
    OutboxDispatcherService,
  ],
  exports: [OutboxWriterService],
})
export class OutboxModule {}
