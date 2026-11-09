import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { posCashMovementSchema, type PosCashMovementDto, type PosCashMovementRowDto, type TreasuryVoucherDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TreasuryVouchersService } from '../application/treasury-vouchers.service';

/** Cash in / out of a POS drawer during its shift — used from the till, so a cashier's permission (migration 0113). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pos-drawer')
export class PosDrawerController {
  constructor(
    private readonly service: TreasuryVouchersService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get(':sessionId/movements')
  @RequirePermissions(S.posUse)
  list(@CurrentTenantSchema() schema: string, @Param('sessionId') sessionId: string): Promise<PosCashMovementRowDto[]> {
    return this.service.listForPosDrawer(this.connections.getClient(schema), sessionId);
  }

  @Get(':sessionId/options')
  @RequirePermissions(S.posUse)
  options(@CurrentTenantSchema() schema: string, @Param('sessionId') sessionId: string) {
    return this.service.posDrawerOptions(this.connections.getClient(schema), sessionId);
  }

  @Post(':sessionId/movements')
  @RequirePermissions(S.posUse)
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(posCashMovementSchema)) body: PosCashMovementDto,
  ): Promise<TreasuryVoucherDto> {
    return this.service.createForPosDrawer(this.connections.getClient(schema), sessionId, body, {
      schema,
      actorUserId: user.sub,
      permissions: user.permissions,
    });
  }
}
