import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { APP_SETTINGS, type AppSettingEntryDto, type AppSettingKey, type AppSettingValueOf } from '@erp-platform/contracts';

import { apiGet } from './api-client';

/** The settings hub's values (GET /app-settings), cached for the session; Settings' save refreshes it. */
export function useAppSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: () => apiGet<AppSettingEntryDto[]>('/app-settings'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Reads settings for the screens that apply them (POS, document editors). Until loaded, every
 * setting reads as its default — today's behaviour — so a screen never waits on it.
 */
export function useAppSetting() {
  const { data, isSuccess } = useAppSettingsQuery();
  const get = useCallback(
    <K extends AppSettingKey>(key: K): AppSettingValueOf<K> => {
      const entry = data?.find((e) => e.key === key);
      return (entry ? entry.value : APP_SETTINGS[key].default) as AppSettingValueOf<K>;
    },
    [data],
  );
  return { get, loaded: isSuccess };
}
