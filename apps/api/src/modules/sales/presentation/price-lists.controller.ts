import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards, type Type } from '@nestjs/common';
import {
  savePriceListSchema,
  type PriceListDto,
  type PriceListKindDto,
  type PriceListSummaryDto,
  type SavePriceListDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PriceListsService } from '../application/services/price-lists.service';

/**
 * One CRUD controller per price-list kind — same endpoints, its own path and permission:
 * sales lists at /price-lists (sales.manage), supplier lists at /purchase-price-lists
 * (purchases.manage). No PlanFeatureGuard: master data, like customers and suppliers.
 */
function priceListsController(path: string, permission: string, kind: PriceListKindDto): Type<unknown> {
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(permission)
  @Controller(path)
  class PriceListsKindController {
    constructor(
      readonly service: PriceListsService,
      readonly connections: TenantConnectionManager,
    ) {}

    @Get()
    list(@CurrentTenantSchema() schema: string): Promise<PriceListSummaryDto[]> {
      return this.service.list(this.connections.getClient(schema), kind);
    }

    @Get(':id')
    getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PriceListDto> {
      return this.service.getById(this.connections.getClient(schema), id, kind);
    }

    @Post()
    create(
      @CurrentTenantSchema() schema: string,
      @Body(new ZodValidationPipe(savePriceListSchema)) body: SavePriceListDto,
    ): Promise<PriceListDto> {
      return this.service.save(this.connections.getClient(schema), null, body, kind);
    }

    @Put(':id')
    update(
      @CurrentTenantSchema() schema: string,
      @Param('id') id: string,
      @Body(new ZodValidationPipe(savePriceListSchema)) body: SavePriceListDto,
    ): Promise<PriceListDto> {
      return this.service.save(this.connections.getClient(schema), id, body, kind);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
      await this.service.delete(this.connections.getClient(schema), id, kind);
    }
  }
  // Distinct class names keep Nest's logs and route explorer readable.
  Object.defineProperty(PriceListsKindController, 'name', { value: `${kind === 'sale' ? 'Sales' : 'Purchase'}PriceListsController` });
  return PriceListsKindController;
}

export const PriceListsController = priceListsController('price-lists', 'sales.manage', 'sale');
export const PurchasePriceListsController = priceListsController('purchase-price-lists', 'purchases.manage', 'purchase');
