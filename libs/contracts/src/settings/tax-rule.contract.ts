import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

/** How the invoice tax engine applies a rule (libs/shared-kernel tax-calculator). */
export const taxKindSchema = z.enum(['vat', 'table', 'withholding']);
export type TaxKindDto = z.infer<typeof taxKindSchema>;

/** Which documents offer the rule. */
export const taxRuleScopeSchema = z.enum(['sales', 'purchases', 'both']);
export type TaxRuleScopeDto = z.infer<typeof taxRuleScopeSchema>;

/** ETA tax type (T1…T20) and subtype codes (V009, W010 …). */
const etaCode = z.string().trim().max(10).nullable();

export const taxRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isActive: z.boolean(),
  kind: taxKindSchema,
  etaType: etaCode,
  etaSubtype: etaCode,
  scope: taxRuleScopeSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TaxRuleDto = z.infer<typeof taxRuleSchema>;

export const createTaxRuleSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0).max(100),
  isActive: z.boolean().optional(),
  kind: taxKindSchema.optional(),
  etaType: etaCode.optional(),
  etaSubtype: etaCode.optional(),
  scope: taxRuleScopeSchema.optional(),
});
export type CreateTaxRuleDto = z.infer<typeof createTaxRuleSchema>;

export const updateTaxRuleSchema = createTaxRuleSchema.partial();
export type UpdateTaxRuleDto = z.infer<typeof updateTaxRuleSchema>;

/** One tax on a document line, as stored when the document was created (amounts in minor units). */
export const lineTaxSchema = z.object({
  taxRuleId: z.string().uuid(),
  name: z.string(),
  kind: taxKindSchema,
  rate: z.string(),
  etaType: z.string().nullable(),
  etaSubtype: z.string().nullable(),
  baseMinorUnits: z.string(),
  amountMinorUnits: z.string(),
});
export type LineTaxDto = z.infer<typeof lineTaxSchema>;

/** Rules chosen for a line: omitted = defaults (product VAT + party withholding), [] = untaxed. */
export const lineTaxRuleIdsSchema = z.array(z.string().uuid()).max(5).optional();

/** Document totals with the tax breakdown (migration 0092). */
export const documentTotalsSchema = z.object({
  netAmount: moneySchema,
  tableTaxAmount: moneySchema,
  vatAmount: moneySchema,
  withholdingAmount: moneySchema,
  /** net + table tax + VAT − withholding. */
  totalAmount: moneySchema,
});
export type DocumentTotalsDto = z.infer<typeof documentTotalsSchema>;
