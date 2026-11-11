import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PosExchangeDto, PosReturnResultDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import type { PosCheckoutInput, PosCheckoutResult } from '../../domain/pos-sale.entity';
import { POS_SESSION_REPOSITORY, type PosSessionRepository } from '../ports/pos-session.repository';
import { BusinessRuleError } from '../errors';
import { CustomerRefundsService } from './customer-refunds.service';
import { PosOperationsService, type PosActor } from './pos-operations.service';
import { PosSalesService } from './pos-sales.service';

export interface PosExchangeResult {
  return: PosReturnResultDto;
  sale: PosCheckoutResult;
  credit: Money;
  /** Sale total − credit: > 0 the customer paid it, < 0 it went back to them. */
  balance: Money;
}

/**
 * استبدال at the till: the return and the new sale in ONE transaction, built only from the
 * existing steps (no new money flow):
 *   1. the return, kept as the customer's credit (a credit note, no refund yet);
 *   2. the new sale, paid by the cashier's tenders PLUS a cash tender worth the credit — cash
 *      beyond the sale total is change, as at any checkout;
 *   3. a cash refund of the credit note from the same drawer.
 * The drawer nets to exactly what changed hands (sale total − credit), every document is fully
 * settled, and Accounting sees the same events as a separate return and sale.
 */
@Injectable()
export class PosExchangeService {
  constructor(
    @Inject(POS_SESSION_REPOSITORY) private readonly sessions: PosSessionRepository,
    private readonly operations: PosOperationsService,
    private readonly sales: PosSalesService,
    private readonly refunds: CustomerRefundsService,
  ) {}

  async exchange(
    db: Kysely<TenantDatabase>,
    sessionId: string,
    input: { return: PosExchangeDto['return']; sale: PosCheckoutInput },
    actor: PosActor & { canSupervise: boolean },
  ): Promise<PosExchangeResult> {
    return withTransaction(db, async (trx) => {
      const session = await this.sessions.findById(trx, sessionId);
      if (!session) throw entityNotFound('POS_SESSION', sessionId);
      const currency = session.openingCashAmount.currency;

      // 1. The return, as credit (the PIN, if one is asked, covers the whole exchange).
      const returned = await this.operations.processReturn(
        trx,
        sessionId,
        { ...input.return, refund: null, approvalPin: input.sale.approvalPin ?? null },
        actor,
      );
      const credit = Money.fromMinorUnits(BigInt(returned.amount.amountMinorUnits), returned.amount.currency);
      if (credit.currency !== currency) {
        throw new BusinessRuleError('An exchange must be in the shift currency.', { code: 'POS_SALE.SESSION_CURRENCY_MISMATCH' });
      }

      // 2. The new sale, the credit counted as cash handed over.
      const tenders = credit.isPositive()
        ? [...input.sale.tenders, { paymentMethod: 'cash' as const, amount: credit, referenceNumber: returned.creditNoteNumber, treasuryId: null }]
        : input.sale.tenders;
      const sale = await this.sales.checkout(trx, sessionId, { ...input.sale, tenders }, actor.schema, actor.userId, {
        canSupervise: actor.canSupervise,
        permissions: actor.permissions,
      });

      // 3. The credit leaves the drawer as the refund of that credit note.
      if (credit.isPositive()) {
        const customerId = sale.salesOrder.customerId;
        await this.refunds.create(
          trx,
          {
            customerId: await this.returnCustomer(trx, returned.creditNoteId, customerId),
            amount: credit,
            paymentMethod: 'cash',
            treasuryId: session.treasuryId,
            salesCreditNoteId: returned.creditNoteId,
            posSessionId: sessionId,
            approvedByUserId: null,
            reference: returned.returnNumber,
            notes: `استبدال · ${sale.salesInvoice.invoiceNumber}`,
          },
          { schema: actor.schema, actorUserId: actor.userId },
        );
      }

      return { return: returned, sale, credit, balance: sale.salesInvoice.totalAmount.subtract(credit) };
    });
  }

  /** The refund belongs to the customer of the returned sale (the walk-in customer on most receipts). */
  private async returnCustomer(db: Kysely<TenantDatabase>, creditNoteId: string, fallback: string): Promise<string> {
    const row = await db.selectFrom('sales_credit_notes').select('customer_id').where('id', '=', creditNoteId).executeTakeFirst();
    return row?.customer_id ?? fallback;
  }
}
