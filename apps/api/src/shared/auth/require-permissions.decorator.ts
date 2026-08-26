import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_METADATA_KEY = 'requiredPermissions';

/** Marks a route/controller as requiring one or more permission keys —
 * read by PermissionsGuard. Purely declarative; enforcement happens in
 * the guard, not here. */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
