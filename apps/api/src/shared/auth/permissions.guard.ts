import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload } from './jwt-payload.type';
import { ANY_PERMISSIONS_METADATA_KEY, PERMISSIONS_METADATA_KEY } from './require-permissions.decorator';

/**
 * Backend permission enforcement — the actual mechanism behind
 * CLAUDE.md §2.8's spirit ("never rely on frontend-only hiding"),
 * applied to RBAC rather than plan-feature gating. Checks the JWT
 * payload's baked-in permissions array against @RequirePermissions(...)
 * on the route. Must run after JwtAuthGuard (needs request.user already
 * populated by it).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAny = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const hasAllRule = Boolean(required && required.length > 0);
    const hasAnyRule = Boolean(requiredAny && requiredAny.length > 0);
    if (!hasAllRule && !hasAnyRule) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const userPermissions = request.user?.permissions ?? [];
    if (hasAllRule && !required.every((permission) => userPermissions.includes(permission))) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}.`);
    }
    if (hasAnyRule && !requiredAny.some((permission) => userPermissions.includes(permission))) {
      throw new ForbiddenException(`Requires one of the permission(s): ${requiredAny.join(', ')}.`);
    }
    return true;
  }
}
