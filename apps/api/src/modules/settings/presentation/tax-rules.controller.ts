import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTaxRuleSchema,
  taxRuleSchema,
  updateTaxRuleSchema,
  type CreateTaxRuleDto,
  type TaxRuleDto,
  type UpdateTaxRuleDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TaxRulesService } from '../application/services/tax-rules.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('tax-rules')
export class TaxRulesController {
  constructor(
    private readonly service: TaxRulesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<TaxRuleDto[]> {
    const db = this.connections.getClient(schema);
    const rules = await this.service.list(db);
    return rules.map((r) => taxRuleSchema.parse(r));
  }

  /** Active rules for invoice and product forms — readable by sales, purchases and inventory users. */
  @Get('lookup')
  @RequirePermissions()
  @RequireAnyPermission(
    'settings.manage',
    'sales.manage',
    'purchases.manage',
    'inventory.products.manage',
    'inventory.products.view',
  )
  async lookup(@CurrentTenantSchema() schema: string): Promise<TaxRuleDto[]> {
    const rules = await this.service.list(this.connections.getClient(schema));
    return rules.filter((rule) => rule.isActive).map((rule) => taxRuleSchema.parse(rule));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.getById(db, id);
    return taxRuleSchema.parse(rule);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    // See branches.controller.ts's create() comment: pipe bound to
    // @Body() directly, not a method-level @UsePipes().
    @Body(new ZodValidationPipe(createTaxRuleSchema)) body: CreateTaxRuleDto,
  ): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.create(db, body);
    return taxRuleSchema.parse(rule);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaxRuleSchema)) body: UpdateTaxRuleDto,
  ): Promise<TaxRuleDto> {
    const db = this.connections.getClient(schema);
    const rule = await this.service.update(db, id, body);
    return taxRuleSchema.parse(rule);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
  }
}
