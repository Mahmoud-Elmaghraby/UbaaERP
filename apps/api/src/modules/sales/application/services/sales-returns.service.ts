import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { SALES_RETURN_REPOSITORY, type SalesReturnRepository } from '../ports/sales-return.repository';
import {
  SALES_RETURN_LINE_REPOSITORY,
  type SalesReturnLineRepository,
} from '../ports/sales-return-line.repository';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../ports/delivery.repository';
import { DELIVERY_LINE_REPOSITORY, type DeliveryLineRepository } from '../ports/delivery-line.repository';
import type {
  SalesReturn,
  SalesReturnWithLines,
  SalesReturnConfirmation,
  SalesReturnStatus,
  CreateSalesReturnInput,
} from '../../domain/sales-return.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { SalesCreditNotesService } from './sales-credit-notes.service';

/**
 * Records goods physically sent back by a customer after a confirmed
 * delivery (master doc §10, step 4 — Sales, Stage 7; the approved
 * research-pass addition). Direct mirror of PurchaseReturnsService,
 * direction flipped (stock comes back IN, not OUT) — see that class's
 * comment for the shared reasoning; not repeated here except where this
 * stage differs (see SalesReturnStockListener, inventory module, for
 * the 'in' movement's cost handling — a real difference from
 * PurchaseReturnStockListener's cost-free 'out').
 *
 * Same two-step shape as every prior document: create() persists a
 * 'draft' return, already validated against how much of the referenced
 * delivery lines can still be returned, but with no stock effect.
 * confirm() is the one-way door that publishes the Event Bus
 * integration event SalesReturnStockListener (in the inventory module)
 * consumes to actually increase stock — never a direct call into
 * Inventory (CLAUDE.md §2.6).
 *
 * Deliberately does NOT touch the parent sales order's
 * partially_delivered/fully_delivered status — that status reflects
 * what was delivered (a historical fact), not "delivered minus
 * returned". Same deliberate scope boundary Purchase Returns drew
 * against the purchase order's received status.
 *
 * Deliberately does NOT touch any Sales Invoice or Payment Received —
 * a financial credit note reducing what a customer owes (or crediting
 * them back) is a distinct mechanism with its own design questions
 * (how it interacts with an already-posted, immutable invoice total)
 * that needs explicit approval, not something invented here. See
 * migration 0047's comment and claude/sales-module-status.md.
 */
@Injectable()
export class SalesReturnsService {
  constructor(
    @Inject(SALES_RETURN_REPOSITORY) private readonly returns: SalesReturnRepository,
    @Inject(SALES_RETURN_LINE_REPOSITORY) private readonly lines: SalesReturnLineRepository,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
    @Inject(DELIVERY_LINE_REPOSITORY) private readonly deliveryLines: DeliveryLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly creditNotes: SalesCreditNotesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SalesReturn[]> {
    return this.returns.list(db);
  }

  listByDeliveryId(db: Kysely<TenantDatabase>, deliveryId: string): Promise<SalesReturn[]> {
    return this.returns.listByDeliveryId(db, deliveryId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesReturnWithLines> {
    const salesReturn = await this.returns.findById(db, id);
    if (!salesReturn) throw entityNotFound('SALES_RETURN', id);
    const lines = await this.lines.listBySalesReturnId(db, id);
    return { ...salesReturn, lines };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesReturnInput): Promise<SalesReturnWithLines> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A sales return must have at least one line.', {
        code: 'SALES_RETURN.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }

    const delivery = await this.deliveries.findById(db, input.deliveryId);
    if (!delivery) throw entityNotFound('DELIVERY', input.deliveryId);
    if (delivery.status !== 'confirmed') {
      throw new BusinessRuleError(
        `Delivery "${input.deliveryId}" is "${delivery.status}" — only a confirmed delivery ` +
          '(one that actually shipped) can have anything returned against it.',
        {
          code: 'SALES_RETURN.DELIVERY_NOT_CONFIRMED',
          params: { id: input.deliveryId, status: delivery.status },
        },
      );
    }

    const deliveryLinesList = await this.deliveryLines.listByDeliveryId(db, delivery.id);
    const deliveryLineById = new Map(deliveryLinesList.map((line) => [line.id, line]));
    for (const line of input.lines) {
      if (!deliveryLineById.has(line.deliveryLineId)) {
        throw new NotFoundError(
          `Delivery line "${line.deliveryLineId}" was not found on delivery "${delivery.id}".`,
          {
            code: 'SALES_RETURN.DELIVERY_LINE_NOT_FOUND',
            params: { lineId: line.deliveryLineId, deliveryId: delivery.id },
          },
        );
      }
    }

    const alreadyReturned = await this.lines.sumReturnedQuantityByDeliveryLineIds(
      db,
      input.lines.map((line) => line.deliveryLineId),
    );
    for (const line of input.lines) {
      const deliveryLine = deliveryLineById.get(line.deliveryLineId)!;
      const returned = alreadyReturned[line.deliveryLineId] ?? 0;
      const remaining = deliveryLine.quantityDelivered - returned;
      if (line.quantityReturned > remaining) {
        throw new BusinessRuleError(
          `Cannot return ${line.quantityReturned} against delivery line "${line.deliveryLineId}" — ` +
            `only ${remaining} remaining returnable (delivered ${deliveryLine.quantityDelivered}, already returned ${returned}).`,
          {
            code: 'SALES_RETURN.QUANTITY_EXCEEDS_REMAINING',
            params: {
              lineId: line.deliveryLineId,
              quantityReturned: line.quantityReturned,
              remaining,
              quantityDelivered: deliveryLine.quantityDelivered,
              returned,
            },
          },
        );
      }
    }

    try {
      return await db.transaction().execute(async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'sales_return', null);

        const salesReturn = await this.returns.create(trx, {
          returnNumber: allocated.formatted,
          deliveryId: delivery.id,
          returnDate: input.returnDate ?? null,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
        });

        const createdLines = [];
        for (const line of input.lines) {
          const deliveryLine = deliveryLineById.get(line.deliveryLineId)!;
          createdLines.push(
            await this.lines.create(trx, salesReturn.id, {
              deliveryLineId: line.deliveryLineId,
              productVariantId: deliveryLine.productVariantId,
              quantityReturned: line.quantityReturned,
              reason: line.reason ?? null,
              notes: line.notes ?? null,
              unitOfMeasureId: deliveryLine.unitOfMeasureId,
              unitFactor: deliveryLine.unitFactor,
            }),
          );
        }

        return { ...salesReturn, lines: createdLines };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given delivery or delivery line does not exist.', {
          code: 'SALES_RETURN.DELIVERY_OR_LINE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for sales returns yet. ' +
            'Create one for document type "sales_return" via Settings → Numbering Sequences first.',
          { code: 'SALES_RETURN.NO_NUMBERING_SEQUENCE' },
        );
      }
      throw err;
    }
  }

  /**
   * The one-way door. All in ONE transaction (CLAUDE.md §2.7): flips
   * status, creates the sales credit note (SalesCreditNotesService —
   * see migration 0053), and writes TWO Outbox events — either both
   * commit or neither does:
   *  - 'sales.sales_return.confirmed' (stock fact — Inventory's
   *    SalesReturnStockListener consumes it to increase stock, and,
   *    transitively, to emit its own COGS-reversal event for
   *    Accounting's Stage 6).
   *  - 'sales.sales_credit_note.issued' (financial fact — Accounting's
   *    Stage 7 listener consumes it to reverse the recognized revenue).
   * Both now go through the Outbox, not a direct post-commit publish()
   * call — see DeliveriesService.confirm()'s own comment for why a
   * stock-movement event needs the same reliability once something
   * financial (COGS, here a credit note) depends on it arriving.
   */
  async confirm(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<SalesReturnConfirmation> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('SALES_RETURN', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot confirm sales return "${id}" from its current status "${existing.status}" (expected "draft").`,
        { code: 'SALES_RETURN.NOT_CONFIRMABLE', params: { id, status: existing.status } },
      );
    }

    return db.transaction().execute(async (trx) => {
      const updated = await this.returns.updateStatus(trx, id, 'confirmed');
      if (!updated) throw entityNotFound('SALES_RETURN', id);
      const lines = await this.lines.listBySalesReturnId(trx, id);

      const delivery = await this.deliveries.findById(trx, updated.deliveryId);
      if (!delivery) {
        throw entityNotFound('DELIVERY', updated.deliveryId);
      }

      const returnWithLines = { ...updated, lines };
      const creditNote = await this.creditNotes.createFromSalesReturn(trx, returnWithLines);

      await this.outboxWriter.write(trx, 'sales.sales_return.confirmed', {
        schema,
        entityType: 'sales_return',
        entityId: updated.id,
        action: 'confirmed',
        actorUserId,
        metadata: {
          deliveryId: updated.deliveryId,
          warehouseId: delivery.warehouseId,
          lines: lines.map((line) => ({
            productVariantId: line.productVariantId,
            // Base units for Inventory (line quantity is in the line's own unit).
            quantity: Math.round(line.quantityReturned * line.unitFactor * 10_000) / 10_000,
          })),
        },
        occurredAt: new Date(),
      });

      await this.outboxWriter.write(trx, 'sales.sales_credit_note.issued', {
        schema,
        entityType: 'sales_credit_note',
        entityId: creditNote.id,
        action: 'issued',
        actorUserId,
        metadata: {
          salesReturnId: updated.id,
          customerId: creditNote.customerId,
          currency: creditNote.currency,
          totalAmount: {
            amountMinorUnits: creditNote.totalAmount.toMinorUnits().toString(),
            currency: creditNote.totalAmount.currency,
          },
        },
        occurredAt: new Date(),
      });

      return { ...returnWithLines, warehouseId: delivery.warehouseId, creditNoteId: creditNote.id };
    });
  }

  private async transitionStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    from: SalesReturnStatus[],
    to: SalesReturnStatus,
  ): Promise<SalesReturn> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('SALES_RETURN', id);
    if (!from.includes(existing.status)) {
      throw new BusinessRuleError(
        `Cannot move sales return "${id}" to "${to}" from its current status "${existing.status}" ` +
          `(expected one of: ${from.join(', ')}).`,
        {
          code: 'SALES_RETURN.INVALID_STATUS_TRANSITION',
          params: { id, to, from: existing.status, expected: from.join(', ') },
        },
      );
    }
    const updated = await this.returns.updateStatus(db, id, to);
    if (!updated) throw entityNotFound('SALES_RETURN', id);
    return updated;
  }

  cancel(db: Kysely<TenantDatabase>, id: string): Promise<SalesReturn> {
    return this.transitionStatus(db, id, ['draft'], 'cancelled');
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.returns.findById(db, id);
    if (!existing) throw entityNotFound('SALES_RETURN', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Sales return "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'SALES_RETURN.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.returns.delete(db, id);
  }
}
