import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  authTokensSchema,
  loginRequestSchema,
  refreshRequestSchema,
  type AuthTokensDto,
  type LoginRequestDto,
  type RefreshRequestDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AuthService } from '../application/services/auth.service';

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
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Post('login')
  async login(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequestDto,
  ): Promise<AuthTokensDto> {
    const db = this.connections.getClient(schema);
    const tokens = await this.authService.login(db, schema, body.email, body.password);
    return authTokensSchema.parse(tokens);
  }

  @Post('refresh')
  async refresh(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequestDto,
  ): Promise<AuthTokensDto> {
    const db = this.connections.getClient(schema);
    const tokens = await this.authService.refresh(db, schema, body.refreshToken);
    return authTokensSchema.parse(tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @TenantSchema() schema: string,
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequestDto,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.authService.logout(db, body.refreshToken);
  }
}
