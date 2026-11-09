import type { ReactNode } from 'react';
import { useHasFeature } from '@erp-platform/ui';

/** Renders its children only while the feature is on (plan + the tenant's own switch). UX only. */
export function WhenFeature({ feature, children }: { feature: string; children: ReactNode }) {
  return useHasFeature(feature) ? <>{children}</> : null;
}
