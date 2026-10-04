import { useEffect, useState, type ReactNode } from 'react';
import { DirectionProvider } from '@erp-platform/ui';

import { buildBrandTokens } from './palette';
import { useUiPreferences } from './ui-preferences-store';

function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return prefersDark;
}

/**
 * Applies the user's appearance preferences to <html>:
 *  - brand tokens derived from the single accent color (see palette.ts),
 *  - `.dark` class for dark mode,
 *  - `data-density` for comfortable/compact table rows.
 *
 * Also provides Radix's DirectionProvider with "rtl". Without it every Radix primitive
 * (Tabs, Select, DropdownMenu…) defaults to LTR and stamps dir="ltr" on its root — the
 * cause of the reversed tab order and left-to-right table in Settings › Branches.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const accent = useUiPreferences((s) => s.accent);
  const mode = useUiPreferences((s) => s.mode);
  const density = useUiPreferences((s) => s.density);
  const prefersDark = usePrefersDark();
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    const tokens = buildBrandTokens(accent, dark);
    for (const [name, value] of Object.entries(tokens)) {
      root.style.setProperty(`--${name}`, value);
    }
  }, [accent, dark]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'compact') root.setAttribute('data-density', 'compact');
    else root.removeAttribute('data-density');
  }, [density]);

  return <DirectionProvider dir="rtl">{children}</DirectionProvider>;
}
