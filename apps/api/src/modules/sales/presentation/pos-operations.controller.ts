import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  holdPosCartSchema,
  posReturnSchema,
  type HoldPosCartDto,
  type PosHeldCartDto,
  type PosReturnDto,
  type PosReturnResultDto,
  type PosSaleForReturnDto,
  type PosSaleSummaryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PosOperationsService, type PosActor } from '../application/services/pos-operations.service';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';

/** The till beyond checkout: receipts, returns on a receipt, parked sales (migration 0113). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.POS)
@Controller('pos')
export class PosOperationsController {
  constructor(
    private readonly service: PosOperationsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('sessions/:id/sales')
  @RequirePermissions(S.posUse)
  sessionSales(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PosSaleSummaryDto[]> {
    return this.service.sessionSales(this.connections.getClient(schema), id);
  }

  @Get('sales/lookup')
  @RequirePermissions(S.posUse)
  lookup(@CurrentTenantSchema() schema: string, @Query('number') number: string): Promise<PosSaleForReturnDto> {
    return this.service.saleForReturn(this.connections.getClient(schema), number ?? '');
  }

  @Post('sessions/:id/returns')
  @RequirePermissions(S.posUse)
  processReturn(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(posReturnSchema)) body: PosReturnDto,
  ): Promise<PosReturnResultDto> {
    return this.service.processReturn(this.connections.getClient(schema), id, body, actor(schema, user));
  }

  @Get('sessions/:id/held-carts')
  @RequirePermissions(S.posUse)
  heldCarts(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PosHeldCartDto[]> {
    return this.service.heldCarts(this.connections.getClient(schema), id);
  }

  @Post('sessions/:id/held-carts')
  @RequirePermissions(S.posUse)
  hold(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(holdPosCartSchema)) body: HoldPosCartDto,
  ): Promise<PosHeldCartDto> {
    return this.service.holdCart(this.connections.getClient(schema), id, body, actor(schema, user));
  }

  /** Resume (the till loads it first) or discard a parked sale. */
  @Delete('held-carts/:cartId')
  @RequirePermissions(S.posUse)
  @HttpCode(HttpStatus.NO_CONTENT)
  async take(@CurrentTenantSchema() schema: string, @Param('cartId') cartId: string): Promise<void> {
    await this.service.takeHeldCart(this.connections.getClient(schema), cartId);
  }
}

function actor(schema: string, user: JwtAccessPayload): PosActor {
  return { schema, userId: user.sub, permissions: user.permissions };
}
