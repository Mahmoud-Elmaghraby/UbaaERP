import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  attachmentSchema,
  attachmentDownloadUrlSchema,
  createAttachmentSchema,
  listAttachmentsQuerySchema,
  type AttachmentDownloadUrlDto,
  type AttachmentDto,
  type CreateAttachmentDto,
  type ListAttachmentsQueryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AttachmentsService } from '../application/services/attachments.service';
import {
  ATTACHMENT_ENTITY_PERMISSIONS,
  ATTACHMENT_MAX_SIZE_BYTES,
  type Attachment,
  type AttachmentEntityType,
} from '../domain/attachment.entity';

function toDto(attachment: Attachment): AttachmentDto {
  return attachmentSchema.parse(attachment);
}

/**
 * Shared Attachments feature (claude/attachments-strategy.md). No
 * @RequirePermissions()/PermissionsGuard here, unlike every other
 * controller in the codebase: the required permission DEPENDS on
 * entityType — a request value, not known statically at decoration
 * time — so PermissionsGuard's Reflector-based static metadata can't
 * express it (see PermissionsGuard's own class comment). assertPermission()
 * below performs the identical check imperatively and throws the same
 * ForbiddenException PermissionsGuard itself throws.
 *
 * Also no PlanFeatureGuard: Attachments is core cross-cutting
 * infrastructure (like Inventory's MinIO dependency was always meant to
 * be), not one of the optional/gated modules — the user's confirmed
 * design (claude/attachments-strategy.md).
 */
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly service: AttachmentsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  private assertPermission(user: JwtAccessPayload, entityType: AttachmentEntityType): void {
    const required = ATTACHMENT_ENTITY_PERMISSIONS[entityType];
    if (!user.permissions.includes(required)) {
      throw new ForbiddenException(`Missing required permission(s): ${required}.`);
    }
  }

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Query(new ZodValidationPipe(listAttachmentsQuerySchema)) query: ListAttachmentsQueryDto,
  ): Promise<AttachmentDto[]> {
    this.assertPermission(user, query.entityType);
    const db = this.connections.getClient(schema);
    const attachments = await this.service.list(db, query.entityType, query.entityId);
    return attachments.map(toDto);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_SIZE_BYTES } }))
  async upload(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createAttachmentSchema)) body: CreateAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    this.assertPermission(user, body.entityType);
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    const db = this.connections.getClient(schema);
    const attachment = await this.service.upload(db, schema, {
      entityType: body.entityType,
      entityId: body.entityId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      buffer: file.buffer,
      uploadedBy: user.sub,
    });
    return toDto(attachment);
  }

  @Get(':id/download-url')
  async getDownloadUrl(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<AttachmentDownloadUrlDto> {
    const db = this.connections.getClient(schema);
    const attachment = await this.service.getById(db, id);
    this.assertPermission(user, attachment.entityType);
    const result = await this.service.getDownloadUrl(attachment);
    return attachmentDownloadUrlSchema.parse(result);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    const attachment = await this.service.getById(db, id);
    this.assertPermission(user, attachment.entityType);
    await this.service.delete(db, attachment);
  }
}
