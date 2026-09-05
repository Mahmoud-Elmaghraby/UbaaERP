import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountingSettingsDto, UpdateAccountingSettingsDto } from '@erp-platform/contracts';

import { apiGet, apiPatch } from '../../../../lib/api-client';

const KEY = ['accounting-settings'];

/** GET+PATCH singleton — same shape as Sales' useEtaCredentials/useTenantSettings. */
export function useAccountingSettings() {
  return useQuery({ queryKey: KEY, queryFn: () => apiGet<AccountingSettingsDto>('/accounting-settings') });
}

export function useUpdateAccountingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountingSettingsDto) =>
      apiPatch<AccountingSettingsDto>('/accounting-settings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
