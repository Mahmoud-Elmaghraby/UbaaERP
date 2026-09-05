import { useMemo } from 'react';

import { useChartOfAccounts } from '../api/chart-of-accounts/queries';

/**
 * Shared across Journal Entries (line account picker), Accounting Reports (general
 * ledger account picker), and Accounting Settings (default-account mapping selects) —
 * lives directly under features/accounting/hooks/ rather than nested in one entity's
 * own hooks/<entity>/ folder, since three different entity component folders need it
 * and the ESLint boundary rules only restrict components/<entity>/** importing another
 * entity's components/**, not hooks/.
 *
 * "Postable" mirrors ChartOfAccountsService.assertPostable(): a journal entry line (or
 * a default-account mapping target) can only reference a leaf (isGroup === false),
 * active account — group/folder accounts and inactive accounts are excluded here so
 * every picker in this module only ever offers valid choices.
 */
export function usePostableAccounts() {
  const { data: accounts } = useChartOfAccounts();
  return useMemo(
    () => (accounts ?? []).filter((a) => !a.isGroup && a.isActive),
    [accounts],
  );
}
