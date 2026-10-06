import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_METADATA_KEY = 'requiredPermissions';

/** Marks a route/controller as requiring one or more permission keys —
 * read by PermissionsGuard. Purely declarative; enforcement happens in
 * the guard, not here. */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);

export const ANY_PERMISSIONS_METADATA_KEY = 'requiredAnyPermissions';

/** Marks a route/controller as requiring AT LEAST ONE of the given
 * permission keys — for shared reference data several roles need (e.g.
 * the product catalogue: inventory staff, salespeople and buyers all pick
 * products). Read by PermissionsGuard, alongside RequirePermissions. */
export const RequireAnyPermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_METADATA_KEY, permissions);
