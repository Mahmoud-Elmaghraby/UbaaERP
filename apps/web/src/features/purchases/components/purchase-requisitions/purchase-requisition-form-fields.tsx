import { useTranslation } from 'react-i18next';
import { FormControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useBranches } from '../../../settings/queries';

export const NO_BRANCH = '__none__';

/**
 * Local copy of Inventory's BranchField (warehouse-form-fields.tsx) — deliberately not
 * imported from there. Purchases must not reach into another module's components/ folder
 * (same "each entity/module owns its own" boundary spirit ESLint already enforces within
 * Inventory); useBranches itself comes from Settings, the actual shared source.
 */
export function BranchField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: branches } = useBranches();
  return (
    <Select onValueChange={(next) => onChange(next === NO_BRANCH ? null : next)} value={value ?? NO_BRANCH}>
      <FormControl>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={NO_BRANCH}>{t('purchases.purchaseRequisitions.noBranch')}</SelectItem>
        {(branches ?? []).map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
