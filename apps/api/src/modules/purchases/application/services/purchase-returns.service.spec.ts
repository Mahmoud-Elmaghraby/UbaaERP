import { Money } from '@erp-platform/shared-kernel';
import type { GoodsReceiptLine } from '../../domain/goods-receipt.entity';
import { uninvoicedPart } from './purchase-returns.service';

// Pulls in Prisma (not generated in unit runs); uninvoicedPart() never uses it.
jest.mock('../../../../shared/plans/feature-availability.service', () => ({ FeatureAvailabilityService: class {} }));

const receiptLine = (quantityReceived: number, unitCost: Money, unitFactor = 1) =>
  ({ id: 'grl1', quantityReceived, unitCost, unitFactor }) as unknown as GoodsReceiptLine;

describe('uninvoicedPart (purchase return before invoicing)', () => {
  it('values the never-invoiced part at the receipt line frozen rate', () => {
    // 10 cartons × 12 received at 120 USD/carton, rate 48 → 57,600 EGP for 120 pieces; 30 pieces returned, 6 invoiced.
    expect(uninvoicedPart(30, 6, receiptLine(10, Money.fromMinorUnits(12_000n, 'USD'), 12), '48', 'EGP')).toEqual({
      uninvoicedBaseQuantity: 24,
      uninvoicedReceiptValue: { amountMinorUnits: '1152000', currency: 'EGP' },
    });
  });

  it('nothing when the whole return was invoiced, or the receipt has no frozen rate', () => {
    expect(uninvoicedPart(5, 5, receiptLine(10, Money.fromMinorUnits(100n, 'EGP')), null, 'EGP')).toEqual({});
    expect(uninvoicedPart(5, 0, receiptLine(10, Money.fromMinorUnits(100n, 'USD')), null, 'EGP')).toEqual({});
  });
});
