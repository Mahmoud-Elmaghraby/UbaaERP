import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  bankAccountSchema,
  bankAccountRegisterSchema,
  bankAccountRegisterLineSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  type BankAccountDto,
  type BankAccountRegisterDto,
  type BankAccountRegisterLineDto,
  type CreateBankAccountDto,
  type UpdateBankAccountDto,
} from '@erp-platform/contracts';
import type { BankAccount, BankAccountRegister, BankAccountRegisterLine } from '../domain/bank-account.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { BankAccountsService } from '../application/services/bank-accounts.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';
import { moneyToDto } from './money.mapper';

function toDto(bankAccount: BankAccount): BankAccountDto {
  return bankAccountSchema.parse({ ...bankAccount, openingBalance: moneyToDto(bankAccount.openingBalance) });
}

function lineToDto(line: BankAccountRegisterLine): BankAccountRegisterLineDto {
  return bankAccountRegisterLineSchema.parse({
    ...line,
    debitAmount: moneyToDto(line.debitAmount),
    creditAmount: moneyToDto(line.creditAmount),
    runningBalance: moneyToDto(line.runningBalance),
  });
}

function registerToDto(register: BankAccountRegister): BankAccountRegisterDto {
  return bankAccountRegisterSchema.parse({
    ...register,
    openingBalance: moneyToDto(register.openingBalance),
    closingBalance: moneyToDto(register.closingBalance),
    lines: register.lines.map((line) => ({
      ...line,
      debitAmount: moneyToDto(line.debitAmount),
      creditAmount: moneyToDto(line.creditAmount),
      runningBalance: moneyToDto(line.runningBalance),
    })),
  });
}

/**
 * Bank Accounts (CLAUDE.md §10 — step 5, Accounting, Stage 5). CRUD
 * plus two read/action endpoints: the register (getRegister — a
 * general-ledger-shaped view of this account's own linked GL account,
 * with running balance and reconciliation status) and reconcile/
 * unreconcile (toggle one line's isReconciled flag). No PlanFeatureGuard
 * yet, same deliberate, tracked gap as every other module's controllers.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.manage')
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(
    private readonly service: BankAccountsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: AccountingEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('isActive') isActive?: string,
  ): Promise<BankAccountDto[]> {
    const db = this.connections.getClient(schema);
    const bankAccounts = await this.service.list(db, {
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
    return bankAccounts.map(toDto);
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<BankAccountDto> {
    const db = this.connections.getClient(schema);
    const bankAccount = await this.service.getById(db, id);
    return toDto(bankAccount);
  }

  @Get(':id/register')
  async getRegister(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<BankAccountRegisterDto> {
    const db = this.connections.getClient(schema);
    const register = await this.service.getRegister(db, id, fromDate, toDate);
    return registerToDto(register);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createBankAccountSchema)) body: CreateBankAccountDto,
  ): Promise<BankAccountDto> {
    const db = this.connections.getClient(schema);
    const bankAccount = await this.service.create(db, body);
    this.events.publish('bank_account', 'created', { schema, entityId: bankAccount.id, actorUserId: user.sub });
    return toDto(bankAccount);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBankAccountSchema)) body: UpdateBankAccountDto,
  ): Promise<BankAccountDto> {
    const db = this.connections.getClient(schema);
    const bankAccount = await this.service.update(db, id, body);
    this.events.publish('bank_account', 'updated', { schema, entityId: bankAccount.id, actorUserId: user.sub });
    return toDto(bankAccount);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('bank_account', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }

  @Post(':id/lines/:lineId/reconcile')
  async reconcileLine(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<BankAccountRegisterLineDto> {
    const db = this.connections.getClient(schema);
    const line = await this.service.setLineReconciled(db, id, lineId, true);
    this.events.publish('bank_account', 'line_reconciled', {
      schema,
      entityId: id,
      actorUserId: user.sub,
      metadata: { lineId },
    });
    return lineToDto(line);
  }

  @Post(':id/lines/:lineId/unreconcile')
  async unreconcileLine(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<BankAccountRegisterLineDto> {
    const db = this.connections.getClient(schema);
    const line = await this.service.setLineReconciled(db, id, lineId, false);
    this.events.publish('bank_account', 'line_unreconciled', {
      schema,
      entityId: id,
      actorUserId: user.sub,
      metadata: { lineId },
    });
    return lineToDto(line);
  }
}
