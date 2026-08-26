import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsGuard } from './permissions.guard';

function mustGetAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set. The API cannot issue or verify access tokens without it.');
  }
  return secret;
}

/**
 * Global module (mirrors TenancyModule's pattern): JwtStrategy and
 * PermissionsGuard are needed by every module with protected routes, not
 * just Users & Permissions, so they're provided once here.
 *
 * This JwtModule issues/verifies ACCESS tokens only. Refresh tokens are
 * NOT JWTs — they're opaque random values, stored as a SHA-256 hash in
 * the tenant's refresh_tokens table (see AuthService), so they can be
 * looked up, expired, and individually revoked without needing a second
 * signing secret or any JWT-verification step.
 */
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: mustGetAccessSecret(),
      signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    }),
  ],
  providers: [JwtStrategy, PermissionsGuard],
  exports: [JwtModule, PermissionsGuard],
})
export class AuthInfraModule {}
