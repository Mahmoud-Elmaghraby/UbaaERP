import { Money, breakdownFromTaxes, sumTaxBreakdowns, type LineTax, type TaxBreakdown, type TaxKind } from '@erp-platform/shared-kernel';

/**
 * Pure helpers for a document line's stored tax snapshot (migration 0092) —
 * usable from domain code. Computing taxes for new lines (which needs the
 * tenant's rules) is in ./document-taxes.ts.
 */

/** What a line stores (JSONB `taxes`), amounts as strings. */
export interface LineTaxSnapshot {
  taxRuleId: string;
  name: string;
  kind: TaxKind;
  rate: string;
  etaType: string | null;
  etaSubtype: string | null;
  baseMinorUnits: string;
  amountMinorUnits: string;
}

export function toSnapshot(taxes: readonly LineTax[]): LineTaxSnapshot[] {
  return taxes.map((tax) => ({
    taxRuleId: tax.taxRuleId,
    name: tax.name,
    kind: tax.kind,
    rate: tax.rate,
    etaType: tax.etaType,
    etaSubtype: tax.etaSubtype,
    baseMinorUnits: tax.base.toString(),
    amountMinorUnits: tax.amount.toString(),
  }));
}

export function parseSnapshot(value: unknown): LineTaxSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value as LineTaxSnapshot[];
}

/** A stored line's breakdown: its net plus its stored taxes. */
export function lineBreakdown(netMinor: bigint, taxes: readonly LineTaxSnapshot[]): TaxBreakdown {
  return breakdownFromTaxes(
    netMinor,
    taxes.map((tax) => ({ kind: tax.kind, amount: BigInt(tax.amountMinorUnits) })),
  );
}

export function documentBreakdown(
  lines: readonly { netMinor: bigint; taxes: readonly LineTaxSnapshot[] }[],
): TaxBreakdown {
  return sumTaxBreakdowns(lines.map((line) => lineBreakdown(line.netMinor, line.taxes)));
}

export interface DocumentTotals {
  netAmount: Money;
  tableTaxAmount: Money;
  vatAmount: Money;
  withholdingAmount: Money;
  /** net + table + VAT − withholding. */
  totalAmount: Money;
}

export function totalsToMoney(breakdown: TaxBreakdown, currency: string): DocumentTotals {
  return {
    netAmount: Money.fromMinorUnits(breakdown.net, currency),
    tableTaxAmount: Money.fromMinorUnits(breakdown.table, currency),
    vatAmount: Money.fromMinorUnits(breakdown.vat, currency),
    withholdingAmount: Money.fromMinorUnits(breakdown.withholding, currency),
    totalAmount: Money.fromMinorUnits(breakdown.total, currency),
  };
}

/** Totals in Money-DTO shape for contracts and outbox events. */
export function totalsToDto(totals: DocumentTotals) {
  const money = (value: Money) => ({ amountMinorUnits: value.toMinorUnits().toString(), currency: value.currency });
  return {
    netAmount: money(totals.netAmount),
    tableTaxAmount: money(totals.tableTaxAmount),
    vatAmount: money(totals.vatAmount),
    withholdingAmount: money(totals.withholdingAmount),
    totalAmount: money(totals.totalAmount),
  };
}

/** Totals of a document from its stored lines (net + tax snapshot each). */
export function documentTotals(lines: readonly { netAmount: Money; taxes: readonly LineTaxSnapshot[] }[]): DocumentTotals {
  if (lines.length === 0) throw new Error('Cannot total a document with zero lines.');
  const currency = lines[0]!.netAmount.currency;
  const breakdown = documentBreakdown(
    lines.map((line) => ({ netMinor: line.netAmount.toMinorUnits(), taxes: line.taxes })),
  );
  return totalsToMoney(breakdown, currency);
}
