import { Money } from '@erp-platform/shared-kernel';
import { allocationLinesDto, lotsDetails, paymentMethodLabel } from './print-helpers';

describe('print helpers', () => {
  it('prints one row per allocated invoice plus the on-account remainder', () => {
    const lines = allocationLinesDto(
      [{ invoiceNumber: 'INV-00001', amount: Money.fromMinorUnits(15000n, 'EGP') }],
      Money.fromMinorUnits(5000n, 'EGP'),
    );
    expect(lines).toEqual([
      { description: 'سداد فاتورة INV-00001', amount: { amountMinorUnits: '15000', currency: 'EGP' } },
      { description: 'دفعة تحت الحساب', amount: { amountMinorUnits: '5000', currency: 'EGP' } },
    ]);
  });

  it('omits the on-account row when the payment is fully allocated', () => {
    const lines = allocationLinesDto(
      [{ invoiceNumber: 'INV-00001', amount: Money.fromMinorUnits(15000n, 'EGP') }],
      Money.zero('EGP'),
    );
    expect(lines).toHaveLength(1);
  });

  it('describes lots with expiry, then the line notes', () => {
    expect(
      lotsDetails(
        [
          { lotNumber: 'L-01', quantity: 3, expiryDate: '2027-01-31' },
          { lotNumber: 'L-02', quantity: 2 },
        ],
        'كرتونة تالفة',
      ),
    ).toBe('تشغيلة L-01 (3) — انتهاء 2027-01-31، تشغيلة L-02 (2) — كرتونة تالفة');
    expect(lotsDetails([], null)).toBeNull();
    expect(lotsDetails([], 'ملاحظة')).toBe('ملاحظة');
  });

  it('labels payment methods in Arabic', () => {
    expect(paymentMethodLabel('cash')).toBe('نقداً');
    expect(paymentMethodLabel('bank_transfer')).toBe('تحويل بنكي');
    expect(paymentMethodLabel('check')).toBe('شيك');
  });
});
