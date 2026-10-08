import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  cancelTreasuryVoucherSchema,
  createTreasuryVoucherSchema,
  treasuryVoucherQuerySchema,
  type CancelTreasuryVoucherDto,
  type CreateTreasuryVoucherDto,
  type TreasuryVoucherDto,
  type TreasuryVoucherQueryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TreasuryVouchersService } from '../application/treasury-vouchers.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('treasury.vouchers.manage')
@Controller('treasury-vouchers')
export class TreasuryVouchersController {
  constructor(
    private readonly service: TreasuryVouchersService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission('treasury.view', 'treasury.vouchers.manage')
  list(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(treasuryVoucherQuerySchema)) query: TreasuryVoucherQueryDto,
  ): Promise<TreasuryVoucherDto[]> {
    return this.service.list(this.connections.getClient(schema), query);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission('treasury.view', 'treasury.vouchers.manage')
  getById(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<TreasuryVoucherDto> {
    return this.service.getById(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createTreasuryVoucherSchema)) body: CreateTreasuryVoucherDto,
  ): Promise<TreasuryVoucherDto> {
    return this.service.create(this.connections.getClient(schema), body, { schema, actorUserId: user.sub });
  }

  @Post(':id/cancel')
  cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(cancelTreasuryVoucherSchema)) body: CancelTreasuryVoucherDto,
  ): Promise<TreasuryVoucherDto> {
    return this.service.cancel(this.connections.getClient(schema), id, body, { schema, actorUserId: user.sub });
  }
}
