import { useTranslation } from 'react-i18next';
import type { DiscountTypeDto, MoneyDto } from '@erp-platform/contracts';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../lib/money';

/**
 * POS feature Stage 2/4 (claude/sales-pos-research.md) — Sales Order discount UI, both
 * header-level (this form's own fields) and line-level (SalesOrderLineItemsEditor's
 * per-row cells), and now reused as-is by the POS cart's own header/line discount
 * controls (Stage 4, pos-cart-panel.tsx). Deliberately plain useState, not a
 * react-hook-form field: discountType drives which of the other two inputs is even
 * shown (a dynamic/conditional shape), and discountFixedAmount is Money-shaped like
 * unitPrice — same "plain controlled state for dynamic conditional fields" + "Money as
 * a decimal-string local field, converted at submit" conventions this codebase already
 * uses for the lines array itself.
 *
 * Lives at features/sales/lib/ (a module-level shared file, sibling to api/<entity> and
 * hooks/<entity>) rather than inside components/sales-orders/ — it started there, but
 * once the POS cart (its own entity under .eslintrc.cjs's boundaries/element-types,
 * 'sales-pos') needed the exact same discount logic, a direct cross-entity import from
 * components/pos/** into components/sales-orders/** would have violated the
 * "entities must not import each other's components directly" rule already enforced
 * for every other Sales entity. Promoting shared logic to a module-level file is the
 * documented remedy for exactly this (see that rule's own message text), same as
 * lib/money.ts at the app level.
 *
 * 'none' is a UI-only sentinel (the backend's own DiscountType has no "none" value —
 * absence of a discount is `discountType: null`) — same shape as the established
 * `__none__` sentinel pattern for nullable-FK <Select>s elsewhere in this codebase.
 */
export interface DiscountDraft {
  discountType: 'none' | DiscountTypeDto;
  /** Decimal text, e.g. "10" for 10% — only meaningful when discountType === 'percentage'. */
  discountPercentage: string;
  /** Decimal text, e.g. "25.00" — only meaningful when discountType === 'fixed'. */
  discountFixedAmount: string;
}

export function createEmptyDiscountDraft(): DiscountDraft {
  return { discountType: 'none', discountPercentage: '', discountFixedAmount: '' };
}

/** Rehydrates a draft from an already-saved order/line (Edit forms) — the inverse of resolveDiscountInput(). */
export function discountDraftFromDto(source: {
  discountType: DiscountTypeDto | null;
  discountPercentage: number | null;
  discountFixedAmount: MoneyDto | null;
}): DiscountDraft {
  if (source.discountType === 'percentage') {
    return { discountType: 'percentage', discountPercentage: String(source.discountPercentage ?? ''), discountFixedAmount: '' };
  }
  if (source.discountType === 'fixed' && source.discountFixedAmount) {
    // Displayed as a decimal string for editing — same convention as unitPrice's own round-trip.
    return {
      discountType: 'fixed',
      discountPercentage: '',
      discountFixedAmount: minorUnitsToDecimalString(source.discountFixedAmount.amountMinorUnits),
    };
  }
  return createEmptyDiscountDraft();
}

export type ResolvedDiscount = {
  discountType: DiscountTypeDto | null;
  discountPercentage: number | null;
  discountFixedAmount: MoneyDto | null;
};

/** Converts a draft into the shape the API expects, or 'invalid' if the current input can't be parsed/is out of range. */
export function resolveDiscountInput(draft: DiscountDraft, currency: string): ResolvedDiscount | 'invalid' {
  if (draft.discountType === 'none') {
    return { discountType: null, discountPercentage: null, discountFixedAmount: null };
  }
  if (draft.discountType === 'percentage') {
    const pct = Number(draft.discountPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'invalid';
    return { discountType: 'percentage', discountPercentage: pct, discountFixedAmount: null };
  }
  try {
    const amountMinorUnits = decimalToMinorUnits(draft.discountFixedAmount);
    if (BigInt(amountMinorUnits) < 0n) return 'invalid';
    return { discountType: 'fixed', discountPercentage: null, discountFixedAmount: { amountMinorUnits, currency } };
  } catch {
    return 'invalid';
  }
}

/**
 * Header-level discount control — a type Select plus whichever one value Input applies.
 * `size="sm"`-equivalent compact layout so it reads as one form row, not a whole section.
 */
export function DiscountFields({
  value,
  onChange,
  currency,
}: {
  value: DiscountDraft;
  onChange: (value: DiscountDraft) => void;
  currency: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <label className="text-sm font-medium">{t('sales.salesOrders.discountType')}</label>
        <Select
          value={value.discountType}
          onValueChange={(next) =>
            onChange({ ...value, discountType: next as DiscountDraft['discountType'] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('sales.salesOrders.discountTypeNone')}</SelectItem>
            <SelectItem value="percentage">{t('sales.salesOrders.discountTypePercentage')}</SelectItem>
            <SelectItem value="fixed">{t('sales.salesOrders.discountTypeFixed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.discountType === 'percentage' ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium">{t('sales.salesOrders.discountPercentage')}</label>
          <Input
            type="number"
            min={0}
            max={100}
            step="any"
            inputMode="decimal"
            value={value.discountPercentage}
            onChange={(e) => onChange({ ...value, discountPercentage: e.target.value })}
          />
        </div>
      ) : null}
      {value.discountType === 'fixed' ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium">{t('sales.salesOrders.discountFixedAmount', { currency })}</label>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={value.discountFixedAmount}
            onChange={(e) => onChange({ ...value, discountFixedAmount: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
