import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  changePasswordSchema,
  createUserSchema,
  setBranchAccessSchema,
  setManagerSchema,
  updateUserSchema,
  userSchema,
  type ChangePasswordDto,
  type CreateUserDto,
  type SetBranchAccessDto,
  type SetManagerDto,
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
