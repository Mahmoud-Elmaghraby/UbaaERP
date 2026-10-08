import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createTreasurySchema,
  treasuryStatementQuerySchema,
  updateTreasurySchema,
  type CreateTreasuryDto,
  type TreasuryDto,
  type TreasuryLookupDto,
  type TreasuryStatementDto,
  type TreasuryStatementQueryDto,
  type UpdateTreasuryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TreasuriesService } from '../application/treasuries.service';
import { TreasuryStatementService } from '../application/treasury-statement.service';

/**
 * Treasuries (cash boxes, banks, e-wallets). Core module, not plan-gated:
 * every business has a cash box. `lookup` is readable by anyone who records
 * a receipt or a payment.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('treasury.view')
@Controller('treasuries')
export class TreasuriesController {
  constructor(
    private readonly service: TreasuriesService,
    private readonly statements: TreasuryStatementService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<TreasuryDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Get('lookup')
  @RequirePermissions()
  @RequireAnyPermission('treasury.view', 'sales.manage', 'purchases.manage', 'accounting.manage')
  lookup(@CurrentTenantSchema() schema: string): Promise<TreasuryLookupDto[]> {
    return this.service.lookup(this.connections.getClient(schema));
  }

  @Get(':id')
  getById(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<TreasuryDto> {
    return this.service.getById(this.connections.getClient(schema), id);
  }

  @Get(':id/statement')
  statement(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(treasuryStatementQuerySchema)) query: TreasuryStatementQueryDto,
  ): Promise<TreasuryStatementDto> {
    return this.statements.getStatement(this.connections.getClient(schema), id, query);
  }

  @Post()
  @RequirePermissions('treasury.manage')
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createTreasurySchema)) body: CreateTreasuryDto,
  ): Promise<TreasuryDto> {
    return this.service.create(this.connections.getClient(schema), body, { schema, actorUserId: user.sub });
  }

  @Patch(':id')
  @RequirePermissions('treasury.manage')
  update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTreasurySchema)) body: UpdateTreasuryDto,
  ): Promise<TreasuryDto> {
    return this.service.update(this.connections.getClient(schema), id, body, { schema, actorUserId: user.sub });
  }

  @Delete(':id')
  @RequirePermissions('treasury.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
