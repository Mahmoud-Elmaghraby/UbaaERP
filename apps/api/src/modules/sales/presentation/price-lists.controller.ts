import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { savePriceListSchema, type PriceListDto, type PriceListSummaryDto, type SavePriceListDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PriceListsService } from '../application/services/price-lists.service';

/**
 * Price lists (wholesale, retail…). No PlanFeatureGuard: master data every
 * Sales plan needs, same reasoning as CustomersController.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('price-lists')
export class PriceListsController {
  constructor(
    private readonly service: PriceListsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<PriceListSummaryDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Get(':id')
  getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PriceListDto> {
    return this.service.getById(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(savePriceListSchema)) body: SavePriceListDto,
  ): Promise<PriceListDto> {
    return this.service.save(this.connections.getClient(schema), null, body);
  }

  @Put(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePriceListSchema)) body: SavePriceListDto,
  ): Promise<PriceListDto> {
    return this.service.save(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
