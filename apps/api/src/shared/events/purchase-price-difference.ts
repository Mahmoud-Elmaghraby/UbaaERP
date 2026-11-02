/**
 * Carried on 'purchases.purchase_invoice.posted' (metadata.priceDifferences):
 * for the part of an invoice line that matches goods already received, how
 * far the invoiced value is from what the receipt put into stock — both in
 * the tenant currency. Inventory applies `amount` to the goods' cost (see
 * PurchasePriceDifferenceListener); Purchases computes it
 * (computePurchasePriceDifferences). Positive = the invoice costs more.
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
  /** invoicedValue − receivedValue (signed minor units, tenant currency). */
  amount: { amountMinorUnits: string; currency: string };
}
