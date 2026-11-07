import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  purchaseDebitNoteSchema,
  purchaseDebitNotesQuerySchema,
  purchaseDebitNoteWithLinesSchema,
  type PurchaseDebitNoteDto,
  type PurchaseDebitNotesQueryDto,
  type PurchaseDebitNoteWithLinesDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { totalsToDto } from '../../../shared/taxes/line-tax-snapshot';
import {
  PurchaseDebitNotesService,
  type DebitNoteRecord,
} from '../application/services/purchase-debit-notes.service';
import { moneyToDto } from './money.mapper';

function noteToDto(note: DebitNoteRecord): PurchaseDebitNoteDto {
  return purchaseDebitNoteSchema.parse({ ...note, totalAmount: totalsToDto(note.totals).totalAmount });
}

function noteWithLinesToDto(note: DebitNoteRecord): PurchaseDebitNoteWithLinesDto {
  const { totals, ...header } = note;
  return purchaseDebitNoteWithLinesSchema.parse({
    ...header,
    ...totalsToDto(totals),
    lines: note.lines.map((line) => ({ ...line, netAmount: moneyToDto(line.netAmount) })),
  });
}

/**
 * Read-only — a debit note is always issued by PurchaseReturnsService.confirm() for the
 * invoiced part of a return; there is nothing to create, edit or delete here. No
 * PlanFeatureGuard, like the sales credit notes it mirrors.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('purchase-debit-notes')
export class PurchaseDebitNotesController {
  constructor(
    private readonly service: PurchaseDebitNotesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(purchaseDebitNotesQuerySchema)) query: PurchaseDebitNotesQueryDto,
  ): Promise<PurchaseDebitNoteDto[]> {
    const notes = await this.service.list(this.connections.getClient(schema), query);
    return notes.map(noteToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PurchaseDebitNoteWithLinesDto> {
    return noteWithLinesToDto(await this.service.getById(this.connections.getClient(schema), id));
  }
}
