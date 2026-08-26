import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from './jwt-payload.type';

/** The authenticated user's JWT payload — only valid behind JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtAccessPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtAccessPayload }>();
    return request.user;
  },
);
