import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  productImportRequestSchema,
  productImportResultSchema,
  type ProductImportResultDto,
} from '@erp-platform/contracts';
import type { z } from 'zod';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductImportService } from '../application/services/product-import.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';

/** استيراد الأصناف من Excel — `dryRun: true` validates everything and rolls back. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.productsManage)
@Controller('products/import')
export class ProductImportController {
  constructor(
    private readonly service: ProductImportService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async import(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(productImportRequestSchema)) body: z.output<typeof productImportRequestSchema>,
  ): Promise<ProductImportResultDto> {
    const { rows, ...options } = body;
    const result = await this.service.import(this.connections.getClient(schema), rows, options, user.sub);
    if (result.committed) {
      this.events.publish('product', 'imported', {
        schema,
        entityId: result.openingCountId ?? schema,
        actorUserId: user.sub,
        metadata: { created: result.created, updated: result.updated },
      });
    }
    return productImportResultSchema.parse(result);
  }
}
