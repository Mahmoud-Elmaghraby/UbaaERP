import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  changePasswordSchema,
  confirmTotpSchema,
  createUserSchema,
  disableTotpSchema,
  setBranchAccessSchema,
  setManagerSchema,
  updateUserSchema,
  userSchema,
  type ChangePasswordDto,
  type ConfirmTotpDto,
  type CreateUserDto,
  type DisableTotpDto,
  type SetBranchAccessDto,
  type SetManagerDto,
  type TotpEnabledResponseDto,
  type TotpSetupResponseDto,
  type TotpStatusResponseDto,
  type UpdateUserDto,
  type UserDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { UsersService } from '../application/services/users.service';
import { UserBranchAccessService } from '../application/services/user-branch-access.service';
import { ApprovalChainsService } from '../application/services/approval-chains.service';
import { AccountAccessService } from '../application/services/account-access.service';
import { TwoFactorService } from '../application/services/two-factor.service';

// Every Zod pipe below is bound directly to @Body(), not via a
// method-level @UsePipes() — see auth.controller.ts's class comment for
// why (a method-level pipe validates every parameter, not just the body).
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly branchAccess: UserBranchAccessService,
    private readonly approvalChains: ApprovalChainsService,
    private readonly accountAccess: AccountAccessService,
    private readonly twoFactor: TwoFactorService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions('users.manage')
  async list(@CurrentTenantSchema() schema: string): Promise<UserDto[]> {
    const db = this.connections.getClient(schema);
    const users = await this.service.list(db);
    return users.map((u) => userSchema.parse(u));
  }

  @Get(':id')
  @RequirePermissions('users.manage')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<UserDto> {
    const db = this.connections.getClient(schema);
    const user = await this.service.getById(db, id);
    return userSchema.parse(user);
  }

  @Post()
  @RequirePermissions('users.manage')
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserDto,
  ): Promise<UserDto> {
    const db = this.connections.getClient(schema);
    const user = await this.service.create(db, body, actor.sub);
    return userSchema.parse(user);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
  ): Promise<UserDto> {
    const db = this.connections.getClient(schema);
    const user = await this.service.update(db, id, body, actor.sub);
    return userSchema.parse(user);
  }

  // Any authenticated user may change their own password — no
  // users.manage requirement, only JwtAuthGuard (class-level).
  @Post('me/change-password')
  async changeOwnPassword(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.changeOwnPassword(db, actor.sub, body.currentPassword, body.newPassword);
  }

  @Get(':id/branch-access')
  @RequirePermissions('users.manage')
  async getBranchAccess(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<{ branchIds: string[] }> {
    const db = this.connections.getClient(schema);
    const branchIds = await this.branchAccess.listForUser(db, id);
    return { branchIds };
  }

  @Patch(':id/branch-access')
  @RequirePermissions('users.manage')
  async setBranchAccess(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setBranchAccessSchema)) body: SetBranchAccessDto,
  ): Promise<{ branchIds: string[] }> {
    const db = this.connections.getClient(schema);
    await this.branchAccess.setForUser(db, id, body.branchIds, actor.sub);
    return { branchIds: body.branchIds };
  }

  // Sends an invite token so a user can set their OWN password,
  // replacing the one the admin had to type to satisfy POST /users's
  // schema (createUserSchema.password is still required — see
  // AccountAccessService.sendInvite()'s comment for why this is
  // additive rather than a breaking change to that endpoint).
  @Post(':id/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('users.manage')
  async invite(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.accountAccess.sendInvite(db, id, actor.sub);
  }

  // Force-logout: revoke every refresh token currently issued to a
  // user. Deliberately separate from the isActive toggle in update()
  // (which already does this automatically on deactivation, per
  // UsersService.update()'s own comment) — this lets an Owner kick a
  // user's active sessions without deactivating their account at all
  // (e.g. "I think this laptop was stolen but the employee still
  // works here").
  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('users.manage')
  async revokeSessions(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.revokeSessions(db, id, actor.sub);
  }

  // Self-service "log out everywhere" — any authenticated user, no
  // users.manage requirement, same reasoning as me/change-password
  // above: a user must always be able to act on their own session
  // security without depending on an admin.
  @Post('me/revoke-sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOwnSessions(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.revokeSessions(db, actor.sub, actor.sub);
  }

  // --- Optional TOTP two-factor authentication (self-service only —
  // no admin-managed equivalent: 2FA is a credential a user proves
  // possession of, the same category as their password, not something
  // an Owner can set on someone else's behalf). See TwoFactorService's
  // class comment for the two-step setup/confirm design. ---------------

  // The only TOTP state ever exposed to the frontend — never the secret,
  // pending or otherwise (see TwoFactorService.getStatus()'s own
  // comment). Multi-segment path, so this doesn't collide with the
  // single-segment @Get(':id') above regardless of registration order.
  @Get('me/2fa/status')
  async getTwoFactorStatus(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<TotpStatusResponseDto> {
    const db = this.connections.getClient(schema);
    return this.twoFactor.getStatus(db, actor.sub);
  }

  @Post('me/2fa/setup')
  async setupTwoFactor(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
  ): Promise<TotpSetupResponseDto> {
    const db = this.connections.getClient(schema);
    const user = await this.service.getById(db, actor.sub);
    return this.twoFactor.initiateSetup(db, actor.sub, user.email);
  }

  @Post('me/2fa/confirm')
  async confirmTwoFactor(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Body(new ZodValidationPipe(confirmTotpSchema)) body: ConfirmTotpDto,
  ): Promise<TotpEnabledResponseDto> {
    const db = this.connections.getClient(schema);
    return this.twoFactor.confirmSetup(db, actor.sub, body.code);
  }

  @Post('me/2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTwoFactor(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Body(new ZodValidationPipe(disableTotpSchema)) body: DisableTotpDto,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.twoFactor.disable(db, actor.sub, body.password);
  }

  @Get(':id/manager')
  @RequirePermissions('users.manage')
  async getManager(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<{ managerId: string | null }> {
    const db = this.connections.getClient(schema);
    const managerId = await this.approvalChains.getManagerId(db, id);
    return { managerId };
  }

  @Patch(':id/manager')
  @RequirePermissions('users.manage')
  async setManager(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setManagerSchema)) body: SetManagerDto,
  ): Promise<{ managerId: string | null }> {
    const db = this.connections.getClient(schema);
    await this.approvalChains.setManager(db, id, body.managerId, actor.sub);
    return { managerId: body.managerId };
  }
}
