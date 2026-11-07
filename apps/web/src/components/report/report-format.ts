/** "12.5" → "12.5%", null → "—" (two decimals at most). */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

/** A quantity with up to three decimals, null → "—". */
export function formatQuantity(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** "2026-11" → "نوفمبر 2026". */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
