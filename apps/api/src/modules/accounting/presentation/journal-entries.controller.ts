import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  journalEntrySchema,
  journalEntryWithLinesSchema,
  createJournalEntrySchema,
  updateJournalEntrySchema,
  reverseJournalEntrySchema,
  type JournalEntryDto,
  type JournalEntryWithLinesDto,
  type CreateJournalEntryDto,
  type UpdateJournalEntryDto,
  type ReverseJournalEntryDto,
  type JournalEntryStatus,
} from '@erp-platform/contracts';
import type { JournalEntry, JournalEntryWithLines } from '../domain/journal-entry.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { JournalEntriesService } from '../application/services/journal-entries.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';
import { moneyToDto } from './money.mapper';

function entryToDto(entry: JournalEntry): JournalEntryDto {
  return journalEntrySchema.parse(entry);
}

function entryWithLinesToDto(entry: JournalEntryWithLines): JournalEntryWithLinesDto {
  return journalEntryWithLinesSchema.parse({
    ...entry,
    lines: entry.lines.map((line) => ({
      ...line,
      debitAmount: moneyToDto(line.debitAmount),
      creditAmount: moneyToDto(line.creditAmount),
    })),
  });
}

/**
 * Journal Entries (CLAUDE.md §10 — step 5, Accounting, Stage 2). Manual
 * entries only — no PlanFeatureGuard yet, same deliberate, tracked gap
 * as every other module (see ChartOfAccountsController's own comment).
 *
 * post()/cancel()/reverse() still publish through AccountingEventPublisher
 * (plain EventEmitter2), NOT the Outbox — unlike PurchaseInvoicesController's
 * post(), this is Accounting's own audit trail for its own entity, not an
 * integration event another module needs to reliably observe (see
 * AccountingEventPublisher's own class comment).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.manage')
@Controller('journal-entries')
export class JournalEntriesController {
  constructor(
    private readonly service: JournalEntriesService,
    private readonly connections: TenantConnectionManager,
    private readonly events: AccountingEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: JournalEntryStatus,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<JournalEntryDto[]> {
    const db = this.connections.getClient(schema);
    const entries = await this.service.list(db, { status, fromDate, toDate });
    return entries.map(entryToDto);
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<JournalEntryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.getById(db, id);
    return entryWithLinesToDto(entry);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createJournalEntrySchema)) body: CreateJournalEntryDto,
  ): Promise<JournalEntryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.create(db, body);
    this.events.publish('journal_entry', 'created', { schema, entityId: entry.id, actorUserId: user.sub });
    return entryWithLinesToDto(entry);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateJournalEntrySchema)) body: UpdateJournalEntryDto,
  ): Promise<JournalEntryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.update(db, id, body);
    this.events.publish('journal_entry', 'updated', { schema, entityId: entry.id, actorUserId: user.sub });
    return entryWithLinesToDto(entry);
  }

  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<JournalEntryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.post(db, id);
    this.events.publish('journal_entry', 'posted', { schema, entityId: entry.id, actorUserId: user.sub });
    return entryWithLinesToDto(entry);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<JournalEntryDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.cancel(db, id);
    this.events.publish('journal_entry', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return entryToDto(entry);
  }

  @Post(':id/reverse')
  async reverse(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reverseJournalEntrySchema)) body: ReverseJournalEntryDto,
  ): Promise<JournalEntryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const entry = await this.service.reverse(db, id, body);
    this.events.publish('journal_entry', 'reversed', {
      schema,
      entityId: entry.id,
      actorUserId: user.sub,
      metadata: { reversalOfEntryId: id },
    });
    return entryWithLinesToDto(entry);
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
    this.events.publish('journal_entry', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
