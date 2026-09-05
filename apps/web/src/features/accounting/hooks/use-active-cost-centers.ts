import { useMemo } from 'react';

import { useCostCenters } from '../api/cost-centers/queries';

/**
 * Module-level, not entity-scoped (see use-postable-accounts.ts's own comment for
 * why) — the journal-entry line editor is the only consumer today, but a future
 * report or picker can reuse this the same way usePostableAccounts() is shared.
 * Only active cost centers are offered as tagging targets, mirroring
 * usePostableAccounts()'s own isActive filter.
 */
export function useActiveCostCenters() {
  const { data: costCenters } = useCostCenters();
  return useMemo(() => (costCenters ?? []).filter((c) => c.isActive), [costCenters]);
}
