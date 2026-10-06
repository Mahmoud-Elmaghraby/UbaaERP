import * as React from 'react';

/**
 * Client-side mirror of PlanFeatureGuard's own two-layer check (apps/api
 * shared/auth/plan-feature.guard.ts): `features` is the tenant's Plan
 * ceiling (Layer 1), `disabledFeatures` is what the tenant has turned off
 * for themselves (Layer 2 — Settings → Modules). Both arrays come
 * straight from the decoded JWT access token, same "hint only, never
 * enforcement" treatment as PermissionsContext right above this file —
 * see that file's own comment for why libs/ui never touches apps/web's
 * auth store directly. A feature key here is one of apps/api's
 * FEATURE_KEYS values (shared/plans/feature-catalog.ts) — passed as a
 * plain string, same convention permission keys already use with
 * useHasPermission()/<Can>.
 */
export interface FeaturesContextValue {
  /** Feature keys granted by the tenant's Plan (Layer 1 ceiling). */
  features: string[];
  /** Feature keys the tenant has explicitly turned off (Layer 2). */
  disabledFeatures: string[];
}

const FeaturesContext = React.createContext<FeaturesContextValue>({
  features: [],
  disabledFeatures: [],
});

export interface FeaturesProviderProps extends FeaturesContextValue {
  children: React.ReactNode;
}

export function FeaturesProvider({ features, disabledFeatures, children }: FeaturesProviderProps) {
  const value = React.useMemo(() => ({ features, disabledFeatures }), [features, disabledFeatures]);
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

/**
 * True when a feature is both granted by the tenant's Plan AND not
 * turned off by the tenant themselves — the same combination
 * PlanFeatureGuard/FeatureAvailabilityService compute server-side. A UX
 * hint only: the server is always the real enforcement point (see
 * FeaturesContextValue's own comment).
 */
export function useHasFeature(featureKey: string): boolean {
  const { features, disabledFeatures } = React.useContext(FeaturesContext);
  return features.includes(featureKey) && !disabledFeatures.includes(featureKey);
}

/**
 * Same check as useHasFeature, as a function — for filtering lists (menus, search
 * results) where calling a hook per item isn't possible.
 */
export function useFeatureChecker(): (featureKey: string) => boolean {
  const { features, disabledFeatures } = React.useContext(FeaturesContext);
  return React.useCallback(
    (featureKey: string) => features.includes(featureKey) && !disabledFeatures.includes(featureKey),
    [features, disabledFeatures],
  );
}
