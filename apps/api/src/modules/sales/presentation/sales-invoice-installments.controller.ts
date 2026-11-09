import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  generateSalesInvoiceInstallmentsSchema,
  replaceSalesInvoiceInstallmentsSchema,
  type DocumentShareLinkDto,
  type GenerateSalesInvoiceInstallmentsDto,
  type InstallmentDueRowDto,
  type PlannedInstallmentDto,
  type ReplaceSalesInvoiceInstallmentsDto,
  type SalesInvoiceInstallmentScheduleDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { DocumentShareService } from '../../../shared/printing/document-share.service';
import { BusinessRuleError } from '../application/errors';
import { SalesInvoiceInstallmentsService } from '../application/services/sales-invoice-installments.service';
import { SalesInvoicesService } from '../application/services/sales-invoices.service';
import { PaymentsReceivedService } from '../application/services/payments-received.service';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';

/**
 * Installment schedules (التقسيط) of sales invoices, the "installments due"
 * report, and public share links (WhatsApp) for invoices and receipts.
 * Same keys as SalesInvoicesController (view / create), no PlanFeatureGuard
 * (invoices and payments are mandatory, never gate-able).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@Controller()
export class SalesInvoiceInstallmentsController {
  constructor(
    private readonly installments: SalesInvoiceInstallmentsService,
    private readonly invoices: SalesInvoicesService,
    private readonly payments: PaymentsReceivedService,
    private readonly shares: DocumentShareService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('sales-invoices/:id/installments')
  @RequireFeature(FEATURE_KEYS.SALES_INSTALLMENTS)
  @RequirePermissions(S.view)
  schedule(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<SalesInvoiceInstallmentScheduleDto> {
    return this.installments.getSchedule(this.connections.getClient(schema), id);
  }

  @Put('sales-invoices/:id/installments')
  @RequireFeature(FEATURE_KEYS.SALES_INSTALLMENTS)
  @RequirePermissions(S.create)
  replace(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(replaceSalesInvoiceInstallmentsSchema)) body: ReplaceSalesInvoiceInstallmentsDto,
  ): Promise<SalesInvoiceInstallmentScheduleDto> {
    return this.installments.replace(
      this.connections.getClient(schema),
      id,
      body.installments.map((i) => ({ dueDate: i.dueDate, amountMinor: BigInt(i.amountMinorUnits), notes: i.notes ?? null })),
    );
  }

  @Post('sales-invoices/:id/installments/generate')
  @RequireFeature(FEATURE_KEYS.SALES_INSTALLMENTS)
  @RequirePermissions(S.create)
  generate(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(generateSalesInvoiceInstallmentsSchema)) body: GenerateSalesInvoiceInstallmentsDto,
  ): Promise<PlannedInstallmentDto[]> {
    return this.installments.preview(this.connections.getClient(schema), id, {
      count: body.count,
      firstDueDate: body.firstDueDate,
      intervalMonths: body.intervalMonths,
      downPaymentMinor: body.downPaymentMinorUnits ? BigInt(body.downPaymentMinorUnits) : undefined,
      downPaymentDate: body.downPaymentDate,
    });
  }

  /** Open installments of posted invoices (paid ones excluded), oldest due first. */
  @Get('sales-installments')
  @RequireFeature(FEATURE_KEYS.SALES_INSTALLMENTS)
  @RequirePermissions(S.view)
  due(
    @CurrentTenantSchema() schema: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ): Promise<InstallmentDueRowDto[]> {
    return this.installments.due(this.connections.getClient(schema), {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      customerId: customerId || undefined,
      status: status || undefined,
    });
  }

  @Post('sales-invoices/:id/share-link')
  @RequirePermissions(S.view)
  async shareInvoice(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('origin') origin?: string,
  ): Promise<DocumentShareLinkDto> {
    const invoice = await this.invoices.getById(this.connections.getClient(schema), id);
    if (invoice.status === 'cancelled') throw cannotShareCancelled();
    return this.shares.createLink(schema, 'sales_invoice', id, origin);
  }

  @Post('payments-received/:id/share-link')
  @RequirePermissions(S.view)
  async sharePayment(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('origin') origin?: string,
  ): Promise<DocumentShareLinkDto> {
    const payment = await this.payments.getById(this.connections.getClient(schema), id);
    if (payment.status === 'cancelled') throw cannotShareCancelled();
    return this.shares.createLink(schema, 'payment_received', id, origin);
  }
}

function cannotShareCancelled(): BusinessRuleError {
  return new BusinessRuleError('A cancelled document cannot be shared.', { code: 'DOCUMENT_SHARE.CANCELLED' });
}
