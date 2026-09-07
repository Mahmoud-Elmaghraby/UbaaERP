import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  authTokensSchema,
  loginRequestSchema,
  mfaChallengeSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyTwoFactorSchema,
  type AuthTokensDto,
  type LoginRequestDto,
  type LoginResponseDto,
  type RequestPasswordResetDto,
  type ResetPasswordDto,
  type VerifyTwoFactorDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AuthService, type AuthTokens } from '../application/services/auth.service';
import { AccountAccessService } from '../application/services/account-access.service';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

// e2e tests exercise these endpoints many times per spec file (every test
// case logs in independently) from the same client "IP" — supertest's
// in-process requests all resolve to the same loopback address, so a
// handful of test files can trip the strict production limit below in
// seconds even though nothing resembling a real password-spray is
// happening. Jest sets NODE_ENV=test before any test file (and this
// module's decorators) ever load, so relaxing the limit here changes
// nothing about what actually ships to development/production.
const AUTH_THROTTLE_LIMIT = process.env.NODE_ENV === 'test' ? 1000 : 5;

/**
 * Pre-auth routes — no JwtAuthGuard here, since there's no token yet.
 * These are the ONLY endpoints in the whole API still using the header-
 * based @TenantSchema() (see that file's comment): before login, the
 * server has no signed JWT to read a schema from, and there is no global
 * cross-tenant user directory to resolve one from an email address alone
 * (CLAUDE.md §2.3: public schema holds only platform-level data, not
 * tenant user directories). Every OTHER protected route in the API uses
 * @CurrentTenantSchema() instead, sourced from the verified token.
 *
 * The Zod pipe on every route below is bound directly to @Body(), not via
 * a method-level @UsePipes() — a method-level pipe applies to EVERY
 * parameter of the handler, including @TenantSchema()'s plain string,
 * which then fails validation against an object schema before the real
 * body is even looked at. Found here via an actual HTTP smoke test
 * (login kept returning "Expected object, received string"), then swept
 * across every other controller with the same @UsePipes() pattern.
 *
 * ThrottlerGuard is applied class-wide (default 60 req/min from the
 * global ThrottlerModule config in app.module.ts) with a much
 * stricter override on login specifically (5/min per IP) — this is
 * the only meaningful defense against a scripted password-spray
 * against this endpoint, since there is deliberately no account
 * lockout (a lockout is itself a denial-of-service vector against a
 * known email). Failed attempts are also now audited — see
 * AuthService.login()'s own comment.
 *
 * Refresh-token transport: the refresh token never appears in a JSON
 * response or request body — it is set/read as an httpOnly, SameSite=Lax
 * cookie scoped to `/auth` (claude/settings-module-audit.md §2.2/Task 9).
 * httpOnly means client-side JavaScript cannot read it at all, closing
 * the XSS exposure the prior localStorage-based storage had. `secure`
 * is forced on in production (requires HTTPS) and left off in local dev
 * (plain HTTP), mirroring the existing CORS_ORIGIN dev/prod split in
 * main.ts. SameSite=Lax assumes the eventual production frontend and API
 * share a registrable domain (e.g. a reverse-proxied subpath, or a
 * cookie `domain` covering both subdomains) — CLAUDE.md §12 leaves
 * production hosting topology an open decision; if that decision ever
 * puts the frontend and API on genuinely different registrable domains,
 * this needs SameSite=None (+ Secure, and reconsidering third-party-
 * cookie restrictions some browsers now apply) instead. Flagging this
 * assumption explicitly rather than silently picking a topology.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountAccess: AccountAccessService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  async login(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const db = this.connections.getClient(schema);
    const result = await this.authService.login(db, schema, body.email, body.password);

    if ('mfaRequired' in result) {
      return mfaChallengeSchema.parse(result);
    }

    this.setRefreshCookie(res, result.refreshToken);
    return authTokensSchema.parse(this.toResponseBody(result));
  }

  // Second login step for an account with TOTP enabled — see
  // AuthService.verifyTwoFactor()'s own comment. Same strict throttle as
  // login: this is exactly as guessable-in-bulk as a password if it were
  // left unthrottled (a 6-digit TOTP code is only ~1M possibilities).
  @Post('login/verify-2fa')
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  async verifyTwoFactor(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(verifyTwoFactorSchema)) body: VerifyTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    const db = this.connections.getClient(schema);
    const tokens = await this.authService.verifyTwoFactor(db, schema, body.challengeToken, body.code);
    this.setRefreshCookie(res, tokens.refreshToken);
    return authTokensSchema.parse(this.toResponseBody(tokens));
  }

  @Post('refresh')
  async refresh(
    @TenantSchema() schema: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    const refreshToken = this.readRefreshCookie(req);
    const db = this.connections.getClient(schema);
    const tokens = await this.authService.refresh(db, schema, refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return authTokensSchema.parse(this.toResponseBody(tokens));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @TenantSchema() schema: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      const db = this.connections.getClient(schema);
      await this.authService.logout(db, refreshToken);
    }
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });
  }

  // Same strict throttle as login — an unauthenticated endpoint that
  // triggers an email send per request is exactly the kind of thing a
  // script could otherwise hammer to spam a mailbox or brute-force
  // enumerate accounts by response timing.
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  async forgotPassword(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) body: RequestPasswordResetDto,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    // Always 204, whether or not the email matched anything — see
    // AccountAccessService.requestPasswordReset()'s own comment on why.
    await this.accountAccess.requestPasswordReset(db, body.email);
  }

  // Deliberately handles BOTH "forgot password" and "accept an admin's
  // invite" tokens — see AccountAccessService.consumeToken()'s comment.
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  async resetPassword(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordDto,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.accountAccess.consumeToken(db, body.token, body.newPassword);
  }

  private readRefreshCookie(req: Request): string {
    const value = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!value) {
      // Mirrors AuthService's own "Invalid or expired refresh token."
      // message for a missing/garbage refresh token, via the same
      // AuthenticationError -> 401 path, by just handing an empty
      // string to AuthService.refresh() (findByHash then finds no
      // record and throws) — avoids a second error type for what is,
      // from the caller's perspective, the exact same failure mode.
      return '';
    }
    return value;
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // Scoped to /auth only — the refresh token is never needed by any
      // other route, so there's no reason to send it on every request.
      path: '/auth',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  /** AuthService still returns the raw refreshToken value (see its own
   * class comment on why that stays this layer's concern, not the
   * service's) — this strips it before the value is ever handed to
   * authTokensSchema.parse(), so it's structurally impossible for it to
   * leak into a JSON response body from here. */
  private toResponseBody(tokens: AuthTokens): { accessToken: string; user: AuthTokens['user'] } {
    return { accessToken: tokens.accessToken, user: tokens.user };
  }
}
