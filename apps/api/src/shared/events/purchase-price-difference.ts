/**
 * Carried on 'purchases.purchase_invoice.posted' (metadata.priceDifferences):
 * for the part of an invoice line that matches goods already received, how
 * the invoiced value (tenant currency, invoice-date rate) splits against
 * what the receipt put into stock (tenant currency, the receipt's frozen
 * rate):
 *
 *   invoicedValue = receivedValue + amount + exchangeDifference
 *
 * `amount` is the real PRICE difference (invoice unit price ≠ receipt unit
 * cost, in the document currency, converted at the invoice-date rate) —
 * Inventory applies it to the goods' cost (PurchaseCostCorrectionsService).
 * `exchangeDifference` is the receipt's own value restated at the invoice
 * rate minus its frozen value — an exchange gain / loss (IAS 21), booked by
 * Accounting on the invoice entry, never inventory cost. Purchases computes
 * both (computePurchasePriceDifferences). Positive = costs more.
 *
 * The same shape (plus the invoice it was matched to) is carried on
 * 'purchases.goods_receipt.confirmed' (metadata.invoicedDifferences) for
 * goods received AFTER they were invoiced (computeReceiptInvoiceDifferences).
 */
export interface PurchasePriceDifference {
  purchaseOrderLineId: string;
  productVariantId: string;
  /** Base units of this invoice line matched against receipts. */
  matchedBaseQuantity: number;
  /** The receipts that brought these goods in (where to find them in stock). */
  goodsReceiptIds: string[];
  receivedValue: { amountMinorUnits: string; currency: string };
  invoicedValue: { amountMinorUnits: string; currency: string };
  /** Price part only (signed minor units, tenant currency). Before the FX split it was invoicedValue − receivedValue. */
  amount: { amountMinorUnits: string; currency: string };
  /** Exchange part (signed minor units, tenant currency); absent on events written before the split (= 0). */
  exchangeDifference?: { amountMinorUnits: string; currency: string };
}

/** A goods-receipt line matched to a quantity a posted purchase invoice billed before the goods arrived. */
export interface ReceiptInvoiceDifference extends PurchasePriceDifference {
  purchaseInvoiceId: string;
  invoiceNumber: string | null;
  /** The invoice's date — the rate its payable (and GRNI debit) was booked at. */
  invoiceDate: string;
  /** Invoice net per base unit, document currency (for display / audit). */
  invoiceUnitPrice: { amountMinorUnits: string; currency: string };
}
