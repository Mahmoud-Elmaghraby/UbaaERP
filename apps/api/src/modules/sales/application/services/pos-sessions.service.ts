import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { POS_SESSION_REPOSITORY, type PosSessionRepository } from '../ports/pos-session.repository';
import type {
  ClosePosSessionInput,
  OpenPosSessionInput,
  PosSession,
  PosSessionFilters,
  PosSessionReport,
} from '../../domain/pos-session.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * POS Cash Sessions (CLAUDE.md §10 — step 4, Sales — POS feature, Stage
 * 1 of claude/sales-pos-research.md). The one genuinely new domain
 * concept the POS feature needs — everything else in the research doc
 * either reuses existing Sales documents (Stage 3's checkout
 * orchestration) or is a small additive field (Stage 2's discounts).
 *
 * open()/close() is a two-step lifecycle, same shape as every other
 * draft->posted-style Sales document, except the "posting" here
 * (close()) is what makes this session's numbers a closed historical
 * fact — see migration 0059's comment on why expected/counted/variance
 * are stored, not derived, from that point on.
 *
 * close() is a financial event (CLAUDE.md §5): a non-zero variance
 * must post a real journal entry (Cash Over/Short), so — exactly like
 * SalesInvoicesService.post()/PaymentsReceivedService.post() — the
 * outbox record is written in the SAME transaction as the status flip,
 * via OutboxWriterService, not the plain Event Bus. AccountingAuto-
 * PostingListeners.handlePosSessionClosed() (accounting-auto-posting.
 * listeners.ts) is the consumer; it does nothing when variance is zero.
 *
 * close() therefore needs `schema` and `actorUserId` as real
 * parameters, the same deliberate exception every other Outbox-writing
 * Sales service method makes.
 */
@Injectable()
export class PosSessionsService {
  constructor(
    @Inject(POS_SESSION_REPOSITORY) private readonly repository: PosSessionRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  list(db: Kysely<TenantDatabase>, filters?: PosSessionFilters): Promise<PosSession[]> {
    return this.repository.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PosSession> {
    const session = await this.repository.findById(db, id);
    if (!session) throw new NotFoundError(`POS session "${id}" not found.`);
    return session;
  }

  getOpenForCashier(db: Kysely<TenantDatabase>, cashierUserId: string): Promise<PosSession | null> {
    return this.repository.findOpenByCashierId(db, cashierUserId);
  }

  /** One open session per cashier at a time — same rule the migration's own partial UNIQUE index enforces at the DB layer; checked here first so the failure is a clean BusinessRuleError, not a raw constraint violation. */
  async open(db: Kysely<TenantDatabase>, input: OpenPosSessionInput): Promise<PosSession> {
    const existing = await this.repository.findOpenByCashierId(db, input.cashierUserId);
    if (existing) {
      throw new BusinessRuleError(
        `This cashier already has an open POS session ("${existing.id}", opened ${existing.openedAt.toISOString()}). Close it before opening a new one.`,
      );
    }
    if (input.openingCashAmount.isNegative()) {
      throw new BusinessRuleError('Opening cash amount cannot be negative.');
    }
    if (!input.warehouseId) {
      throw new BusinessRuleError('A warehouse must be selected to open a POS session (Stage 3 checkout delivers stock from it).');
    }
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError(`Warehouse "${input.warehouseId}" not found.`);
      }
      throw err;
    }
  }

  /**
   * Closes a session: computes expected_cash_amount (opening float +
   * cash tenders recorded during the session — see the repository
   * port's own comment on why this is honestly just the opening float
   * until Stage 3 exists), variance_amount = counted - expected, then
   * atomically flips status to 'closed' and — if variance is non-zero —
   * writes the 'sales.pos_session.closed' outbox record in the same
   * transaction.
   */
  async close(
    db: Kysely<TenantDatabase>,
    id: string,
    input: ClosePosSessionInput,
    schema: string,
    actorUserId: string | null,
  ): Promise<PosSession> {
    const existing = await this.getById(db, id);
    if (existing.status !== 'open') {
      throw new BusinessRuleError(`Cannot close POS session "${id}" — it is already "${existing.status}".`);
    }
    if (input.countedCashAmount.isNegative()) {
      throw new BusinessRuleError('Counted cash amount cannot be negative.');
    }

    const currency = existing.openingCashAmount.currency;
    const cashTendersMinorUnits = await this.repository.sumCashTendersForSession(db, id);
    const cashTendersMoney = cashTendersMinorUnits
      ? Money.fromMinorUnits(BigInt(cashTendersMinorUnits), currency)
      : Money.zero(currency);
    const expectedCashAmount = existing.openingCashAmount.add(cashTendersMoney);
    const varianceAmount = input.countedCashAmount.subtract(expectedCashAmount);

    return db.transaction().execute(async (trx) => {
      const closed = await this.repository.close(trx, id, {
        expectedCashAmount,
        countedCashAmount: input.countedCashAmount,
        varianceAmount,
        notes: input.notes ?? existing.notes ?? null,
        closedAt: new Date(),
      });
      if (!closed) throw new NotFoundError(`POS session "${id}" not found.`);

      if (!varianceAmount.isZero()) {
        await this.outboxWriter.write(trx, 'sales.pos_session.closed', {
          schema,
          entityType: 'pos_session',
          entityId: id,
          action: 'closed',
          actorUserId,
          metadata: {
            cashierUserId: existing.cashierUserId,
            varianceAmount: {
              amountMinorUnits: varianceAmount.toMinorUnits().toString(),
              currency: varianceAmount.currency,
            },
          },
          occurredAt: new Date(),
        });
      }

      return closed;
    });
  }

  /**
   * POS Stage 5 — X Report (session still 'open') / Z Report (session 'closed'), same
   * computation and shape either way — see `PosSessionReport`'s own doc comment
   * (pos-session.entity.ts) for exactly why and what differs between the two states.
   */
  async getReport(db: Kysely<TenantDatabase>, id: string): Promise<PosSessionReport> {
    const session = await this.getById(db, id);
    const currency = session.openingCashAmount.currency;

    const [tenderTotals, salesTotals] = await Promise.all([
      this.repository.sumTendersByMethodForSession(db, id),
      this.repository.countAndSumSalesForSession(db, id),
    ]);

    const tendersByMethod = tenderTotals.map((row) => ({
      paymentMethod: row.paymentMethod,
      amount: Money.fromMinorUnits(BigInt(row.totalMinorUnits), currency),
    }));
    const totalSalesAmount = salesTotals.totalMinorUnits
      ? Money.fromMinorUnits(BigInt(salesTotals.totalMinorUnits), currency)
      : Money.zero(currency);

    let expectedCashAmount: Money;
    let countedCashAmount: Money | null;
    let varianceAmount: Money | null;
    if (session.status === 'closed') {
      // A closed session's figures are stored, immutable historical facts (migration
      // 0059's own comment) — never recomputed here, exactly like close() itself.
      expectedCashAmount = session.expectedCashAmount ?? Money.zero(currency);
      countedCashAmount = session.countedCashAmount;
      varianceAmount = session.varianceAmount;
    } else {
      const cashTendersMinorUnits = await this.repository.sumCashTendersForSession(db, id);
      const cashTendersMoney = cashTendersMinorUnits
        ? Money.fromMinorUnits(BigInt(cashTendersMinorUnits), currency)
        : Money.zero(currency);
      expectedCashAmount = session.openingCashAmount.add(cashTendersMoney);
      countedCashAmount = null;
      varianceAmount = null;
    }

    return {
      session,
      salesCount: salesTotals.salesCount,
      totalSalesAmount,
      tendersByMethod,
      expectedCashAmount,
      countedCashAmount,
      varianceAmount,
      generatedAt: new Date(),
    };
  }
}
