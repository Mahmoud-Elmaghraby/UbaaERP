import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';

// Arabic-only, RTL, no direction-switching logic (CLAUDE.md §9.1) — but
// built through translation keys from day one (i18n-ready) so adding a
// second language later is a new locale file, not a rewrite of every
// component's inline strings.
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar } },
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
