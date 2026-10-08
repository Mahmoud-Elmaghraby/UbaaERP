import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { runtimeInfoSchema, type RuntimeInfoDto } from '@erp-platform/contracts';

import { apiGet } from './api-client';

export const runtimeInfoQueryKey = ['runtime-info'] as const;

const CLOUD: RuntimeInfoDto = { mode: 'cloud' };

/**
 * Which deployment the web app is talking to (GET /runtime). Anything that
 * goes wrong (an older API without the route, a network blip) falls back to
 * "cloud", i.e. today's behavior — the desktop extras only ever switch on
 * when the API positively says so.
 */
export function useRuntimeInfo() {
  return useQuery({
    queryKey: runtimeInfoQueryKey,
    queryFn: async (): Promise<RuntimeInfoDto> => {
      try {
        const parsed = runtimeInfoSchema.safeParse(await apiGet<unknown>('/runtime'));
        return parsed.success ? parsed.data : CLOUD;
      } catch {
        return CLOUD;
      }
    },
    staleTime: 60_000,
  });
}

/**
 * Pre-login forms (login, forgot password) ask for the tenant only in the
 * cloud. On the desktop build there is exactly one tenant (CLAUDE.md §2.3):
 * this fills the form's `tenantSchema` field from the API and tells the
 * form to hide it.
 */
export function useFixedTenantSchema<T extends FieldValues & { tenantSchema: string }>(
  form: UseFormReturn<T>,
): { hideTenantField: boolean; needsSetup: boolean; ready: boolean } {
  const { data, isPending } = useRuntimeInfo();
  const desktop = data?.mode === 'desktop' ? data : null;

  useEffect(() => {
    if (desktop) {
      form.setValue('tenantSchema' as Path<T>, desktop.tenantSchema as PathValue<T, Path<T>>);
    }
  }, [desktop, form]);

  return { hideTenantField: desktop !== null, needsSetup: desktop?.needsSetup ?? false, ready: !isPending };
}
