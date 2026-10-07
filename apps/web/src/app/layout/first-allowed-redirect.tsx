import { Navigate } from 'react-router-dom';
import { useFeatureChecker, usePermissions } from '@erp-platform/ui';

import { hasAny } from '../../lib/permissions';
import { NAV_ITEMS } from './nav-items';

/**
 * Index route of a sidebar section: sends the user to the first sub-section
 * they are allowed to open (a store keeper without item-master rights lands
 * on stock, not on a page that would only show 403s).
 */
export function FirstAllowedRedirect({ section, fallback }: { section: string; fallback: string }) {
  const granted = usePermissions();
  const hasFeature = useFeatureChecker();
  const item = NAV_ITEMS.find((candidate) => candidate.to === section);
  const target = item?.children?.find(
    (child) => hasAny(granted, child.permission) && (!child.feature || hasFeature(child.feature)),
  );
  return <Navigate to={target?.to ?? fallback} replace />;
}
