import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeatureChecker, usePermissions } from '@erp-platform/ui';
import { APP_SETTINGS, APP_SETTING_KEYS } from '@erp-platform/contracts';

import { hasAny } from '../../../lib/permissions';
import { SETTINGS_SECTIONS, type SettingsSection } from './settings-sections';
import { settingI18nKey } from './app-settings-section';

export interface VisibleSection extends SettingsSection {
  title: string;
  hint: string;
  /** Lower-case text the search box matches: title, hint, keywords and the labels of its settings. */
  haystack: string;
}

/** The hub sections this user may see, with their words for display and search. */
export function useSettingsSections(): VisibleSection[] {
  const { t } = useTranslation();
  const granted = usePermissions();
  const hasFeature = useFeatureChecker();
  return useMemo(
    () =>
      SETTINGS_SECTIONS.filter((s) => (!s.permission || hasAny(granted, s.permission)) && (!s.feature || hasFeature(s.feature))).map((s) => {
        const title = t(`settings.hub.cards.${s.id}.title`);
        const hint = t(`settings.hub.cards.${s.id}.hint`);
        const settingWords = APP_SETTING_KEYS.filter((key) => APP_SETTINGS[key].section === s.id)
          .map((key) => `${t(`${settingI18nKey(key)}.label`)} ${t(`${settingI18nKey(key)}.hint`)}`)
          .join(' ');
        const keywords = t(`settings.hub.cards.${s.id}.keywords`, { defaultValue: '' });
        return { ...s, title, hint, haystack: `${title} ${hint} ${keywords} ${settingWords}`.toLowerCase() };
      }),
    [t, granted, hasFeature],
  );
}

/** Every word typed must appear somewhere in the section's words. */
export function matchesSearch(section: VisibleSection, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => section.haystack.includes(word));
}
