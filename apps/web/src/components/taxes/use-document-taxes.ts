import { useMemo } from 'react';
import type { TaxRuleDto } from '@erp-platform/contracts';
import { computeLineTaxes, sumTaxBreakdowns, type TaxBreakdown, type TaxRateInput } from '@erp-platform/shared-kernel';

import { useTaxRuleLookup } from '../../features/settings/queries';

export type TaxScope = 'sales' | 'purchases';

export function usableForScope(rule: TaxRuleDto, scope: TaxScope): boolean {
  return rule.isActive && (rule.scope === 'both' || rule.scope === scope);
}

/** The rules a new line starts with — the same defaults the server applies: product VAT + party withholding. */
export function defaultLineTaxRuleIds(
  rules: readonly TaxRuleDto[],
  scope: TaxScope,
  productTaxRuleId: string | null | undefined,
  partyWithholdingRuleId: string | null | undefined,
): string[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  return [productTaxRuleId, partyWithholdingRuleId].filter((id): id is string => {
    const rule = id ? byId.get(id) : undefined;
    return Boolean(rule && usableForScope(rule, scope));
  });
}

export interface TaxPreviewLine {
  /** Line amount in minor units (null = incomplete line, ignored). */
  amountMinor: string | null;
  taxRuleIds: readonly string[];
}

/**
 * Live totals while typing, computed with the SAME shared-kernel engine the
 * server uses when it saves the document (so what the user sees is what is
 * posted). Values are minor-unit strings.
 */
export function useDocumentTaxPreview(lines: readonly TaxPreviewLine[], pricesIncludeTax = false) {
  const { data: rules } = useTaxRuleLookup();
  return useMemo(() => {
    const byId = new Map((rules ?? []).map((rule) => [rule.id, rule]));
    const breakdowns: TaxBreakdown[] = [];
    for (const line of lines) {
      if (line.amountMinor === null) continue;
      const rates: TaxRateInput[] = line.taxRuleIds
        .map((id) => byId.get(id))
        .filter((rule): rule is TaxRuleDto => Boolean(rule))
        .map((rule) => ({ taxRuleId: rule.id, name: rule.name, kind: rule.kind, rate: String(rule.rate) }));
      breakdowns.push(computeLineTaxes(BigInt(line.amountMinor), rates, { pricesIncludeTax }));
    }
    const sum = sumTaxBreakdowns(breakdowns);
    return {
      net: sum.net.toString(),
      table: sum.table.toString(),
      vat: sum.vat.toString(),
      withholding: sum.withholding.toString(),
      total: sum.total.toString(),
      hasLines: breakdowns.length > 0,
    };
  }, [lines, rules, pricesIncludeTax]);
}
