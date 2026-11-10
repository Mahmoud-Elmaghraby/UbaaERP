import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  cancelCustomerRefundSchema,
  createCustomerRefundSchema,
  type CancelCustomerRefundDto,
  type CreateCustomerRefundDto,
  type CustomerRefundDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CustomerRefundsService } from '../application/services/customer-refunds.service';
import { moneyFromDto } from './money.mapper';
import { CheckDocumentDates } from '../../../shared/app-settings/document-date';

/** رد مبلغ لعميل — money paid back to a customer out of a treasury (migration 0113). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customer-refunds')
export class CustomerRefundsController {
  constructor(
    private readonly service: CustomerRefundsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions(S.view)
  list(
    @CurrentTenantSchema() schema: string,
    @Query('customerId') customerId?: string,
    @Query('posSessionId') posSessionId?: string,
  ): Promise<CustomerRefundDto[]> {
    return this.service.list(this.connections.getClient(schema), { customerId, posSessionId });
  }

  /** The credit a customer holds in a currency — the most that can be refunded. */
  @Get('available')
  @RequirePermissions(S.view)
  async available(
    @CurrentTenantSchema() schema: string,
    @Query('customerId') customerId: string,
    @Query('currency') currency: string,
  ): Promise<{ amountMinorUnits: string; currency: string }> {
    const credit = await this.service.availableCredit(this.connections.getClient(schema), customerId, currency);
    return { amountMinorUnits: credit.toString(), currency };
  }

  @Get(':id')
  @RequirePermissions(S.view)
  getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<CustomerRefundDto> {
    return this.service.getById(this.connections.getClient(schema), id);
  }

  @Post()
  @CheckDocumentDates('refundDate')
  @RequirePermissions(S.post)
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createCustomerRefundSchema)) body: CreateCustomerRefundDto,
  ): Promise<CustomerRefundDto> {
    return this.service.create(
      this.connections.getClient(schema),
      {
        customerId: body.customerId,
        amount: moneyFromDto(body.amount),
        paymentMethod: body.paymentMethod,
        treasuryId: body.treasuryId ?? null,
        refundDate: body.refundDate ?? null,
        salesCreditNoteId: body.salesCreditNoteId ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
      },
      { schema, actorUserId: user.sub },
    );
  }

  @Post(':id/cancel')
  @RequirePermissions(S.cancel)
  cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelCustomerRefundSchema)) body: CancelCustomerRefundDto,
  ): Promise<CustomerRefundDto> {
    return this.service.cancel(this.connections.getClient(schema), id, body.reason, { schema, actorUserId: user.sub });
  }
}
