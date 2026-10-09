import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createCurrencySchema,
  updateCurrencySchema,
  type CreateCurrencyDto,
  type CurrencyDto,
  type UpdateCurrencyDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CurrenciesService } from '../application/services/currencies.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('currencies')
export class CurrenciesController {
  constructor(
    private readonly service: CurrenciesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  /** Every signed-in user reads it — currency pickers are everywhere. */
  @Get()
  @RequirePermissions()
  list(@CurrentTenantSchema() schema: string): Promise<CurrencyDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createCurrencySchema)) body: CreateCurrencyDto,
  ): Promise<CurrencyDto> {
    return this.service.create(this.connections.getClient(schema), body);
  }

  @Patch(':code')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateCurrencySchema)) body: UpdateCurrencyDto,
  ): Promise<CurrencyDto> {
    return this.service.update(this.connections.getClient(schema), code, body);
  }
}
