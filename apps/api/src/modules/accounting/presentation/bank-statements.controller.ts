import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  bookBankStatementLineSchema,
  importBankStatementSchema,
  matchBankStatementLineSchema,
  type BankStatementLineDto,
  type BookBankStatementLineDto,
  type ImportBankStatementDto,
  type MatchBankStatementLineDto,
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
import { BankStatementsService } from '../application/services/bank-statements.service';

/** كشف البنك: استيراد ومطابقة مع حركات الدفاتر. `:id` is the bank account (treasury) id. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('bank-accounts/:id/statement')
export class BankStatementsController {
  constructor(
    private readonly service: BankStatementsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<BankStatementLineDto[]> {
    return this.service.list(this.connections.getClient(schema), id, fromDate || undefined, toDate || undefined);
  }

  @Post('import')
  import(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(importBankStatementSchema)) body: ImportBankStatementDto,
  ): Promise<{ imported: number; matched: number }> {
    return this.service.import(this.connections.getClient(schema), id, body);
  }

  @Post('lines/:lineId/match')
  @HttpCode(HttpStatus.NO_CONTENT)
  async match(
    @CurrentTenantSchema() schema: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(matchBankStatementLineSchema)) body: MatchBankStatementLineDto,
  ): Promise<void> {
    await this.service.match(this.connections.getClient(schema), lineId, body.journalLineId);
  }

  @Post('lines/:lineId/unmatch')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unmatch(@CurrentTenantSchema() schema: string, @Param('lineId') lineId: string): Promise<void> {
    await this.service.unmatch(this.connections.getClient(schema), lineId);
  }

  @Post('lines/:lineId/ignore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ignore(@CurrentTenantSchema() schema: string, @Param('lineId') lineId: string): Promise<void> {
    await this.service.setIgnored(this.connections.getClient(schema), lineId, true);
  }

  @Post('lines/:lineId/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@CurrentTenantSchema() schema: string, @Param('lineId') lineId: string): Promise<void> {
    await this.service.setIgnored(this.connections.getClient(schema), lineId, false);
  }

  @Post('lines/:lineId/book')
  @HttpCode(HttpStatus.NO_CONTENT)
  async book(
    @CurrentTenantSchema() schema: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(bookBankStatementLineSchema)) body: BookBankStatementLineDto,
  ): Promise<void> {
    await this.service.book(this.connections.getClient(schema), lineId, body);
  }

  @Delete('lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenantSchema() schema: string, @Param('lineId') lineId: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), lineId);
  }
}
