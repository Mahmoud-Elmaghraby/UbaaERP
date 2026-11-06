import { Injectable } from '@nestjs/common';
import { Money } from '@erp-platform/shared-kernel';
import { OnOutboxEvent } from '../../../../shared/events/on-outbox-event.decorator';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';
import type { PurchasePriceDifference } from '../../../../shared/events/purchase-price-difference';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { CurrencyRateReader, applyRate } from '../../../../shared/catalog/currency-rate-reader';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { localIsoDate } from '../../../../shared/time/local-date';
import { PurchaseCostCorrectionsService } from '../../application/services/purchase-cost-corrections.service';
import { BusinessRuleError } from '../../application/errors';

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
  /** The (latest) posted invoice the note reverses; absent on older events. */
  sourceInvoiceDate?: string;
  lines?: {
    productVariantId: string;
    quantity: number;
    netAmount?: { amountMinorUnits: string; currency: string };
    sourceInvoiceDate?: string;
  }[];
}

/** Purchases' supplier documents → the goods' real cost (see PurchaseCostCorrectionsService). */
@Injectable()
export class PurchaseCostCorrectionListener {
  private readonly currencyRates = new CurrencyRateReader();

  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly corrections: PurchaseCostCorrectionsService,
  ) {}

  @OnOutboxEvent('purchases.purchase_invoice.posted')
  async handleInvoice(payload: DomainEventPayload): Promise<void> {
    const metadata = payload.metadata as unknown as InvoicePostedMetadata | undefined;
    // Only the price part is the goods' cost; the exchange part is Accounting's (gain / loss).
    const differences = (metadata?.priceDifferences ?? []).filter((d) => d.amount.amountMinorUnits !== '0');
    if (!metadata || differences.length === 0) return;
    const db = this.connections.getClient(payload.schema);
    await withTransaction(db, (trx) =>
      this.corrections.applyInvoiceDifferences(trx, {
        schema: payload.schema,
        actorUserId: payload.actorUserId ?? null,
        invoiceId: payload.entityId,
        invoiceNumber: metadata.invoiceNumber ?? null,
        entryDate: metadata.invoiceDate ?? localIsoDate(payload.occurredAt),
        differences,
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

    // The debit note's value in the tenant currency, at the rate its source invoice was booked at
    // (the same per-line conversion Accounting credits GRNI with), so GRNI nets out exactly.
    const tenantCurrency = await this.currencyRates.tenantCurrency(db);
    const rates = new Map<string, string | null>();
    const lines: { productVariantId: string; baseQuantity: number; value: Money }[] = [];
    for (const line of sourceLines) {
      const net = line.netAmount!;
      let minor = BigInt(net.amountMinorUnits);
      if (net.currency !== tenantCurrency) {
        const rateDate = line.sourceInvoiceDate ?? metadata.sourceInvoiceDate ?? date;
        const key = `${net.currency}|${rateDate}`;
        if (!rates.has(key)) rates.set(key, await this.currencyRates.effectiveRate(db, net.currency, tenantCurrency, rateDate));
        const rate = rates.get(key);
        if (!rate) {
          // Throw, don't skip: a skipped difference leaves GRNI unbalanced for good. The outbox retries.
          throw new BusinessRuleError(
            `Debit note "${payload.entityId}": no ${net.currency}→${tenantCurrency} rate on or before ${rateDate}.`,
            { code: 'EXCHANGE_RATE.NOT_AVAILABLE', params: { from: net.currency, to: tenantCurrency, date: rateDate } },
          );
        }
        minor = applyRate(minor, rate);
      }
      lines.push({
        productVariantId: line.productVariantId,
        baseQuantity: line.quantity,
        value: Money.fromMinorUnits(minor, tenantCurrency),
      });
    }

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
