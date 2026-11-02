import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  disposeFixedAssetSchema,
  saveFixedAssetSchema,
  type DepreciationRunResultDto,
  type DisposeFixedAssetDto,
  type FixedAssetDepreciationDto,
  type FixedAssetDto,
  type SaveFixedAssetDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { FixedAssetsService } from '../application/services/fixed-assets.service';

const runDepreciationSchema = z.object({ through: z.string().date().optional() });

/** الأصول الثابتة والإهلاك. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('fixed-assets')
export class FixedAssetsController {
  constructor(
    private readonly service: FixedAssetsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<FixedAssetDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  /** Books the depreciation of every month that ended (or through the given month end). */
  @Post('depreciation/run')
  run(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(runDepreciationSchema)) body: { through?: string },
  ): Promise<DepreciationRunResultDto> {
    const db = this.connections.getClient(schema);
    return body.through ? this.service.runDepreciation(db, body.through) : this.service.runDepreciation(db);
  }

  @Get(':id')
  get(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<FixedAssetDto & { depreciations: FixedAssetDepreciationDto[] }> {
    return this.service.get(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveFixedAssetSchema)) body: SaveFixedAssetDto,
  ): Promise<FixedAssetDto> {
    return this.service.save(this.connections.getClient(schema), null, body);
  }

  @Patch(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveFixedAssetSchema)) body: SaveFixedAssetDto,
  ): Promise<FixedAssetDto> {
    return this.service.save(this.connections.getClient(schema), id, body);
  }

  @Post(':id/dispose')
  dispose(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disposeFixedAssetSchema)) body: DisposeFixedAssetDto,
  ): Promise<FixedAssetDto> {
    return this.service.dispose(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
