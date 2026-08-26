import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UsePipes } from '@nestjs/common';
import {
  createTaxRuleSchema,
  taxRuleSchema,
  updateTaxRuleSchema,
  type CreateTaxRuleDto,
  type TaxRuleDto,
  type UpdateTaxRuleDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TaxRulesService } from '../application/services/tax-rules.service';

// Permission gap: see the note at the top of settings.controller.ts.
@Controller('tax-rules')
export class TaxRulesController {
  constructor(
    private readonly service: TaxRulesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@TenantSchema() schema: string): Promise<TaxRuleDto[]> {
    const db = this.connections.getClient(schema);
    const rules = await this.service.list(db);
    return rules.map((r) => taxRuleSchema.parse(r));
  }

  @Get(':id')
  async getById(@TenantSchema() schema: string, @Param('id') id: string): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.getById(db, id);
    return taxRuleSchema.parse(rule);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createTaxRuleSchema))
  async create(@TenantSchema() schema: string, @Body() body: CreateTaxRuleDto): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.create(db, body);
    return taxRuleSchema.parse(rule);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateTaxRuleSchema))
  async update(
    @TenantSchema() schema: string,
    @Param('id') id: string,
    @Body() body: UpdateTaxRuleDto,
  ): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.update(db, id, body);
    return taxRuleSchema.parse(rule);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
