import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createCustomFieldDefinitionSchema,
  customFieldDefinitionSchema,
  updateCustomFieldDefinitionSchema,
  type CreateCustomFieldDefinitionDto,
  type CustomFieldDefinitionDto,
  type UpdateCustomFieldDefinitionDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CustomFieldDefinitionsService } from '../application/services/custom-field-definitions.service';

// Permission gap: see the note at the top of settings.controller.ts.
// Backend-half-only gap: see the note atop custom-field-definitions.service.ts
// — this stores definitions; nothing renders them yet (dynamic form engine,
// frontend, not built).
@Controller('custom-field-definitions')
export class CustomFieldDefinitionsController {
  constructor(
    private readonly service: CustomFieldDefinitionsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async listByEntityType(
    @TenantSchema() schema: string,
    @Query('entityType') entityType: string | undefined,
  ): Promise<CustomFieldDefinitionDto[]> {
    if (!entityType) {
      throw new BadRequestException('Query parameter "entityType" is required.');
    }
    const db = this.connections.getClient(schema);
    const definitions = await this.service.listByEntityType(db, entityType);
    return definitions.map((d) => customFieldDefinitionSchema.parse(d));
  }

  @Get(':id')
  async getById(
    @TenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<CustomFieldDefinitionDto> {
    const db = this.connections.getClient(schema);
    const definition = await this.service.getById(db, id);
    return customFieldDefinitionSchema.parse(definition);
  }

  @Post()
  async create(
    @TenantSchema() schema: string,
    // See branches.controller.ts's create() comment: pipe bound to
    // @Body() directly, not a method-level @UsePipes().
    @Body(new ZodValidationPipe(createCustomFieldDefinitionSchema)) body: CreateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinitionDto> {
    const db = this.connections.getClient(schema);
    const definition = await this.service.create(db, body);
    return customFieldDefinitionSchema.parse(definition);
  }

  @Patch(':id')
  async update(
    @TenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomFieldDefinitionSchema)) body: UpdateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinitionDto> {
    const db = this.connections.getClient(schema);
    const definition = await this.service.update(db, id, body);
    return customFieldDefinitionSchema.parse(definition);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
