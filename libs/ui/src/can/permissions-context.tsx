import * as React from 'react';

/**
 * Source of truth: the permission KEY strings issued by the Users &
 * Permissions module (see libs/contracts/src/users-permissions/permission.contract.ts),
 * e.g. "settings.manage", "users.manage", "roles.manage", "audit_logs.view".
 *
 * This context intentionally does NOT know about apps/web's Zustand auth
 * store, React Query, or the API client. libs/ui must stay free of
 * app-level imports (see .eslintrc.cjs boundaries/element-types: libs/*
 * must not import from apps/*). apps/web is responsible for reading the
 * current user's permissions (decoded from the JWT access token) and
 * feeding them into <PermissionsProvider>.
 */
export interface PermissionsContextValue {
  /** Permission keys granted to the current user. */
  permissions: string[];
}

const PermissionsContext = React.createContext<PermissionsContextValue>({
  permissions: [],
});

export interface PermissionsProviderProps extends PermissionsContextValue {
  children: React.ReactNode;
}

export function PermissionsProvider({ permissions, children }: PermissionsProviderProps) {
  const value = React.useMemo(() => ({ permissions }), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): string[] {
  return React.useContext(PermissionsContext).permissions;
}

export function useHasPermission(permission: string): boolean {
  const permissions = usePermissions();
  return permissions.includes(permission);
}

export function useHasAnyPermission(required: string[]): boolean {
  const permissions = usePermissions();
  if (required.length === 0) {
    return true;
  }
  return required.some((permission) => permissions.includes(permission));
}
