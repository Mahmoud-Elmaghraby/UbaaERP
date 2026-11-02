import { useTranslation } from 'react-i18next';
import { Combobox } from '@erp-platform/ui';
import type { ChartOfAccountDto } from '@erp-platform/contracts';

import { normalizeForSearch } from '../../../lib/search-normalize';
import { usePostableAccounts } from '../hooks/use-postable-accounts';

/** Code first, then name — what an accountant types. */
function searchAccounts(items: readonly ChartOfAccountDto[], query: string): ChartOfAccountDto[] {
  const needle = normalizeForSearch(query);
  if (!needle) return [...items];
  const byCode = items.filter((a) => a.code.startsWith(query.trim()));
  const byText = items.filter(
    (a) => !byCode.includes(a) && normalizeForSearch(`${a.code} ${a.name}`).includes(needle),
  );
  return [...byCode, ...byText];
}

/**
 * Searchable picker over the postable (leaf, active) accounts: type a code
 * or part of a name, Enter takes the best match. The ONE account picker for
 * journal lines, reports and settings.
 */
export function AccountPicker({
  value,
  onChange,
  accounts,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (accountId: string, account: ChartOfAccountDto) => void;
  /** Defaults to every postable account. */
  accounts?: readonly ChartOfAccountDto[];
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const { t } = useTranslation();
  const postable = usePostableAccounts();
  return (
    <Combobox
      items={accounts ?? postable}
      value={value}
      onValueChange={onChange}
      getValue={(a) => a.id}
      getLabel={(a) => `${a.code} — ${a.name}`}
      search={searchAccounts}
      renderItem={(a) => (
        <span className="flex min-w-0 gap-2">
          <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{a.code}</span>
          <span className="truncate">{a.name}</span>
        </span>
      )}
      placeholder={placeholder ?? t('accounting.accountPicker.placeholder')}
      searchPlaceholder={t('accounting.accountPicker.search')}
      emptyText={t('common.noResults')}
      maxResults={60}
      className={className}
      aria-label={ariaLabel ?? t('accounting.accountPicker.placeholder')}
    />
  );
}
