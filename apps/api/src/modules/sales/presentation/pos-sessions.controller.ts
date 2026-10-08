import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  posSessionSchema,
  openPosSessionSchema,
  closePosSessionSchema,
  posCheckoutSchema,
  posCheckoutResultSchema,
  posSessionReportSchema,
  type PosSessionDto,
  type OpenPosSessionDto,
  type ClosePosSessionDto,
  type PosCheckoutDto,
  type PosCheckoutResultDto,
  type PosSessionReportDto,
} from '@erp-platform/contracts';
import type { PosSession, PosSessionReport, PosSessionStatus } from '../domain/pos-session.entity';
import type { PosCheckoutResult } from '../domain/pos-sale.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PosSessionsService } from '../application/services/pos-sessions.service';
import { PosSalesService } from '../application/services/pos-sales.service';
import { moneyFromDto, moneyToDto } from './money.mapper';
import { orderWithLinesToDto } from './sales-orders.controller';
import { deliveryWithLinesToDto } from './deliveries.controller';
import { invoiceWithLinesToDto } from './sales-invoices.controller';
import { paymentWithAllocationsToDto } from './payments-received.controller';

function toDto(session: PosSession): PosSessionDto {
  return posSessionSchema.parse({
    ...session,
    openingCashAmount: moneyToDto(session.openingCashAmount),
    expectedCashAmount: session.expectedCashAmount ? moneyToDto(session.expectedCashAmount) : null,
    countedCashAmount: session.countedCashAmount ? moneyToDto(session.countedCashAmount) : null,
    varianceAmount: session.varianceAmount ? moneyToDto(session.varianceAmount) : null,
  });
}

function checkoutResultToDto(result: PosCheckoutResult): PosCheckoutResultDto {
  return posCheckoutResultSchema.parse({
    salesOrder: orderWithLinesToDto(result.salesOrder),
    delivery: deliveryWithLinesToDto(result.delivery),
    salesInvoice: invoiceWithLinesToDto(result.salesInvoice),
    payments: result.payments.map(paymentWithAllocationsToDto),
  });
}

function reportToDto(report: PosSessionReport): PosSessionReportDto {
  return posSessionReportSchema.parse({
    session: toDto(report.session),
    salesCount: report.salesCount,
    totalSalesAmount: moneyToDto(report.totalSalesAmount),
    tendersByMethod: report.tendersByMethod.map((t) => ({
      paymentMethod: t.paymentMethod,
      amount: moneyToDto(t.amount),
    })),
    expectedCashAmount: moneyToDto(report.expectedCashAmount),
    countedCashAmount: report.countedCashAmount ? moneyToDto(report.countedCashAmount) : null,
    varianceAmount: report.varianceAmount ? moneyToDto(report.varianceAmount) : null,
    generatedAt: report.generatedAt,
  });
}

/**
 * POS Cash Sessions (CLAUDE.md §10 — step 4, Sales — POS feature, Stage
 * 1; see claude/sales-pos-research.md). A session always belongs to the
 * currently authenticated cashier — open()/close() never take a
 * cashierUserId in the request body, they use @CurrentUser()'s `sub`,
 * same "only the controller layer has request context" discipline as
 * every Outbox-writing service. Reusing 'sales.manage' rather than a
 * new permission key, same as every other Sales controller. No
 * PlanFeatureGuard: intentionally excluded — POS is its own feature
 * area, not one of the 3 optional document-chain steps PlanFeatureGuard
 * gates (see feature-catalog.ts).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('pos-sessions')
export class PosSessionsController {
  constructor(
    private readonly service: PosSessionsService,
    private readonly checkoutService: PosSalesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: PosSessionStatus,
    @Query('cashierUserId') cashierUserId?: string,
  ): Promise<PosSessionDto[]> {
    const db = this.connections.getClient(schema);
    const sessions = await this.service.list(db, { status, cashierUserId });
    return sessions.map(toDto);
  }

  /** The current user's own open session, or null — the frontend's first call when entering the POS screen, to decide whether to show "open a session" or go straight to checkout. */
  @Get('current')
  async getCurrentOpen(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PosSessionDto | null> {
    const db = this.connections.getClient(schema);
    const session = await this.service.getOpenForCashier(db, user.sub);
    return session ? toDto(session) : null;
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.getById(db, id);
    return toDto(session);
  }

  @Post()
  async open(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(openPosSessionSchema)) body: OpenPosSessionDto,
  ): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.open(db, {
      cashierUserId: user.sub,
      openingCashAmount: moneyFromDto(body.openingCashAmount),
      warehouseId: body.warehouseId,
      treasuryId: body.treasuryId ?? null,
      notes: body.notes,
    });
    return toDto(session);
  }

  @Post(':id/close')
  async close(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closePosSessionSchema)) body: ClosePosSessionDto,
  ): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.close(
      db,
      id,
      { countedCashAmount: moneyFromDto(body.countedCashAmount), notes: body.notes },
      schema,
      user.sub,
    );
    return toDto(session);
  }

  /**
   * POS Stage 5 — X Report while the session is still 'open', Z Report once it's
   * 'closed'; same endpoint, same shape either way (see PosSessionReport's own
   * comment). Read-only — never mutates the session, safe to call any number of
   * times during a shift.
   */
  @Get(':id/report')
  async getReport(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PosSessionReportDto> {
    const db = this.connections.getClient(schema);
    const report = await this.service.getReport(db, id);
    return reportToDto(report);
  }

  /**
   * POS Stage 3 (claude/sales-pos-research.md §4). Orchestrates
   * Sales Order → Delivery → Sales Invoice → Payment(s) Received
   * atomically — see PosSalesService.checkout()'s own comment. Like
   * open()/close(), never takes a customerId's absence as an error:
   * omitting it resolves to the tenant's Walk-in Customer.
   */
  @Post(':id/checkout')
  async checkout(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(posCheckoutSchema)) body: PosCheckoutDto,
  ): Promise<PosCheckoutResultDto> {
    const db = this.connections.getClient(schema);
    const result = await this.checkoutService.checkout(
      db,
      id,
      {
        customerId: body.customerId,
        lines: body.lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          unitPrice: moneyFromDto(line.unitPrice),
          discountType: line.discountType,
          discountPercentage: line.discountPercentage,
          discountFixedAmount: line.discountFixedAmount ? moneyFromDto(line.discountFixedAmount) : line.discountFixedAmount,
          notes: line.notes,
        })),
        discountType: body.discountType,
        discountPercentage: body.discountPercentage,
        discountFixedAmount: body.discountFixedAmount ? moneyFromDto(body.discountFixedAmount) : body.discountFixedAmount,
        tenders: body.tenders.map((tender) => ({
          paymentMethod: tender.paymentMethod,
          amount: moneyFromDto(tender.amount),
          referenceNumber: tender.referenceNumber,
        })),
        notes: body.notes,
      },
      schema,
      user.sub,
    );
    return checkoutResultToDto(result);
  }
}
