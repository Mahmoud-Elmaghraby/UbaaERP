import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createDocumentTemplateSchema,
  documentTemplateSchema,
  updateDocumentTemplateSchema,
  type CreateDocumentTemplateDto,
  type DocumentTemplateDto,
  type UpdateDocumentTemplateDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { DocumentTemplatesService } from '../application/services/document-templates.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(
    private readonly service: DocumentTemplatesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<DocumentTemplateDto[]> {
    const db = this.connections.getClient(schema);
    const templates = await this.service.list(db);
    return templates.map((t) => documentTemplateSchema.parse(t));
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<DocumentTemplateDto> {
    const db = this.connections.getClient(schema);
    const template = await this.service.getById(db, id);
    return documentTemplateSchema.parse(template);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    // See branches.controller.ts's create() comment: pipe bound to
    // @Body() directly, not a method-level @UsePipes().
    @Body(new ZodValidationPipe(createDocumentTemplateSchema)) body: CreateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    const db = this.connections.getClient(schema);
    const template = await this.service.create(db, body);
    return documentTemplateSchema.parse(template);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDocumentTemplateSchema)) body: UpdateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    const db = this.connections.getClient(schema);
    const template = await this.service.update(db, id, body);
    return documentTemplateSchema.parse(template);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
