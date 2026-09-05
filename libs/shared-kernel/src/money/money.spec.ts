import { InvalidMoneyOperationError, Money } from './money';

describe('Money', () => {
  it('constructs from minor units and round-trips a decimal string', () => {
    const m = Money.fromMinorUnits(1250, 'EGP');
    expect(m.toMinorUnits()).toBe(1250n);
    expect(m.toDecimalString()).toBe('12.50');
    expect(m.currency).toBe('EGP');
  });

  it('rejects a fractional minor-units amount (would mean a hidden float)', () => {
    expect(() => Money.fromMinorUnits(12.5, 'EGP')).toThrow(InvalidMoneyOperationError);
  });

  it('rejects a currency code that is not three uppercase letters', () => {
    expect(() => Money.fromMinorUnits(100, 'egp')).toThrow(InvalidMoneyOperationError);
    expect(() => Money.fromMinorUnits(100, 'EG')).toThrow(InvalidMoneyOperationError);
  });

  it('adds and subtracts amounts in the same currency', () => {
    const a = Money.fromMinorUnits(1000, 'EGP');
    const b = Money.fromMinorUnits(250, 'EGP');
    expect(a.add(b).toMinorUnits()).toBe(1250n);
    expect(a.subtract(b).toMinorUnits()).toBe(750n);
  });

  it('throws when combining different currencies', () => {
    const egp = Money.fromMinorUnits(100, 'EGP');
    const usd = Money.fromMinorUnits(100, 'USD');
    expect(() => egp.add(usd)).toThrow(InvalidMoneyOperationError);
    expect(() => egp.compareTo(usd)).toThrow(InvalidMoneyOperationError);
  });

  it('multiplies a unit cost by a received quantity (rounding to the nearest minor unit)', () => {
    const unitCost = Money.fromMinorUnits(333, 'EGP'); // 3.33
    expect(unitCost.multiplyByQuantity(3).toMinorUnits()).toBe(999n);
    expect(unitCost.multiplyByQuantity(1.5).toMinorUnits()).toBe(500n); // 4.995 -> rounds to 5.00
  });

  it('divides a total stock value by a quantity on hand for weighted-average unit cost', () => {
    // classic weighted-average example: 10 units @ 10.00 + 10 units @ 12.00 = 220.00 / 20 = 11.00
    const totalValue = Money.fromMinorUnits(1000, 'EGP').add(Money.fromMinorUnits(1200, 'EGP')).multiplyByQuantity(10);
    expect(totalValue.toMinorUnits()).toBe(22000n);
    expect(totalValue.divideByQuantity(20).toDecimalString()).toBe('11.00');
  });

  it('rejects dividing by zero', () => {
    expect(() => Money.fromMinorUnits(100, 'EGP').divideByQuantity(0)).toThrow(InvalidMoneyOperationError);
  });

  it('compares and reports sign correctly', () => {
    const a = Money.fromMinorUnits(500, 'EGP');
    const b = Money.fromMinorUnits(700, 'EGP');
    expect(a.lessThan(b)).toBe(true);
    expect(b.greaterThan(a)).toBe(true);
    expect(Money.zero('EGP').isZero()).toBe(true);
    expect(Money.fromMinorUnits(-1, 'EGP').isNegative()).toBe(true);
    expect(a.isPositive()).toBe(true);
  });

  it('equals compares both amount and currency', () => {
    expect(Money.fromMinorUnits(100, 'EGP').equals(Money.fromMinorUnits(100, 'EGP'))).toBe(true);
    expect(Money.fromMinorUnits(100, 'EGP').equals(Money.fromMinorUnits(100, 'USD'))).toBe(false);
  });
});
