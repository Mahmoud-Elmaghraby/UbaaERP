import { z } from 'zod';

/** Purchase analysis report (GET /purchase-reports/analysis). */
export const purchaseAnalysisGroupBySchema = z.enum(['supplier', 'item', 'category', 'month']);
export type PurchaseAnalysisGroupByDto = z.infer<typeof purchaseAnalysisGroupBySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const purchaseAnalysisQuerySchema = z.object({
  groupBy: purchaseAnalysisGroupBySchema.default('supplier'),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  supplierId: z.string().uuid().optional(),
});
export type PurchaseAnalysisQueryDto = z.infer<typeof purchaseAnalysisQuerySchema>;

export const purchaseAnalysisRowSchema = z.object({
  /** Supplier / variant / category id, or YYYY-MM; null = "no category". */
  key: z.string().nullable(),
  label: z.string(),
  /** SKU (group by item only). */
  secondaryLabel: z.string().nullable(),
  /** Base-unit quantity bought net of returns (item and category only). */
  quantity: z.number().nullable(),
  /** Posted invoice lines before tax, minor units. */
  grossPurchasesMinorUnits: z.string(),
  /** Debit notes (returns of invoiced goods) before tax, minor units, positive. */
  returnsMinorUnits: z.string(),
  /** gross − returns. */
  netPurchasesMinorUnits: z.string(),
  /** net ÷ quantity, minor units per base unit (item only). */
  averageUnitCostMinorUnits: z.string().nullable(),
  /** Share of the report's net purchases, two decimals. */
  sharePercent: z.number().nullable(),
  invoiceCount: z.number().int(),
});
export type PurchaseAnalysisRowDto = z.infer<typeof purchaseAnalysisRowSchema>;

export const purchaseAnalysisReportSchema = z.object({
  groupBy: purchaseAnalysisGroupBySchema,
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  currency: z.string(),
  rows: z.array(purchaseAnalysisRowSchema),
  totals: z.object({
    grossPurchasesMinorUnits: z.string(),
    returnsMinorUnits: z.string(),
    netPurchasesMinorUnits: z.string(),
    invoiceCount: z.number().int(),
  }),
  /** Documents in another currency than the company's — left out of the figures. */
  excludedForeignCurrencyDocuments: z.number().int(),
});
export type PurchaseAnalysisReportDto = z.infer<typeof purchaseAnalysisReportSchema>;

/** Purchase price history of one item (GET /purchase-reports/price-history). */
export const purchasePriceHistoryQuerySchema = z.object({
  productVariantId: z.string().uuid(),
  /** Also return the last price from this supplier. */
  supplierId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type PurchasePriceHistoryQueryDto = z.infer<typeof purchasePriceHistoryQuerySchema>;

export const purchasePriceEntrySchema = z.object({
  purchaseInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  date: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  /** Price per base unit before tax, minor units, in `currency`. */
  unitPriceMinorUnits: z.string(),
  currency: z.string(),
  /** Base-unit quantity on the line. */
  quantity: z.number(),
});
export type PurchasePriceEntryDto = z.infer<typeof purchasePriceEntrySchema>;

export const purchasePriceHistorySchema = z.object({
  productVariantId: z.string().uuid(),
  /** Newest first (posted invoices only). */
  entries: z.array(purchasePriceEntrySchema),
  /** The latest entry from the requested supplier, when one was asked for and exists. */
  lastFromSupplier: purchasePriceEntrySchema.nullable(),
});
export type PurchasePriceHistoryDto = z.infer<typeof purchasePriceHistorySchema>;
