import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createRoleSchema,
  roleSchema,
  updateRoleSchema,
  type CreateRoleDto,
  type RoleDto,
  type UpdateRoleDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { RolesService } from '../application/services/roles.service';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('roles.manage')
export class RolesController {
  constructor(
    private readonly service: RolesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<RoleDto[]> {
    const db = this.connections.getClient(schema);
    const roles = await this.service.list(db);
    return roles.map((r) => roleSchema.parse(r));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<RoleDto> {
    const db = this.connections.getClient(schema);
    const role = await this.service.getById(db, id);
    return roleSchema.parse(role);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    // Pipe bound directly to @Body() — see auth.controller.ts's class
    // comment for why a method-level @UsePipes() is wrong here.
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleDto,
  ): Promise<RoleDto> {
    const db = this.connections.getClient(schema);
    const role = await this.service.create(db, body, user.sub);
    return roleSchema.parse(role);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleDto,
  ): Promise<RoleDto> {
    const db = this.connections.getClient(schema);
    const role = await this.service.update(db, id, body, user.sub);
    return roleSchema.parse(role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id, user.sub);
  }
}
