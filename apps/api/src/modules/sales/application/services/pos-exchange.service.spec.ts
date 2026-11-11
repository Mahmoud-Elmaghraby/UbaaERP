import { Money } from '@erp-platform/shared-kernel';
import { PosExchangeService } from './pos-exchange.service';

// The real collaborators pull the Prisma client in through their imports; this test passes fakes.
jest.mock('./pos-sales.service', () => ({ PosSalesService: class {} }));
jest.mock('./pos-operations.service', () => ({ PosOperationsService: class {} }));
jest.mock('./customer-refunds.service', () => ({ CustomerRefundsService: class {} }));
jest.mock('../../../../database/tenant/transaction.util', () => ({
  withTransaction: (db: unknown, fn: (trx: unknown) => unknown) => fn(db),
}));

const egp = (minor: number) => Money.fromMinorUnits(BigInt(minor), 'EGP');

function setup(saleTotal: number, creditMinor: number) {
  const calls: string[] = [];
  const sessions = { findById: jest.fn().mockResolvedValue({ id: 's1', openingCashAmount: egp(0), treasuryId: 'drawer' }) };
  const operations = {
    processReturn: jest.fn().mockImplementation(async (_db, _id, input) => {
      calls.push(`return refund=${String(input.refund)}`);
      return { salesReturnId: 'r1', returnNumber: 'SR-1', creditNoteId: 'cn1', creditNoteNumber: 'CN-1', amount: { amountMinorUnits: String(creditMinor), currency: 'EGP' }, refund: null };
    }),
  };
  const sales = {
    checkout: jest.fn().mockImplementation(async (_db, _id, input) => {
      calls.push(`checkout tenders=${input.tenders.map((t: { paymentMethod: string; amount: Money }) => `${t.paymentMethod}:${t.amount.toMinorUnits()}`).join(',')}`);
      return { salesOrder: { customerId: 'walk-in' }, salesInvoice: { invoiceNumber: 'INV-2', totalAmount: egp(saleTotal) }, payments: [], changeAmount: egp(0) };
    }),
  };
  const refunds = {
    create: jest.fn().mockImplementation(async (_db, input) => {
      calls.push(`refund ${input.paymentMethod}:${input.amount.toMinorUnits()} note=${input.salesCreditNoteId}`);
      return {};
    }),
  };
  const db = { selectFrom: () => ({ select: () => ({ where: () => ({ executeTakeFirst: async () => ({ customer_id: 'walk-in' }) }) }) }) };
  const service = new PosExchangeService(sessions as never, operations as never, sales as never, refunds as never);
  return { service, calls, db };
}

const input = (tenders: { paymentMethod: 'cash' | 'card'; amount: Money }[]) => ({
  return: { deliveryId: 'd1', lines: [{ deliveryLineId: 'dl1', quantity: 1 }] },
  sale: { lines: [], tenders, approvalPin: '1234' },
});
const actor = { schema: 't', userId: 'u', permissions: [], canSupervise: false };

describe('PosExchangeService', () => {
  it('return as credit → sale paid by tenders + the credit as cash → cash refund of the credit note', async () => {
    const { service, calls, db } = setup(25000, 20000);
    const result = await service.exchange(db as never, 's1', input([{ paymentMethod: 'card', amount: egp(5000) }]) as never, actor);
    expect(calls).toEqual(['return refund=null', 'checkout tenders=card:5000,cash:20000', 'refund cash:20000 note=cn1']);
    expect(result.balance.toMinorUnits()).toBe(5000n);
  });

  it('a cheaper new item: no tenders, the balance is what goes back', async () => {
    const { service, calls, db } = setup(18000, 25000);
    const result = await service.exchange(db as never, 's1', input([]) as never, actor);
    expect(calls).toEqual(['return refund=null', 'checkout tenders=cash:25000', 'refund cash:25000 note=cn1']);
    expect(result.balance.toMinorUnits()).toBe(-7000n);
  });
});
