import { useCallback, useState } from 'react';

import { useVariantLookupMap } from '../../features/inventory/api/products/queries';
import { useTaxRuleLookup } from '../../features/settings/queries';
import { defaultLineTaxRuleIds, type TaxScope } from './use-document-taxes';

export interface LineTaxesController {
  scope: TaxScope;
  /** The rules on a line: what the user picked, else the defaults (product VAT + party withholding). */
  valueFor: (lineKey: string, productVariantId: string) => string[];
  onChange: (lineKey: string, taxRuleIds: string[]) => void;
}

/**
 * Per-line tax choice for a document form. Lines start with the defaults
 * and every line sends its rules explicitly, so the saved invoice is exactly
 * what the preview showed.
 */
export function useLineTaxes(scope: TaxScope, partyWithholdingRuleId: string | null | undefined): LineTaxesController {
  const variants = useVariantLookupMap();
  const { data: rules } = useTaxRuleLookup();
  const [chosen, setChosen] = useState<Record<string, string[]>>({});

  const valueFor = useCallback(
    (lineKey: string, productVariantId: string) =>
      chosen[lineKey] ??
      defaultLineTaxRuleIds(rules ?? [], scope, variants.get(productVariantId)?.taxRuleId, partyWithholdingRuleId),
    [chosen, rules, scope, variants, partyWithholdingRuleId],
  );
  const onChange = useCallback((lineKey: string, taxRuleIds: string[]) => {
    setChosen((current) => ({ ...current, [lineKey]: taxRuleIds }));
  }, []);

  return { scope, valueFor, onChange };
}
