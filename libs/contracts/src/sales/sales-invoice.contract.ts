import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

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
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SalesInvoiceDto = z.infer<typeof salesInvoiceSchema>;

export const salesInvoiceWithLinesSchema = salesInvoiceSchema.extend({
  lines: z.array(salesInvoiceLineSchema),
  totalAmount: moneySchema,
});
export type SalesInvoiceWithLinesDto = z.infer<typeof salesInvoiceWithLinesSchema>;

export const createSalesInvoiceLineSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema.optional(),
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
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSalesInvoiceDto = z.infer<typeof createSalesInvoiceSchema>;
