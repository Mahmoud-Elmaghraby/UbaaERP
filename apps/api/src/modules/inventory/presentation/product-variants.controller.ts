import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, canViewPurchasePrices, withoutPurchasePrices } from '../../../shared/auth/inventory-permissions';
import { ProductImagesService } from '../application/services/product-images.service';
import { ProductsService } from '../application/services/products.service';
import { variantLookupToDto } from './product.mapper';

/**
 * Read-only catalogue lookup shared by every module that picks products:
 * document line editors (sales, purchases), POS search and barcode scans.
 * One query for the whole catalogue instead of GET /products/:id per
 * product (inventory audit 2026-10, frontend N+1).
 *
 * Deliberately a separate controller from ProductsController: that one is
 * gated on 'inventory.manage' as a whole, which locked salespeople and
 * buyers out of the product list they need to create documents. Reading
 * the catalogue needs any one of the three permissions that create
 * documents with product lines; managing products still needs
 * 'inventory.products.manage'.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
@Controller('product-variants')
export class ProductVariantsController {
  constructor(
    private readonly service: ProductsService,
    private readonly connections: TenantConnectionManager,
    private readonly images: ProductImagesService,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProductVariantLookupDto[]> {
    const db = this.connections.getClient(schema);
    const imageUrls = await this.images.primaryThumbnailUrls(db);
    const variants = (await this.service.listVariantLookup(db)).map((variant) => ({
      ...variantLookupToDto(variant),
      imageUrl: imageUrls.get(variant.productId) ?? null,
    }));
    return canViewPurchasePrices(user.permissions) ? variants : withoutPurchasePrices(variants);
  }
}
