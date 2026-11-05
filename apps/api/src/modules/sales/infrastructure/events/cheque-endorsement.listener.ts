import { Injectable } from '@nestjs/common';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { localIsoDate } from '../../../../shared/time/local-date';
import { ReceivedChequesService } from '../../application/services/received-cheques.service';

/** A posted supplier payment that endorses a customer cheque marks that cheque endorsed (Purchases never writes Sales rows). */
@Injectable()
export class ChequeEndorsementListener {
  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly cheques: ReceivedChequesService,
  ) {}

  @OnOutboxEvent('purchases.supplier_payment.posted')
  async handle(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as { endorsedChequeId?: string | null; paymentDate?: string | null } | undefined;
    if (!metadata?.endorsedChequeId) return;
    await this.cheques.markEndorsed(
      this.connections.getClient(payload.schema),
      metadata.endorsedChequeId,
      payload.entityId,
      metadata.paymentDate ?? localIsoDate(payload.occurredAt),
    );
  }
}
