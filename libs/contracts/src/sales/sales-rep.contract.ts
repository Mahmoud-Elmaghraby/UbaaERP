import { z } from 'zod';

/** Sales representative (مندوب مبيعات). */
export const salesRepSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  /** The system user this rep logs in as (optional). */
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable(),
  /** Stored for a later commission report; nothing computes with it yet. */
  commissionPercentage: z.number().nullable(),
  isActive: z.boolean(),
});
export type SalesRepDto = z.infer<typeof salesRepSchema>;

export const saveSalesRepSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  commissionPercentage: z.number().min(0).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SaveSalesRepDto = z.infer<typeof saveSalesRepSchema>;

/** Sales analysis report (GET /sales-reports/analysis). */
export const salesAnalysisGroupBySchema = z.enum(['rep', 'item', 'product', 'category', 'option', 'customer', 'cashier', 'channel', 'month']);
export type SalesAnalysisGroupByDto = z.infer<typeof salesAnalysisGroupBySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const salesAnalysisQuerySchema = z.object({
  groupBy: salesAnalysisGroupBySchema.default('rep'),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  salesRepId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  /** groupBy 'option': the option to group by ("المقاس", "اللون"…). */
  optionName: z.string().trim().min(1).max(60).optional(),
  salesChannelId: z.string().uuid().optional(),
});
export type SalesAnalysisQueryDto = z.infer<typeof salesAnalysisQuerySchema>;

export const salesAnalysisRowSchema = z.object({
  /** Rep / variant / customer id, or YYYY-MM; null = "no rep". */
  key: z.string().nullable(),
  label: z.string(),
  /** Item code / SKU (group by item only). */
  secondaryLabel: z.string().nullable(),
  /** Base-unit quantity sold net of returns (group by item only). */
  quantity: z.number().nullable(),
  /** Invoices net of tax − credit notes, minor units. */
  netSalesMinorUnits: z.string(),
  costOfGoodsSoldMinorUnits: z.string(),
  grossProfitMinorUnits: z.string(),
  /** Gross profit ÷ net sales × 100, two decimals; null when net sales is zero. */
  marginPercent: z.number().nullable(),
  invoiceCount: z.number().int(),
  /** groupBy 'channel': the platform fees settled in the period (commission, shipping, ads…), and profit after them. */
  feesMinorUnits: z.string().nullable().default(null),
  netProfitMinorUnits: z.string().nullable().default(null),
});
export type SalesAnalysisRowDto = z.infer<typeof salesAnalysisRowSchema>;

export const salesAnalysisReportSchema = z.object({
  groupBy: salesAnalysisGroupBySchema,
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  currency: z.string(),
  rows: z.array(salesAnalysisRowSchema),
  totals: salesAnalysisRowSchema.omit({ key: true, label: true, secondaryLabel: true, quantity: true }),
  /** The option names in use (for the size / colour picker). */
  optionNames: z.array(z.string()).default([]),
  /** Documents in another currency than the company's — left out of the figures. */
  excludedForeignCurrencyDocuments: z.number().int(),
});
export type SalesAnalysisReportDto = z.infer<typeof salesAnalysisReportSchema>;
