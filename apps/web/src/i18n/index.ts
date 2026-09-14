import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import { installArZodErrorMap } from '../lib/zod-ar-error-map';

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

// Every Zod validation error across the whole app (react-hook-form +
// zodResolver, on every form) renders in Arabic from here on — see
// zod-ar-error-map.ts's own doc comment for why this lives here and why
// it's safe to call before i18next's init() promise has resolved (the
// `ar` resources above are passed inline, not loaded async, so t() already
// works synchronously by this point).
installArZodErrorMap();

export default i18n;
