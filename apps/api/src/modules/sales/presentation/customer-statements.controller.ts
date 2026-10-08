import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import {
  partyBalancesQuerySchema,
  partyStatementQuerySchema,
  setOpeningBalanceSchema,
  type OpeningBalanceDto,
  type PartyBalancesQueryDto,
  type PartyBalancesReportDto,
  type PartyStatementDto,
  type PartyStatementQueryDto,
  type SetOpeningBalanceDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { OutboxWriterService } from '../../../shared/outbox/application/services/outbox-writer.service';
import {
  getOpeningBalance,
  getPartyBalances,
  getPartyStatement,
  setOpeningBalance,
} from '../../../shared/statements/party-statements';
import { CustomerLedgerSource } from '../infrastructure/statements/customer-ledger.source';

/**
 * Customer account statement, receivables (balances + aging) and opening
 * balances — computed from Sales documents, so they work with Accounting
 * off. No PlanFeatureGuard: customers' balances are core Sales, like Customers.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller()
export class CustomerStatementsController {
  constructor(
    private readonly connections: TenantConnectionManager,
    private readonly ledger: CustomerLedgerSource,
    private readonly outbox: OutboxWriterService,
  ) {}

  @Get('customer-balances')
  balances(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(partyBalancesQuerySchema)) query: PartyBalancesQueryDto,
  ): Promise<PartyBalancesReportDto> {
    return getPartyBalances(this.connections.getClient(schema), this.ledger, query);
  }

  @Get('customers/:id/statement')
  statement(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(partyStatementQuerySchema)) query: PartyStatementQueryDto,
  ): Promise<PartyStatementDto> {
    return getPartyStatement(this.connections.getClient(schema), this.ledger, id, query);
  }

  @Get('customers/:id/opening-balance')
  openingBalance(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OpeningBalanceDto> {
    return getOpeningBalance(this.connections.getClient(schema), this.ledger, id);
  }

  @Put('customers/:id/opening-balance')
  setOpeningBalance(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(setOpeningBalanceSchema)) body: SetOpeningBalanceDto,
  ): Promise<OpeningBalanceDto> {
    return setOpeningBalance(
      this.connections.getClient(schema),
      this.ledger,
      this.outbox,
      { schema, actorUserId: user.sub },
      id,
      body,
    );
  }
}
