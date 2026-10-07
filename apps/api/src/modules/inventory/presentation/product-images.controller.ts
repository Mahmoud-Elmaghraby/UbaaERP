import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  productImageSchema,
  reorderProductImagesSchema,
  uploadProductImageSchema,
  type ProductImageDto,
  type ReorderProductImagesDto,
  type UploadProductImageDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductImagesService, type ProductImageWithUrls } from '../application/services/product-images.service';
import { PRODUCT_IMAGE_MAX_BYTES } from '../domain/product-image.entity';

function toDto(image: ProductImageWithUrls): ProductImageDto {
  return productImageSchema.parse(image);
}

type UploadedFields = { image?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] };

/** Item images (migration 0085). Multipart fields: `image` (required), `thumbnail` (optional, ≤ 320 px). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.productsManage)
@Controller('products/:id/images')
export class ProductImagesController {
  constructor(
    private readonly service: ProductImagesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  async list(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ProductImageDto[]> {
    return (await this.service.list(this.connections.getClient(schema), id)).map(toDto);
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      { limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES } },
    ),
  )
  async upload(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(uploadProductImageSchema)) body: UploadProductImageDto,
    @UploadedFiles() files: UploadedFields,
  ): Promise<ProductImageDto> {
    const image = files?.image?.[0];
    if (!image) throw new BadRequestException('An image file is required.');
    const thumbnail = files.thumbnail?.[0];
    const saved = await this.service.upload(this.connections.getClient(schema), schema, {
      productId: id,
      productVariantId: body.productVariantId ?? null,
      image: { buffer: image.buffer, mimeType: image.mimetype, sizeBytes: image.size },
      thumbnail: thumbnail
        ? { buffer: thumbnail.buffer, mimeType: thumbnail.mimetype, sizeBytes: thumbnail.size }
        : null,
      createdBy: user.sub,
    });
    return toDto(saved);
  }

  @Post(':imageId/primary')
  async setPrimary(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<ProductImageDto[]> {
    return (await this.service.setPrimary(this.connections.getClient(schema), id, imageId)).map(toDto);
  }

  @Put('order')
  async reorder(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderProductImagesSchema)) body: ReorderProductImagesDto,
  ): Promise<ProductImageDto[]> {
    return (await this.service.reorder(this.connections.getClient(schema), id, body.imageIds)).map(toDto);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id, imageId);
  }
}
