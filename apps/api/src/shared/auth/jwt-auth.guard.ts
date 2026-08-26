import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects a route with the 'jwt' passport strategy (JwtStrategy). Apply
 * before PermissionsGuard on any route that also needs a permission
 * check — PermissionsGuard reads request.user, which only exists once
 * this guard has run. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
