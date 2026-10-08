import type { Kysely } from 'kysely';
import { computeLineTaxes, type LineTaxResult, type TaxKind, type TaxRateInput } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { BusinessRuleError } from '../errors/domain-errors';

/**
 * Invoice taxes for every document that carries them (sales & purchase
 * invoices, credit notes) — the one place that turns "which tax rules does
 * this line have" into stored, posted numbers. The arithmetic itself is the
 * shared-kernel engine; this file adds the tenant's rules (Settings'
 * tax_rules, read-only) and the defaults: the product's VAT rule and the
 * party's withholding rule.
 */

export type TaxScope = 'sales' | 'purchases';

export * from './line-tax-snapshot';

export interface TaxableLineInput {
  productVariantId: string;
  /** Line amount after discounts (gross of VAT/table tax when pricesIncludeTax). */
  amountMinor: bigint;
  /** Explicit rules; undefined = the defaults (product VAT + party withholding); [] = untaxed. */
  taxRuleIds?: readonly string[];
}

interface RuleRow extends TaxRateInput {
  scope: string;
  isActive: boolean;
}

/**
 * Computes every line's taxes. Validates the rules: they must exist, be
 * active, be offered for this scope, and a line carries at most one VAT,
 * one table tax and one withholding rule (the ETA accepts one of each type
 * per line).
 */
export async function computeDocumentTaxes(
  db: Kysely<TenantDatabase>,
  input: {
    scope: TaxScope;
    lines: readonly TaxableLineInput[];
    partyWithholdingRuleId?: string | null;
    pricesIncludeTax?: boolean;
  },
): Promise<LineTaxResult[]> {
  const productRules = await productVatRules(
    db,
    input.lines.filter((line) => line.taxRuleIds === undefined).map((line) => line.productVariantId),
  );
  const wanted = input.lines.map((line) => {
    if (line.taxRuleIds !== undefined) return [...line.taxRuleIds];
    const ids: string[] = [];
    const vat = productRules.get(line.productVariantId);
    if (vat) ids.push(vat);
    if (input.partyWithholdingRuleId) ids.push(input.partyWithholdingRuleId);
    return ids;
  });
  const rules = await loadRules(db, [...new Set(wanted.flat())]);

  return input.lines.map((line, index) => {
    const explicit = line.taxRuleIds !== undefined;
    const lineRules: TaxRateInput[] = [];
    const seenKinds = new Set<TaxKind>();
    for (const id of wanted[index]!) {
      const rule = rules.get(id);
      const usable = rule && rule.isActive && (rule.scope === 'both' || rule.scope === input.scope);
      if (!usable) {
        // A default that no longer applies (inactive / other scope) is skipped; an explicit choice is an error.
        if (!explicit) continue;
        throw new BusinessRuleError(`Tax rule "${rule?.name ?? id}" cannot be used here.`, {
          code: 'TAX.RULE_NOT_USABLE',
          params: { name: rule?.name ?? id },
        });
      }
      if (seenKinds.has(rule.kind)) {
        throw new BusinessRuleError(`A line can carry only one tax of kind "${rule.kind}".`, {
          code: 'TAX.DUPLICATE_KIND',
          params: { kind: rule.kind },
        });
      }
      seenKinds.add(rule.kind);
      lineRules.push(rule);
    }
    return computeLineTaxes(line.amountMinor, lineRules, { pricesIncludeTax: input.pricesIncludeTax });
  });
}

async function loadRules(db: Kysely<TenantDatabase>, ids: string[]): Promise<Map<string, RuleRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('tax_rules')
    .select(['id', 'name', 'rate', 'kind', 'eta_type', 'eta_subtype', 'scope', 'is_active'])
    .where('id', 'in', ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        taxRuleId: row.id,
        name: row.name,
        rate: row.rate,
        kind: row.kind as TaxKind,
        etaType: row.eta_type,
        etaSubtype: row.eta_subtype,
        scope: row.scope,
        isActive: row.is_active,
      },
    ]),
  );
}

/** variant → its product's tax rule (Inventory's product master data, migration 0075). */
async function productVatRules(db: Kysely<TenantDatabase>, variantIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('product_variants')
    .innerJoin('products', 'products.id', 'product_variants.product_id')
    .select(['product_variants.id as id', 'products.tax_rule_id as tax_rule_id'])
    .where('product_variants.id', 'in', ids)
    .execute();
  return new Map(rows.filter((row) => row.tax_rule_id).map((row) => [row.id, row.tax_rule_id!]));
}
