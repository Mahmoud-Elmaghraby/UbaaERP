import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const salesChannelKindSchema = z.enum(['marketplace', 'direct']);
export type SalesChannelKindDto = z.infer<typeof salesChannelKindSchema>;

export const salesChannelSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kind: salesChannelKindSchema,
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  treasuryId: z.string().uuid().nullable(),
  treasuryName: z.string().nullable(),
  warehouseId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
});
export type SalesChannelDto = z.infer<typeof salesChannelSchema>;

export const saveSalesChannelSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  kind: salesChannelKindSchema,
  /** The platform as a customer (marketplace). */
  customerId: z.string().uuid().nullable().optional(),
  /** Where the platform's money sits until it reaches the bank (marketplace). */
  treasuryId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type SaveSalesChannelDto = z.infer<typeof saveSalesChannelSchema>;

/** One statement line: an order the platform paid, a refund of an earlier order, or a fee it kept. */
export const settlementLineKindSchema = z.enum(['order', 'refund', 'fee']);
export type SettlementLineKindDto = z.infer<typeof settlementLineKindSchema>;

export const settlementLineInputSchema = z.object({
  kind: settlementLineKindSchema,
  /** Platform order number (order / refund lines). */
  externalReference: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  /** Positive minor units; the kind gives the direction. */
  amountMinorUnits: z.string().regex(/^\d+$/).refine((v) => BigInt(v) > 0n, 'Must be positive'),
  /** Expense item of a fee line (commission, shipping, ads…). */
  categoryId: z.string().uuid().nullable().optional(),
});
export type SettlementLineInputDto = z.infer<typeof settlementLineInputSchema>;

export const saveChannelSettlementSchema = z.object({
  salesChannelId: z.string().uuid(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  statementReference: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(settlementLineInputSchema).min(1).max(5000),
});
export type SaveChannelSettlementDto = z.infer<typeof saveChannelSettlementSchema>;

export const settlementMatchSchema = z.enum(['matched', 'amount_mismatch', 'unmatched', 'already_paid', 'not_applicable']);
export type SettlementMatchDto = z.infer<typeof settlementMatchSchema>;

export const channelSettlementLineSchema = z.object({
  id: z.string().uuid(),
  lineNumber: z.number().int(),
  kind: settlementLineKindSchema,
  externalReference: z.string().nullable(),
  description: z.string().nullable(),
  amount: moneySchema,
  salesInvoiceId: z.string().uuid().nullable(),
  salesInvoiceNumber: z.string().nullable(),
  /** The invoice's total and what was still open on it (order lines). */
  invoiceTotal: moneySchema.nullable(),
  invoiceOutstanding: moneySchema.nullable(),
  match: settlementMatchSchema,
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
});
export type ChannelSettlementLineDto = z.infer<typeof channelSettlementLineSchema>;

export const channelSettlementSchema = z.object({
  id: z.string().uuid(),
  settlementNumber: z.string(),
  salesChannelId: z.string().uuid(),
  salesChannelName: z.string(),
  status: z.enum(['draft', 'posted', 'cancelled']),
  statementDate: z.string(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  statementReference: z.string().nullable(),
  currency: z.string(),
  ordersTotal: moneySchema,
  refundsTotal: moneySchema,
  feesTotal: moneySchema,
  /** orders − refunds − fees: what the platform wires. */
  netPayout: moneySchema,
  paymentReceivedId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  lines: z.array(channelSettlementLineSchema),
});
export type ChannelSettlementDto = z.infer<typeof channelSettlementSchema>;

export const channelSettlementSummarySchema = channelSettlementSchema.omit({ lines: true });
export type ChannelSettlementSummaryDto = z.infer<typeof channelSettlementSummarySchema>;

/** Orders of a channel that were invoiced but not (fully) paid by the platform yet. */
export const channelUnpaidOrderSchema = z.object({
  salesInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  externalReference: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  ageDays: z.number().int(),
  total: moneySchema,
  outstanding: moneySchema,
});
export type ChannelUnpaidOrderDto = z.infer<typeof channelUnpaidOrderSchema>;
