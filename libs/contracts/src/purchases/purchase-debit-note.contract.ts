import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';
import { documentTotalsSchema, lineTaxSchema } from '../settings/tax-rule.contract';

/**
 * Purchase debit note (إشعار خصم) — issued automatically when a purchase return of already
 * invoiced goods is confirmed (PurchaseDebitNotesService.issueForReturn). Read-only.
 */
export const purchaseDebitNoteLineSchema = z.object({
  id: z.string().uuid(),
  purchaseReturnLineId: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  /** Base units covered (the invoiced part of the returned quantity). */
  baseQuantity: z.number().positive(),
  netAmount: moneySchema,
  taxes: z.array(lineTaxSchema),
});
export type PurchaseDebitNoteLineDto = z.infer<typeof purchaseDebitNoteLineSchema>;

export const purchaseDebitNoteSchema = z.object({
  id: z.string().uuid(),
  debitNoteNumber: z.string().min(1),
  purchaseReturnId: z.string().uuid(),
  returnNumber: z.string(),
  supplierId: z.string().uuid(),
  debitNoteDate: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** net + table tax + VAT − withholding. */
  totalAmount: moneySchema,
  createdAt: z.coerce.date(),
});
export type PurchaseDebitNoteDto = z.infer<typeof purchaseDebitNoteSchema>;

export const purchaseDebitNoteWithLinesSchema = purchaseDebitNoteSchema.extend({
  lines: z.array(purchaseDebitNoteLineSchema),
  ...documentTotalsSchema.omit({ totalAmount: true }).shape,
});
export type PurchaseDebitNoteWithLinesDto = z.infer<typeof purchaseDebitNoteWithLinesSchema>;

export const purchaseDebitNotesQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  purchaseReturnId: z.string().uuid().optional(),
});
export type PurchaseDebitNotesQueryDto = z.infer<typeof purchaseDebitNotesQuerySchema>;
