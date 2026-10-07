import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createProductBrandSchema,
  createProductCategorySchema,
  productBrandSchema,
  productCategorySchema,
  updateProductBrandSchema,
  updateProductCategorySchema,
  type CreateProductBrandDto,
  type CreateProductCategoryDto,
  type ProductBrandDto,
  type ProductCategoryDto,
  type UpdateProductBrandDto,
  type UpdateProductCategoryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductCatalogService } from '../application/services/product-catalog.service';

const READ_PERMISSIONS = CATALOG_READ_PERMISSIONS;

/** Product categories (tree) — readable by anyone who works with products, managed by inventory. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(
    private readonly service: ProductCatalogService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequireAnyPermission(...READ_PERMISSIONS)
  async list(@CurrentTenantSchema() schema: string): Promise<ProductCategoryDto[]> {
    const categories = await this.service.listCategories(this.connections.getClient(schema));
    return categories.map((category) => productCategorySchema.parse(category));
  }

  @Post()
  @RequirePermissions(P.productsManage)
  async create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createProductCategorySchema)) body: CreateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return productCategorySchema.parse(await this.service.createCategory(this.connections.getClient(schema), body));
  }

  @Patch(':id')
  @RequirePermissions(P.productsManage)
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductCategorySchema)) body: UpdateProductCategoryDto,
  ): Promise<ProductCategoryDto> {
    return productCategorySchema.parse(await this.service.updateCategory(this.connections.getClient(schema), id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(P.productsManage)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.deleteCategory(this.connections.getClient(schema), id);
  }
}

/** Brands — same access rules as categories. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-brands')
export class ProductBrandsController {
  constructor(
    private readonly service: ProductCatalogService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequireAnyPermission(...READ_PERMISSIONS)
  async list(@CurrentTenantSchema() schema: string): Promise<ProductBrandDto[]> {
    const brands = await this.service.listBrands(this.connections.getClient(schema));
    return brands.map((brand) => productBrandSchema.parse(brand));
  }

  @Post()
  @RequirePermissions(P.productsManage)
  async create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createProductBrandSchema)) body: CreateProductBrandDto,
  ): Promise<ProductBrandDto> {
    return productBrandSchema.parse(await this.service.createBrand(this.connections.getClient(schema), body));
  }

  @Patch(':id')
  @RequirePermissions(P.productsManage)
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductBrandSchema)) body: UpdateProductBrandDto,
  ): Promise<ProductBrandDto> {
    return productBrandSchema.parse(await this.service.updateBrand(this.connections.getClient(schema), id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(P.productsManage)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.deleteBrand(this.connections.getClient(schema), id);
  }
}
