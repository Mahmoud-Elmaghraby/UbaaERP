import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  itemCardSchema,
  lowStockRowSchema,
  stockValuationRowSchema,
  type ItemCardDto,
  type LowStockRowDto,
  type StockValuationRowDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { INVENTORY_PERMISSIONS as P, canViewCosts } from '../../../shared/auth/inventory-permissions';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { InventoryReportsService } from '../application/services/inventory-reports.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | undefined, name: string): string | null {
  if (!value) return null;
  if (!UUID.test(value)) throw new BadRequestException(`${name} must be a UUID.`);
  return value;
}

/** 'YYYY-MM-DD' → that day's local midnight; `endOfDay` gives the next midnight (exclusive bound). */
function optionalDay(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Dates must be YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) date.setDate(date.getDate() + 1);
  return date;
}

/** Inventory reports: item card (كارت الصنف), valuation (تقييم المخزون), low stock (تحت حد الطلب). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.reportsView)
@Controller('inventory-reports')
export class InventoryReportsController {
  constructor(
    private readonly service: InventoryReportsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('item-card')
  async itemCard(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Query('productVariantId') productVariantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ItemCardDto> {
    const variantId = optionalUuid(productVariantId, 'productVariantId');
    if (!variantId) throw new BadRequestException('productVariantId is required.');
    const card = await this.service.itemCard(this.connections.getClient(schema), variantId, {
      warehouseId: optionalUuid(warehouseId, 'warehouseId'),
      from: optionalDay(from),
      to: optionalDay(to, true),
    });
    const showCost = canViewCosts(user.permissions);
    return itemCardSchema.parse(
      showCost ? card : { ...card, movements: card.movements.map((movement) => ({ ...movement, unitCost: null })) },
    );
  }

  @Get('valuation')
  @RequirePermissions(P.reportsView, P.costsView)
  async valuation(
    @CurrentTenantSchema() schema: string,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StockValuationRowDto[]> {
    const rows = await this.service.valuation(
      this.connections.getClient(schema),
      optionalUuid(warehouseId, 'warehouseId'),
    );
    return rows.map((row) =>
      stockValuationRowSchema.parse({
        ...row,
        value: { amountMinorUnits: row.valueMinorUnits, currency: row.currency },
      }),
    );
  }

  @Get('low-stock')
  async lowStock(
    @CurrentTenantSchema() schema: string,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<LowStockRowDto[]> {
    const rows = await this.service.lowStock(
      this.connections.getClient(schema),
      optionalUuid(warehouseId, 'warehouseId'),
    );
    return rows.map((row) => lowStockRowSchema.parse(row));
  }
}
