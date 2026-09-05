import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  productSchema,
  productWithVariantsSchema,
  createProductSchema,
  updateProductSchema,
  productVariantSchema,
  createProductVariantSchema,
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
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductsService } from '../application/services/products.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('inventory.manage')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<ProductDto[]> {
    const db = this.connections.getClient(schema);
    const products = await this.service.list(db);
    return products.map((p) => productSchema.parse(p));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ProductWithVariantsDto> {
    const db = this.connections.getClient(schema);
    const product = await this.service.getById(db, id);
    return productWithVariantsSchema.parse(product);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductDto,
  ): Promise<ProductWithVariantsDto> {
    const db = this.connections.getClient(schema);
    const product = await this.service.create(db, body);
    this.events.publish('product', 'created', {
      schema,
      entityId: product.id,
      actorUserId: user.sub,
      metadata: { variantIds: product.variants.map((v) => v.id) },
    });
    return productWithVariantsSchema.parse(product);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductDto,
  ): Promise<ProductDto> {
    const db = this.connections.getClient(schema);
    const product = await this.service.update(db, id, body);
    this.events.publish('product', 'updated', { schema, entityId: product.id, actorUserId: user.sub });
    return productSchema.parse(product);
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
}
