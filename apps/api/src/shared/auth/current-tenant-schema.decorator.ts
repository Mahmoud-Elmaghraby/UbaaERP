import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from './jwt-payload.type';

/**
 * The real fix for the tenant-resolution gap flagged in
 * ../tenancy/tenant-schema.decorator.ts: reads the tenant schema from the
 * verified, signed JWT payload (set by JwtStrategy) instead of trusting a
 * client-supplied header. Only valid behind JwtAuthGuard — the schema is
 * embedded in the access token at login/refresh time (auth.service.ts)
 * and can't be forged by the client. The header-based decorator remains
 * in use only for the pre-auth AuthController routes (login/refresh),
 * where no JWT exists yet to read a schema from.
 */
export const CurrentTenantSchema = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtAccessPayload }>();
    return request.user.schema;
  },
);
