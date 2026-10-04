import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ACCENT } from './palette';

export type ColorMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

interface UiPreferencesState {
  /**
   * Brand accent color. Per-browser for now; the plan is to also let a tenant admin
   * set a company-wide default from Settings later (claude/ui-redesign-plan.md) —
   * this store would then fall back to that value instead of DEFAULT_ACCENT.
   */
  accent: string;
  mode: ColorMode;
  density: Density;
  sidebarCollapsed: boolean;
  setAccent: (accent: string) => void;
  setMode: (mode: ColorMode) => void;
  setDensity: (density: Density) => void;
  toggleSidebar: () => void;
}

/**
 * Per-user UI preferences (appearance only — nothing security- or business-relevant).
 * The localStorage key is read once more by the tiny inline script in index.html to
 * apply dark mode/density before React mounts (avoids a flash); keep both in sync.
 */
export const useUiPreferences = create<UiPreferencesState>()(
  persist(
    (set) => ({
      accent: DEFAULT_ACCENT,
      mode: 'light',
      density: 'comfortable',
      sidebarCollapsed: false,
      setAccent: (accent) => set({ accent }),
      setMode: (mode) => set({ mode }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    { name: 'erp-ui-preferences' },
  ),
);
