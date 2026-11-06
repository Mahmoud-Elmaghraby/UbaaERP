import type { Money } from '@erp-platform/shared-kernel';
import { applyRate } from '../../../../shared/catalog/currency-rate-reader';
import type {
  PurchasePriceDifference,
  ReceiptInvoiceDifference,
} from '../../../../shared/events/purchase-price-difference';
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
 * enter stock at the receipt's cost (the order price × the receipt's frozen
 * rate), the supplier's invoice may say otherwise. For the part of each
 * invoice line that matches goods already received and not yet invoiced,
 * the invoiced value (invoice-date rate) splits into:
 *
 *  - receivedValue       what the receipt credited GRNI with;
 *  - amount (price)      (invoice price − receipt cost) × matched quantity,
 *                        in the document currency, at the invoice rate —
 *                        belongs to the goods' cost (IAS 2): Inventory
 *                        applies it (on-hand share → stock value, sold
 *                        share → COGS);
 *  - exchangeDifference  the receipt's own document value at the invoice
 *                        rate − its frozen value — an exchange gain / loss
 *                        (IAS 21, approved policy), booked by Accounting on
 *                        the invoice entry, never inventory cost.
 *
 * invoicedValue = receivedValue + amount + exchangeDifference, exactly.
 * Shares of a receipt / an invoice line are taken cumulatively (value of
 * units [a, a+m) = share(a+m) − share(a)), so successive partial matches add
 * up to the whole to the minor unit — GRNI nets to zero. Quantity invoiced
 * before it is received is left out here (see computeReceiptInvoiceDifferences).
 * Matches whose price and exchange parts are both zero are omitted.
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
    const foreign = line.netAmount.currency !== input.tenantCurrency;
    if (foreign && !input.rate) {
      throw new Error(`No ${line.netAmount.currency}→${input.tenantCurrency} rate given for a foreign-currency invoice.`);
    }
    const toLedger = (minor: bigint) => (foreign ? applyRate(minor, input.rate as string) : minor);

    const received = input.received.get(line.purchaseOrderLineId);
    const alreadyMatched =
      (input.previouslyInvoiced.get(line.purchaseOrderLineId) ?? 0) + (usedOnThisInvoice.get(line.purchaseOrderLineId) ?? 0);
    usedOnThisInvoice.set(line.purchaseOrderLineId, (usedOnThisInvoice.get(line.purchaseOrderLineId) ?? 0) + line.baseQuantity);
    if (!received || !received.complete || received.baseQuantity <= 0 || line.baseQuantity <= 0) continue;

    const matched = round4(Math.min(line.baseQuantity, Math.max(0, received.baseQuantity - alreadyMatched)));
    if (matched <= 0) continue;
    const from = alreadyMatched;
    const to = round4(alreadyMatched + matched);

    const receivedValue = slice(received.value.toMinorUnits(), from, to, received.baseQuantity, (v) => v);
    const receivedAtInvoiceRate = slice(received.documentValue.toMinorUnits(), from, to, received.baseQuantity, toLedger);
    const invoicedValue = toLedger(share(line.netAmount.toMinorUnits(), matched, line.baseQuantity));
    const amount = invoicedValue - receivedAtInvoiceRate;
    const exchangeDifference = receivedAtInvoiceRate - receivedValue;
    if (amount === 0n && exchangeDifference === 0n) continue;

    const money = (minor: bigint) => ({ amountMinorUnits: minor.toString(), currency: input.tenantCurrency });
    result.push({
      purchaseOrderLineId: line.purchaseOrderLineId,
      productVariantId: line.productVariantId,
      matchedBaseQuantity: matched,
      goodsReceiptIds: received.goodsReceiptIds,
      receivedValue: money(receivedValue),
      invoicedValue: money(invoicedValue),
      amount: money(amount),
      exchangeDifference: money(exchangeDifference),
    });
  }
  return result;
}

/** A posted invoice line of the order line, oldest first (see computeReceiptInvoiceDifferences). */
export interface PostedInvoiceLineForReceipt {
  purchaseOrderLineId: string;
  purchaseInvoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  baseQuantity: number;
  /** Net of taxes, document currency. */
  netAmount: Money;
  /** Invoice-date rate; null when the document is in the tenant currency. */
  rate: string | null;
}

export interface ReceiptLineForMatching {
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  productVariantId: string;
  baseQuantity: number;
  /** quantity × unit cost, document currency. */
  documentValue: Money;
  /** What this line credits GRNI with (tenant currency, the receipt's frozen rate). */
  ledgerValue: Money;
}

/**
 * Invoice before receipt: the invoice debited GRNI with the full value of
 * the quantity it billed that had not arrived yet (invoice-date rate). When
 * that quantity is received, the receipt credits GRNI only at the order
 * price × its own rate — so the rest is split here, the same way an
 * invoice after receipt splits it (computePurchasePriceDifferences):
 * price part → the goods' cost, exchange part → gain / loss.
 *
 * Positions on a PO line: invoices bill units [0, invoiced) in order
 * (invoice date, then creation), receipts bring units [0, received). This
 * receipt brings [previouslyReceived, previouslyReceived + q); the overlap
 * with each invoice line is valued cumulatively from that line's start, so
 * the invoice's matched part plus every later receipt's part add up exactly
 * to the line's ledger value.
 */
export function computeReceiptInvoiceDifferences(input: {
  receiptLines: ReceiptLineForMatching[];
  /** Per PO line, oldest first. */
  invoicedLines: PostedInvoiceLineForReceipt[];
  /** Base units on OTHER confirmed receipts, per PO line. */
  previouslyReceived: ReadonlyMap<string, number>;
  tenantCurrency: string;
}): ReceiptInvoiceDifference[] {
  const result: ReceiptInvoiceDifference[] = [];
  const position = new Map(input.previouslyReceived);
  for (const line of input.receiptLines) {
    const start = position.get(line.purchaseOrderLineId) ?? 0;
    const end = round4(start + line.baseQuantity);
    position.set(line.purchaseOrderLineId, end);
    if (line.baseQuantity <= 0) continue;

    let invoiceStart = 0;
    for (const invoiced of input.invoicedLines) {
      if (invoiced.purchaseOrderLineId !== line.purchaseOrderLineId || invoiced.baseQuantity <= 0) continue;
      const invoiceEnd = round4(invoiceStart + invoiced.baseQuantity);
      const from = Math.max(start, invoiceStart);
      const to = Math.min(end, invoiceEnd);
      if (to - from > 1e-9) {
        const foreign = invoiced.netAmount.currency !== input.tenantCurrency;
        if (foreign && !invoiced.rate) {
          throw new Error(`No ${invoiced.netAmount.currency}→${input.tenantCurrency} rate for invoice "${invoiced.purchaseInvoiceId}".`);
        }
        const atInvoiceRate = (minor: bigint) => (foreign ? applyRate(minor, invoiced.rate as string) : minor);
        // Units [from, to) within this receipt line and within the invoice line.
        const inReceipt = [round4(from - start), round4(to - start)] as const;
        const inInvoice = [round4(from - invoiceStart), round4(to - invoiceStart)] as const;
        const quantity = round4(to - from);

        const receivedValue = slice(line.ledgerValue.toMinorUnits(), inReceipt[0], inReceipt[1], line.baseQuantity, (v) => v);
        const receivedAtInvoiceRate = slice(
          line.documentValue.toMinorUnits(),
          inReceipt[0],
          inReceipt[1],
          line.baseQuantity,
          atInvoiceRate,
        );
        const invoicedValue = slice(invoiced.netAmount.toMinorUnits(), inInvoice[0], inInvoice[1], invoiced.baseQuantity, atInvoiceRate);
        const money = (minor: bigint) => ({ amountMinorUnits: minor.toString(), currency: input.tenantCurrency });
        const perUnit = share(invoiced.netAmount.toMinorUnits(), 1, invoiced.baseQuantity);
        result.push({
          purchaseOrderLineId: line.purchaseOrderLineId,
          productVariantId: line.productVariantId,
          matchedBaseQuantity: quantity,
          goodsReceiptIds: [line.goodsReceiptId],
          purchaseInvoiceId: invoiced.purchaseInvoiceId,
          invoiceNumber: invoiced.invoiceNumber,
          invoiceDate: invoiced.invoiceDate,
          invoiceUnitPrice: { amountMinorUnits: perUnit.toString(), currency: invoiced.netAmount.currency },
          receivedValue: money(receivedValue),
          invoicedValue: money(invoicedValue),
          amount: money(invoicedValue - receivedAtInvoiceRate),
          exchangeDifference: money(receivedAtInvoiceRate - receivedValue),
        });
      }
      invoiceStart = invoiceEnd;
    }
  }
  return result.filter((d) => d.amount.amountMinorUnits !== '0' || d.exchangeDifference?.amountMinorUnits !== '0');
}

/** convert(share(total, to)) − convert(share(total, from)): the value of units [from, to) of `whole`, cumulative so slices add up. */
function slice(total: bigint, from: number, to: number, whole: number, convert: (minor: bigint) => bigint): bigint {
  return convert(share(total, to, whole)) - convert(share(total, from, whole));
}

/** minorUnits × part / whole, rounded half away from zero (exact BigInt; quantities to 4 places). */
function share(minorUnits: bigint, part: number, whole: number): bigint {
  const partScaled = BigInt(Math.round(part * 10_000));
  const wholeScaled = BigInt(Math.round(whole * 10_000));
  if (wholeScaled === 0n || partScaled === 0n) return 0n;
  if (partScaled === wholeScaled) return minorUnits;
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const rounded = (abs * partScaled * 2n + wholeScaled) / (wholeScaled * 2n);
  return negative ? -rounded : rounded;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
