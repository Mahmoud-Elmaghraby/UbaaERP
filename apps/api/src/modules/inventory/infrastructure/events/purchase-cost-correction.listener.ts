import { Injectable, Logger } from '@nestjs/common';
import { Money } from '@erp-platform/shared-kernel';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { PurchasePriceDifference } from '../../../../shared/events/purchase-price-difference';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { CurrencyRateReader, applyRate } from '../../../../shared/catalog/currency-rate-reader';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { localIsoDate } from '../../../../shared/time/local-date';
import { PurchaseCostCorrectionsService } from '../../application/services/purchase-cost-corrections.service';

interface InvoicePostedMetadata {
  invoiceNumber?: string;
  invoiceDate?: string | null;
  /** Absent on events written before purchase price differences existed. */
  priceDifferences?: PurchasePriceDifference[];
}

interface DebitNoteIssuedMetadata {
  purchaseReturnId: string;
  invoiceNumber?: string;
  invoiceDate?: string | null;
  lines?: { productVariantId: string; quantity: number; netAmount?: { amountMinorUnits: string; currency: string } }[];
}

/** Purchases' supplier documents → the goods' real cost (see PurchaseCostCorrectionsService). */
@Injectable()
export class PurchaseCostCorrectionListener {
  private readonly logger = new Logger(PurchaseCostCorrectionListener.name);
  private readonly currencyRates = new CurrencyRateReader();

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly corrections: PurchaseCostCorrectionsService,
  ) {}

  @OnOutboxEvent('purchases.purchase_invoice.posted')
  async handleInvoice(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as InvoicePostedMetadata | undefined;
    if (!metadata?.priceDifferences?.length) return;
    const db = this.connections.getClient(payload.schema);
    await withTransaction(db, (trx) =>
      this.corrections.applyInvoiceDifferences(trx, {
        schema: payload.schema,
        actorUserId: payload.actorUserId ?? null,
        invoiceId: payload.entityId,
        invoiceNumber: metadata.invoiceNumber ?? null,
        entryDate: metadata.invoiceDate ?? localIsoDate(payload.occurredAt),
        differences: metadata.priceDifferences!,
      }),
    );
  }

  @OnOutboxEvent('purchases.purchase_debit_note.issued')
  async handleDebitNote(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as DebitNoteIssuedMetadata | undefined;
    const sourceLines = (metadata?.lines ?? []).filter((line) => line.netAmount);
    if (!metadata?.purchaseReturnId || sourceLines.length === 0) return;
    const db = this.connections.getClient(payload.schema);
    const date = metadata.invoiceDate ?? localIsoDate(payload.occurredAt);

    // The debit note's value in the tenant currency, at its own date.
    const tenantCurrency = await this.currencyRates.tenantCurrency(db);
    const currency = sourceLines[0].netAmount!.currency;
    const rate = currency === tenantCurrency ? null : await this.currencyRates.effectiveRate(db, currency, tenantCurrency, date);
    if (currency !== tenantCurrency && !rate) {
      this.logger.warn(`Debit note "${payload.entityId}": no ${currency}→${tenantCurrency} rate on ${date} — no cost difference posted.`);
      return;
    }
    const lines = sourceLines.map((line) => {
      const minor = BigInt(line.netAmount!.amountMinorUnits);
      return {
        productVariantId: line.productVariantId,
        baseQuantity: line.quantity,
        value: Money.fromMinorUnits(rate ? applyRate(minor, rate) : minor, tenantCurrency),
      };
    });

    await withTransaction(db, (trx) =>
      this.corrections.applyReturnDifference(trx, {
        schema: payload.schema,
        actorUserId: payload.actorUserId ?? null,
        debitNoteId: payload.entityId,
        debitNoteNumber: metadata.invoiceNumber ?? null,
        purchaseReturnId: metadata.purchaseReturnId,
        entryDate: date,
        lines,
      }),
    );
  }
}
