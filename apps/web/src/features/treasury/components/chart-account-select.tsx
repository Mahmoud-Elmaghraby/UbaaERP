import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useHasFeature, useHasPermission } from '@erp-platform/ui';

import { usePostableAccounts } from '../../accounting/hooks/use-postable-accounts';
import { FEATURE_KEYS } from '../../../lib/feature-keys';

const NONE = '__none__';

/**
 * Optional link to a chart account — shown only when the Accounting module
 * is on and the user can see the chart; otherwise nothing renders and the
 * treasury / item works on its own (Accounting falls back to its mappings).
 */
export function ChartAccountSelect({
  value,
  onChange,
  hint,
}: {
  value: string | null | undefined;
  onChange: (accountId: string | null) => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const accountingOn = useHasFeature(FEATURE_KEYS.ACCOUNTING);
  const canSeeChart = useHasPermission('accounting.manage');
  if (!accountingOn || !canSeeChart) return null;
  return <AccountSelect value={value} onChange={onChange} label={t('treasury.chartAccount')} hint={hint} />;
}

function AccountSelect({
  value,
  onChange,
  label,
  hint,
}: {
  value: string | null | undefined;
  onChange: (accountId: string | null) => void;
  label: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const accounts = usePostableAccounts();
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('treasury.chartAccountNone')}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.code} — {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
