import type { ReactNode } from 'react';

import { useHasAnyPermission } from './permissions-context';

export interface CanProps {
  /**
   * A single permission key, or an array of permission keys (any one of
   * them grants access — OR semantics). Backed by the same permission
   * enforcement PermissionsGuard applies server-side (CLAUDE.md §2.8).
   *
   * IMPORTANT: this is a UX nicety only. It hides/shows UI — it is never
   * a substitute for the backend PlanFeatureGuard / PermissionsGuard
   * checks. Never rely on <Can> alone to protect a sensitive action.
   */
  permission: string | string[];
  children: ReactNode;
  /** Rendered instead of children when the permission check fails. */
  fallback?: ReactNode;
}

/**
 * Shared permission-gated visibility component (CLAUDE.md §9.1).
 * Every module's UI must use this instead of duplicating permission
 * visibility logic locally.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = useHasAnyPermission(required);
  return <>{allowed ? children : fallback}</>;
}
