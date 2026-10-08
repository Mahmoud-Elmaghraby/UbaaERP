import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createTreasuryCategorySchema,
  treasuryCategoryKindSchema,
  updateTreasuryCategorySchema,
  type CreateTreasuryCategoryDto,
  type TreasuryCategoryDto,
  type UpdateTreasuryCategoryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TreasuryCategoriesService } from '../application/treasury-categories.service';

/** Expense / income items. Listing is open to whoever records vouchers. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('treasury.manage')
@Controller('treasury-categories')
export class TreasuryCategoriesController {
  constructor(
    private readonly service: TreasuryCategoriesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission('treasury.view', 'treasury.manage', 'treasury.vouchers.manage')
  list(@CurrentTenantSchema() schema: string, @Query('kind') kind?: string): Promise<TreasuryCategoryDto[]> {
    const parsed = treasuryCategoryKindSchema.safeParse(kind);
    return this.service.list(this.connections.getClient(schema), parsed.success ? parsed.data : undefined);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createTreasuryCategorySchema)) body: CreateTreasuryCategoryDto,
  ): Promise<TreasuryCategoryDto> {
    return this.service.create(this.connections.getClient(schema), body);
  }

  @Patch(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTreasuryCategorySchema)) body: UpdateTreasuryCategoryDto,
  ): Promise<TreasuryCategoryDto> {
    return this.service.update(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
