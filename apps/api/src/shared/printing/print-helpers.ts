import type { Kysely } from 'kysely';
import { amountInWordsAr, type Money } from '@erp-platform/shared-kernel';
import type { PrintLineDto, PrintTotalsDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import type { DocumentTotals, LineTaxSnapshot } from '../taxes/line-tax-snapshot';

/** Shared building blocks for print providers — so every document prints the same way. */

export const moneyDto = (money: Money) => ({
  amountMinorUnits: money.toMinorUnits().toString(),
  currency: money.currency,
});

export function lineTaxesDto(taxes: readonly LineTaxSnapshot[], currency: string): PrintLineDto['taxes'] {
  return taxes.map((tax) => ({
    name: tax.name,
    kind: tax.kind,
    rate: tax.rate,
    amount: { amountMinorUnits: tax.amountMinorUnits, currency },
  }));
}

/** Totals block from a taxed document (invoice / credit note), with the amount in words. */
export function documentTotalsDto(
  totals: DocumentTotals,
  extra: { paid?: Money | null; discount?: Money | null } = {},
): PrintTotalsDto {
  const nonZero = (money: Money) => (money.isZero() ? null : moneyDto(money));
  return {
    netAmount: moneyDto(totals.netAmount),
    discountAmount: extra.discount && !extra.discount.isZero() ? moneyDto(extra.discount) : null,
    tableTaxAmount: nonZero(totals.tableTaxAmount),
    vatAmount: nonZero(totals.vatAmount),
    withholdingAmount: nonZero(totals.withholdingAmount),
    totalAmount: moneyDto(totals.totalAmount),
    paidAmount: extra.paid ? moneyDto(extra.paid) : null,
    balanceAmount: extra.paid ? moneyDto(totals.totalAmount.subtract(extra.paid)) : null,
    amountInWords: amountInWordsAr(totals.totalAmount.toMinorUnits(), totals.totalAmount.currency),
  };
}

/** Totals block for a plain amount (receipt, payment, order without taxes). */
export function amountTotalsDto(total: Money): PrintTotalsDto {
  return {
    totalAmount: moneyDto(total),
    amountInWords: amountInWordsAr(total.toMinorUnits(), total.currency),
  };
}

export interface VariantLabel {
  name: string;
  sku: string;
  baseUnit: string | null;
}

/** Product name / SKU / base unit for printed lines, and unit names — one query each. */
export async function readPrintLabels(
  db: Kysely<TenantDatabase>,
  variantIds: readonly string[],
  unitIds: readonly (string | null)[] = [],
): Promise<{ variant: (id: string) => VariantLabel; unit: (id: string | null, variantId: string) => string | null }> {
  const ids = [...new Set(variantIds)];
  const variants = ids.length
    ? await db
        .selectFrom('product_variants')
        .innerJoin('products', 'products.id', 'product_variants.product_id')
        .leftJoin('units_of_measure', 'units_of_measure.id', 'products.unit_of_measure_id')
        .select([
          'product_variants.id as id',
          'product_variants.sku as sku',
          'product_variants.attribute_values as attribute_values',
          'products.name as name',
          'units_of_measure.name as unit_name',
        ])
        .where('product_variants.id', 'in', ids)
        .execute()
    : [];
  const unitIdList = [...new Set(unitIds.filter((id): id is string => !!id))];
  const units = unitIdList.length
    ? await db.selectFrom('units_of_measure').select(['id', 'name']).where('id', 'in', unitIdList).execute()
    : [];
  const variantById = new Map(
    variants.map((row) => {
      const attributes = Object.values((row.attribute_values ?? {}) as Record<string, unknown>)
        .filter((value) => typeof value === 'string' && value)
        .join(' / ');
      return [row.id, { name: attributes ? `${row.name} — ${attributes}` : row.name, sku: row.sku, baseUnit: row.unit_name }];
    }),
  );
  const unitById = new Map(units.map((row) => [row.id, row.name]));
  return {
    variant: (id) => variantById.get(id) ?? { name: '—', sku: '', baseUnit: null },
    unit: (unitId, variantId) => (unitId ? (unitById.get(unitId) ?? null) : (variantById.get(variantId)?.baseUnit ?? null)),
  };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  bank_transfer: 'تحويل بنكي',
  check: 'شيك',
  card: 'بطاقة',
  other: 'أخرى',
};

/** Arabic payment method (receipts / supplier payments). */
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/**
 * Receipt / payment voucher rows: one per allocated invoice, plus the
 * unallocated remainder (on-account) when there is one.
 */
export function allocationLinesDto(
  allocations: readonly { invoiceNumber: string; amount: Money }[],
  unallocated: Money,
): PrintLineDto[] {
  return [
    ...allocations.map((allocation) => ({
      description: `سداد فاتورة ${allocation.invoiceNumber}`,
      amount: moneyDto(allocation.amount),
    })),
    ...(unallocated.isPositive() ? [{ description: 'دفعة تحت الحساب', amount: moneyDto(unallocated) }] : []),
  ];
}

/** "تشغيلة L-01 (5) — انتهاء 2027-01-31، …" plus the line's own notes, for stock documents. */
export function lotsDetails(
  lots: readonly { lotNumber: string; quantity: number; expiryDate?: string | null }[],
  notes: string | null = null,
): string | null {
  const lotText = lots
    .map((lot) => `تشغيلة ${lot.lotNumber} (${lot.quantity})${lot.expiryDate ? ` — انتهاء ${lot.expiryDate}` : ''}`)
    .join('، ');
  return [lotText, notes].filter((part): part is string => !!part).join(' — ') || null;
}

/** Read-only name lookups of other modules' tables for print headers. */
export async function readWarehouseName(db: Kysely<TenantDatabase>, id: string): Promise<string | null> {
  const row = await db.selectFrom('warehouses').select('name').where('id', '=', id).executeTakeFirst();
  return row?.name ?? null;
}

export async function readBankAccountName(db: Kysely<TenantDatabase>, id: string): Promise<string | null> {
  const row = await db.selectFrom('bank_accounts').select('name').where('id', '=', id).executeTakeFirst();
  return row?.name ?? null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  cancelled: 'ملغاة',
};

/** A non-final document prints a visible status ("مسودة" watermark). */
export function statusLabel(status: string | null): string | null {
  return status ? (STATUS_LABELS[status] ?? null) : null;
}
