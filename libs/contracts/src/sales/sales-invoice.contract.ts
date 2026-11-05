import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';
import { documentTotalsSchema, lineTaxRuleIdsSchema, lineTaxSchema } from '../settings/tax-rule.contract';

export const salesInvoiceStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type SalesInvoiceStatusDto = z.infer<typeof salesInvoiceStatusSchema>;

export const salesInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  unitOfMeasureId: z.string().uuid().nullable().default(null),
  unitFactor: z.number().positive().default(1),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema,
  /** Line amount before taxes (after any discount). */
  netAmount: moneySchema,
  taxes: z.array(lineTaxSchema),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type SalesInvoiceLineDto = z.infer<typeof salesInvoiceLineSchema>;

export const salesInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  salesOrderId: z.string().uuid(),
  status: salesInvoiceStatusSchema,
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  pricesIncludeTax: z.boolean(),
  salesChannelId: z.string().uuid().nullable().default(null),
  externalReference: z.string().nullable().default(null),
  /** Sales rep (migration 0110); null = none. */
  salesRepId: z.string().uuid().nullable().default(null),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SalesInvoiceDto = z.infer<typeof salesInvoiceSchema>;

export const salesInvoiceWithLinesSchema = salesInvoiceSchema.extend({
  lines: z.array(salesInvoiceLineSchema),
  ...documentTotalsSchema.shape,
});
export type SalesInvoiceWithLinesDto = z.infer<typeof salesInvoiceWithLinesSchema>;

export const createSalesInvoiceLineSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema.optional(),
  taxRuleIds: lineTaxRuleIdsSchema,
  notes: z.string().nullable().optional(),
});
export type CreateSalesInvoiceLineDto = z.infer<typeof createSalesInvoiceLineSchema>;

/**
 * The direct-invoicing path (claude/platform-flexibility-strategy.md) —
 * provided instead of salesOrderId + lines when Sales Orders is not
 * effectively enabled for the tenant. See
 * CreateSalesInvoiceDirectLineInput's own comment (backend domain entity)
 * for why this needs its own line shape rather than reusing
 * createSalesInvoiceLineSchema.
 */
export const createSalesInvoiceDirectLineSchema = z.object({
  productVariantId: z.string().uuid(),
  /** Line unit (carton, sack…); omitted/null = the product's base unit. */
  unitOfMeasureId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  taxRuleIds: lineTaxRuleIdsSchema,
  notes: z.string().nullable().optional(),
});
export type CreateSalesInvoiceDirectLineDto = z.infer<typeof createSalesInvoiceDirectLineSchema>;

export const createSalesInvoiceSchema = z.object({
  // Provide salesOrderId + lines, OR customerId + directLines — not
  // both. Enforced in SalesInvoicesService.create(), same as
  // createSalesOrderSchema's own sourceQuotationId-XOR-customerId+lines
  // shape does not enforce the XOR at the schema level either.
  salesOrderId: z.string().uuid().optional(),
  lines: z.array(createSalesInvoiceLineSchema).optional(),
  customerId: z.string().uuid().optional(),
  directLines: z.array(createSalesInvoiceDirectLineSchema).optional(),
  // Required only when a Delivery must be auto-created behind the
  // scenes (Deliveries disabled for the tenant, or the direct-invoicing
  // path) — see CreateSalesInvoiceInput's own comment.
  warehouseId: z.string().uuid().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  /** Unit prices include VAT/table tax (retail). Default false. */
  pricesIncludeTax: z.boolean().optional(),
  /** Sales channel (Jumia, Noon…) and the platform's order number — matched by settlements. */
  salesChannelId: z.string().uuid().nullable().optional(),
  externalReference: z.string().trim().max(80).nullable().optional(),
  /** Omitted = the order's rep, else the customer's default; null = none. */
  salesRepId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSalesInvoiceDto = z.infer<typeof createSalesInvoiceSchema>;

/**
 * A row of the invoice register: an invoice with its customer and money state
 * (total, paid by posted receipts, credited by credit notes, still open).
 */
export const salesInvoiceRegisterRowSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  status: salesInvoiceStatusSchema,
  invoiceDate: z.string().nullable(),
  /** Due date, or invoice date + the customer's payment terms. */
  dueDate: z.string().nullable(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  salesRepId: z.string().uuid().nullable().default(null),
  salesRepName: z.string().nullable().default(null),
  salesOrderId: z.string().uuid(),
  currency: z.string(),
  totalMinorUnits: z.string(),
  paidMinorUnits: z.string(),
  creditedMinorUnits: z.string(),
  outstandingMinorUnits: z.string(),
  /** Days past due (0 when not due / settled). */
  overdueDays: z.number().int(),
  /** Installment schedule rows (0 = none); with a schedule, dueDate is the earliest unpaid installment's. */
  installmentsCount: z.number().int().default(0),
  createdAt: z.coerce.date(),
});
export type SalesInvoiceRegisterRowDto = z.infer<typeof salesInvoiceRegisterRowSchema>;

/** Customer 360 header: balance, what is overdue, aging buckets. */
export const customerAccountSummarySchema = z.object({
  customerId: z.string().uuid(),
  currency: z.string(),
  /** Open invoices − unallocated receipts − unapplied credit (what the customer owes now). */
  balanceMinorUnits: z.string(),
  openInvoicesMinorUnits: z.string(),
  overdueMinorUnits: z.string(),
  unallocatedPaymentsMinorUnits: z.string(),
  /** current, 1–30, 31–60, 61–90, 90+ days past due. */
  aging: z.array(z.object({ bucket: z.enum(['current', '1_30', '31_60', '61_90', '90_plus']), amountMinorUnits: z.string() })),
  lastInvoiceDate: z.string().nullable(),
  lastPaymentDate: z.string().nullable(),
  salesThisYearMinorUnits: z.string(),
});
export type CustomerAccountSummaryDto = z.infer<typeof customerAccountSummarySchema>;
