import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createCustomFieldDefinitionSchema,
  customFieldDefinitionSchema,
  updateCustomFieldDefinitionSchema,
  type CreateCustomFieldDefinitionDto,
  type CustomFieldDefinitionDto,
  type UpdateCustomFieldDefinitionDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CustomFieldDefinitionsService } from '../application/services/custom-field-definitions.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('custom-field-definitions')
export class CustomFieldDefinitionsController {
  constructor(
    private readonly service: CustomFieldDefinitionsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async listByEntityType(
    @CurrentTenantSchema() schema: string,
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
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<CustomFieldDefinitionDto> {
    const db = this.connections.getClient(schema);
    const definition = await this.service.getById(db, id);
    return customFieldDefinitionSchema.parse(definition);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
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
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomFieldDefinitionSchema)) body: UpdateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinitionDto> {
    const db = this.connections.getClient(schema);
    const definition = await this.service.update(db, id, body);
    return customFieldDefinitionSchema.parse(definition);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
