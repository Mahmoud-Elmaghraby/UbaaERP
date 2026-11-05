import { Money } from '@erp-platform/shared-kernel';
import { assertSessionUsable, settleTenders } from './pos-rules';

const egp = (minor: number) => Money.fromMinorUnits(minor, 'EGP');
const tender = (paymentMethod: string, minor: number) => ({ paymentMethod, amount: egp(minor) });

describe('POS tenders', () => {
  it('gives change from cash and records only what the sale kept', () => {
    const { tenders, change } = settleTenders([tender('cash', 20000)], egp(18735));
    expect(change.toMinorUnits()).toBe(1265n);
    expect(tenders.map((t) => t.amount.toMinorUnits())).toEqual([18735n]);
  });

  it('takes change only out of cash in a split payment', () => {
    const { tenders, change } = settleTenders([tender('card', 10000), tender('cash', 10000)], egp(15000));
    expect(change.toMinorUnits()).toBe(5000n);
    expect(tenders.map((t) => [t.paymentMethod, t.amount.toMinorUnits()])).toEqual([
      ['card', 10000n],
      ['cash', 5000n],
    ]);
  });

  it('refuses a short payment and a card above the total', () => {
    expect(() => settleTenders([tender('cash', 100)], egp(200))).toThrow();
    expect(() => settleTenders([tender('card', 300)], egp(200))).toThrow();
  });

  it('takes no tender for a free sale', () => {
    expect(settleTenders([], egp(0)).tenders).toEqual([]);
  });

  it('keeps cashiers in their own session unless supervising', () => {
    const session = { status: 'open', cashierUserId: 'u1' };
    expect(() => assertSessionUsable(session, 's', 'u2', false)).toThrow();
    expect(() => assertSessionUsable(session, 's', 'u2', true)).not.toThrow();
    expect(() => assertSessionUsable({ ...session, status: 'closed' }, 's', 'u1', false)).toThrow();
  });
});
