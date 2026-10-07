import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createProductSchema,
  updateProductSchema,
  productVariantSchema,
  createProductVariantSchema,
  updateProductVariantSchema,
  createProductBarcodeSchema,
  generateProductVariantsSchema,
  productBarcodeSchema,
  type CreateProductBarcodeDto,
  type GenerateProductVariantsDto,
  type ProductBarcodeDto,
  type UpdateProductVariantDto,
  type ProductDto,
  type ProductWithVariantsDto,
  type CreateProductDto,
  type UpdateProductDto,
  type ProductVariantDto,
  type CreateProductVariantDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, INVENTORY_PERMISSIONS as P, canViewPurchasePrices, withoutPurchasePrices } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductsService } from '../application/services/products.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { productInputFromDto, productToDto, productWithVariantsToDto } from './product.mapper';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.productsManage)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  async list(@CurrentTenantSchema() schema: string, @CurrentUser() user: JwtAccessPayload): Promise<ProductDto[]> {
    const db = this.connections.getClient(schema);
    const products = (await this.service.list(db)).map(productToDto);
    return canViewPurchasePrices(user.permissions) ? products : withoutPurchasePrices(products);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  async getById(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<ProductWithVariantsDto> {
    const db = this.connections.getClient(schema);
    const product = productWithVariantsToDto(await this.service.getById(db, id));
    return canViewPurchasePrices(user.permissions) ? product : withoutPurchasePrices(product);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductDto,
  ): Promise<ProductWithVariantsDto> {
    const db = this.connections.getClient(schema);
    const product = await this.service.create(db, productInputFromDto(body));
    this.events.publish('product', 'created', {
      schema,
      entityId: product.id,
      actorUserId: user.sub,
      metadata: { variantIds: product.variants.map((v) => v.id) },
    });
    return productWithVariantsToDto(product);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductDto,
  ): Promise<ProductDto> {
    const db = this.connections.getClient(schema);
    // A user who can't see purchase prices got null in the form — never let that wipe the stored price.
    const input = canViewPurchasePrices(user.permissions) ? body : { ...body, purchasePrice: undefined };
    const product = await this.service.update(db, id, productInputFromDto(input));
    this.events.publish('product', 'updated', { schema, entityId: product.id, actorUserId: user.sub });
    return productToDto(product);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('product', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }

  @Post(':id/variants')
  async addVariant(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createProductVariantSchema)) body: CreateProductVariantDto,
  ): Promise<ProductVariantDto> {
    const db = this.connections.getClient(schema);
    const variant = await this.service.addVariant(db, id, body);
    this.events.publish('product_variant', 'created', {
      schema,
      entityId: variant.id,
      actorUserId: user.sub,
      metadata: { productId: id },
    });
    return productVariantSchema.parse(variant);
  }

  @Patch(':id/variants/:variantId')
  async updateVariant(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(updateProductVariantSchema)) body: UpdateProductVariantDto,
  ): Promise<ProductVariantDto> {
    const db = this.connections.getClient(schema);
    const variant = await this.service.updateVariant(db, id, variantId, body);
    this.events.publish('product_variant', 'updated', {
      schema,
      entityId: variant.id,
      actorUserId: user.sub,
      metadata: { productId: id },
    });
    return productVariantSchema.parse(variant);
  }

  /** Variant matrix — every missing combination of the given option values (e.g. sizes × colours). */
  @Post(':id/variants/generate')
  async generateVariants(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(generateProductVariantsSchema)) body: GenerateProductVariantsDto,
  ): Promise<ProductVariantDto[]> {
    const db = this.connections.getClient(schema);
    const created = await this.service.generateVariants(db, id, body.options);
    for (const variant of created) {
      this.events.publish('product_variant', 'created', {
        schema,
        entityId: variant.id,
        actorUserId: user.sub,
        metadata: { productId: id, generated: true },
      });
    }
    return created.map((variant) => productVariantSchema.parse(variant));
  }

  @Get(':id/variants/:variantId/barcodes')
  @RequirePermissions()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  async listBarcodes(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ): Promise<ProductBarcodeDto[]> {
    const barcodes = await this.service.listVariantBarcodes(this.connections.getClient(schema), id, variantId);
    return barcodes.map((barcode) => productBarcodeSchema.parse(barcode));
  }

  @Post(':id/variants/:variantId/barcodes')
  async addBarcode(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(createProductBarcodeSchema)) body: CreateProductBarcodeDto,
  ): Promise<ProductBarcodeDto> {
    const barcode = await this.service.addVariantBarcode(this.connections.getClient(schema), id, variantId, body);
    this.events.publish('product_variant', 'updated', {
      schema,
      entityId: variantId,
      actorUserId: user.sub,
      metadata: { productId: id, barcodeAdded: barcode.barcode },
    });
    return productBarcodeSchema.parse(barcode);
  }

  @Delete(':id/variants/:variantId/barcodes/:barcodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBarcode(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Param('barcodeId') barcodeId: string,
  ): Promise<void> {
    await this.service.removeVariantBarcode(this.connections.getClient(schema), id, variantId, barcodeId);
    this.events.publish('product_variant', 'updated', {
      schema,
      entityId: variantId,
      actorUserId: user.sub,
      metadata: { productId: id, barcodeRemoved: barcodeId },
    });
  }
}
