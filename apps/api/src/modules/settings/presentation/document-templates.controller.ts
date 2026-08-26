import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  createDocumentTemplateSchema,
  documentTemplateSchema,
  updateDocumentTemplateSchema,
  type CreateDocumentTemplateDto,
  type DocumentTemplateDto,
  type UpdateDocumentTemplateDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { DocumentTemplatesService } from '../application/services/document-templates.service';

// Permission gap: see the note at the top of settings.controller.ts.
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(
    private readonly service: DocumentTemplatesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@TenantSchema() schema: string): Promise<DocumentTemplateDto[]> {
    const db = this.connections.getClient(schema);
    const templates = await this.service.list(db);
    return templates.map((t) => documentTemplateSchema.parse(t));
  }

  @Get(':id')
  async getById(
    @TenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<DocumentTemplateDto> {
    const db = this.connections.getClient(schema);
    const template = await this.service.getById(db, id);
    return documentTemplateSchema.parse(template);
  }

  @Post()
  async create(
    @TenantSchema() schema: string,
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
    @TenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDocumentTemplateSchema)) body: UpdateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    const db = this.connections.getClient(schema);
    const template = await this.service.update(db, id, body);
    return documentTemplateSchema.parse(template);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
