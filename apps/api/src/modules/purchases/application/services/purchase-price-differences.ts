import type { Money } from '@erp-platform/shared-kernel';
import { applyRate } from '../../../../shared/catalog/currency-rate-reader';
import type { PurchasePriceDifference } from '../../../../shared/events/purchase-price-difference';
import type { ReceivedOrderLineValue } from './goods-receipts.service';

export interface InvoicedLineForMatching {
  purchaseOrderLineId: string;
  productVariantId: string;
  /** Base units on this invoice. */
  baseQuantity: number;
  /** Net of taxes, in the invoice currency. */
  netAmount: Money;
}

/**
 * Purchase price differences (المعالجة المحاسبية لفرق سعر الشراء): goods
 * enter stock at the receipt's cost (the order price), the supplier's
 * invoice may say otherwise. For the part of each invoice line that matches
 * goods already received and not yet invoiced, the difference between the
 * invoiced value and the received value — both in the tenant currency —
 * belongs to the goods' cost (IAS 2). Inventory applies it (on-hand share →
 * stock value and average cost, sold share → cost of goods sold), which also
 * clears GRNI. Quantity invoiced before it is received has no receipt to
 * correct yet and is left out.
 *
 * Pure: the caller supplies receipts, earlier invoiced quantities and the
 * invoice-date rate (null when the invoice is in the tenant currency).
 */
export function computePurchasePriceDifferences(input: {
  lines: InvoicedLineForMatching[];
  received: ReadonlyMap<string, ReceivedOrderLineValue>;
  /** Base units already on other posted invoices, per PO line. */
  previouslyInvoiced: ReadonlyMap<string, number>;
  tenantCurrency: string;
  rate: string | null;
}): PurchasePriceDifference[] {
  const result: PurchasePriceDifference[] = [];
  // Several lines of one invoice may draw on the same PO line.
  const usedOnThisInvoice = new Map<string, number>();
  for (const line of input.lines) {
    const received = input.received.get(line.purchaseOrderLineId);
    if (!received || !received.complete || received.baseQuantity <= 0 || line.baseQuantity <= 0) continue;
    if (line.netAmount.currency !== input.tenantCurrency && !input.rate) continue;

    const alreadyMatched =
      (input.previouslyInvoiced.get(line.purchaseOrderLineId) ?? 0) + (usedOnThisInvoice.get(line.purchaseOrderLineId) ?? 0);
    const matched = round4(Math.min(line.baseQuantity, Math.max(0, received.baseQuantity - alreadyMatched)));
    usedOnThisInvoice.set(line.purchaseOrderLineId, (usedOnThisInvoice.get(line.purchaseOrderLineId) ?? 0) + line.baseQuantity);
    if (matched <= 0) continue;

    const receivedValue = share(received.value.toMinorUnits(), matched, received.baseQuantity);
    const invoicedNet = share(line.netAmount.toMinorUnits(), matched, line.baseQuantity);
    const invoicedValue =
      line.netAmount.currency === input.tenantCurrency ? invoicedNet : applyRate(invoicedNet, input.rate as string);
    const amount = invoicedValue - receivedValue;
    if (amount === 0n) continue;

    result.push({
      purchaseOrderLineId: line.purchaseOrderLineId,
      productVariantId: line.productVariantId,
      matchedBaseQuantity: matched,
      goodsReceiptIds: received.goodsReceiptIds,
      receivedValue: { amountMinorUnits: receivedValue.toString(), currency: input.tenantCurrency },
      invoicedValue: { amountMinorUnits: invoicedValue.toString(), currency: input.tenantCurrency },
      amount: { amountMinorUnits: amount.toString(), currency: input.tenantCurrency },
    });
  }
  return result;
}

/** minorUnits × part / whole, rounded half away from zero (exact BigInt; quantities to 4 places). */
function share(minorUnits: bigint, part: number, whole: number): bigint {
  const partScaled = BigInt(Math.round(part * 10_000));
  const wholeScaled = BigInt(Math.round(whole * 10_000));
  if (wholeScaled === 0n) return 0n;
  if (partScaled === wholeScaled) return minorUnits;
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const rounded = (abs * partScaled * 2n + wholeScaled) / (wholeScaled * 2n);
  return negative ? -rounded : rounded;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
