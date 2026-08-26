import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload } from './jwt-payload.type';
import { PERMISSIONS_METADATA_KEY } from './require-permissions.decorator';

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
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const userPermissions = request.user?.permissions ?? [];
    const hasAll = required.every((permission) => userPermissions.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}.`);
    }
    return true;
  }
}
