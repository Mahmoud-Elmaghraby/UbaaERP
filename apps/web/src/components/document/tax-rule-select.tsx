import { useTranslation } from 'react-i18next';
import type { TaxKindDto } from '@erp-platform/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useTaxRuleLookup } from '../../features/settings/queries';

const NONE = '__none__';

/** Picks one active tax rule of a kind (e.g. a party's default withholding), filtered by where it is used. */
export function TaxRuleSelect({
  kind,
  scope,
  value,
  onChange,
  noneLabel,
}: {
  kind: TaxKindDto;
  scope: 'sales' | 'purchases';
  value: string | null;
  onChange: (taxRuleId: string | null) => void;
  noneLabel?: string;
}) {
  const { t } = useTranslation();
  const { data } = useTaxRuleLookup();
  const rules = (data ?? []).filter(
    (rule) => rule.kind === kind && (rule.scope === 'both' || rule.scope === scope || rule.id === value),
  );
  // Nothing to choose from (taxes not in use) — callers hide their field with useTaxesInUse.
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel ?? t('taxes.none')}</SelectItem>
        {rules.map((rule) => (
          <SelectItem key={rule.id} value={rule.id}>
            {rule.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
