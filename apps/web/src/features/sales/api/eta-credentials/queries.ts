import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EtaCredentialsDto, UpdateEtaCredentialsDto } from '@erp-platform/contracts';

import { apiGet, apiPatch } from '../../../../lib/api-client';

const KEY = ['eta-credentials'];

/** Settings-shaped singleton (GET + PATCH only, no list/create/delete) — same shape as
 * Settings' own useTenantSettings()/useUpdateTenantSettings(), except this singleton is
 * owned by the Sales module (EtaCredentialsController reuses 'sales.manage', not a
 * Settings permission) so it lives in Sales' own api/ folder rather than Settings'. */
export function useEtaCredentials() {
  return useQuery({ queryKey: KEY, queryFn: () => apiGet<EtaCredentialsDto>('/eta-credentials') });
}

export function useUpdateEtaCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEtaCredentialsDto) => apiPatch<EtaCredentialsDto>('/eta-credentials', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
