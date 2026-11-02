import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from '@erp-platform/ui';
import { FileSpreadsheet, Printer } from 'lucide-react';

import { formatDate, toIsoDate, todayIso } from '../../lib/format-date';
import { useTenantSettings } from '../../features/settings/queries';

/*
 * Shared building blocks for every report screen (Accounting first, then
 * Sales/Inventory reports). A report:
 *   - runs immediately with a sensible default period — no "Run" button;
 *   - keeps its filters in the URL, so a report can be bookmarked, shared,
 *     and reached by drill-down links from another report;
 *   - prints cleanly (shell hidden, company name + period on top) and
 *     exports to Excel.
 */

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'custom';

const PRESETS: PeriodPreset[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'lastYear', 'custom'];

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'thisMonth':
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)) };
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: toIsoDate(new Date(y, q, 1)), to: toIsoDate(new Date(y, q + 3, 0)) };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'lastYear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

function matchPreset(from: string, to: string): PeriodPreset {
  for (const preset of PRESETS) {
    if (preset === 'custom') continue;
    const range = presetRange(preset);
    if (range.from === from && range.to === to) return preset;
  }
  return 'custom';
}

/**
 * A report's filters, read from and written to the URL. `from`/`to` default
 * to the current month, `asOf` to today; any other key is free-form (an
 * account id, a cost center…).
 */
export function useReportParams(defaults: { preset?: Exclude<PeriodPreset, 'custom'> } = {}) {
  const [params, setParams] = useSearchParams();
  const fallback = presetRange(defaults.preset ?? 'thisMonth');
  const from = params.get('from') ?? fallback.from;
  const to = params.get('to') ?? fallback.to;
  const asOf = params.get('asOf') ?? todayIso();

  return useMemo(
    () => ({
      from,
      to,
      asOf,
      get: (key: string) => params.get(key),
      set: (patch: Record<string, string | null | undefined>) =>
        setParams(
          (current) => {
            const next = new URLSearchParams(current);
            for (const [key, value] of Object.entries(patch)) {
              if (value) next.set(key, value);
              else next.delete(key);
            }
            return next;
          },
          { replace: true },
        ),
    }),
    [from, to, asOf, params, setParams],
  );
}

/** Period presets + the two dates. */
export function PeriodPicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const { t } = useTranslation();
  const preset = matchPreset(from, to);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t('reports.period')}</span>
        <Select
          value={preset}
          onValueChange={(value) => {
            if (value !== 'custom') onChange(presetRange(value as Exclude<PeriodPreset, 'custom'>));
          }}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((item) => (
              <SelectItem key={item} value={item} disabled={item === 'custom'}>
                {t(`reports.presets.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DateField label={t('reports.from')} value={from} onChange={(value) => value && onChange({ from: value, to })} />
      <DateField label={t('reports.to')} value={to} onChange={(value) => value && onChange({ from, to: value })} />
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input type="date" className="h-9 w-40" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * The report page frame: filter bar (hidden when printing), a print-only
 * heading (company, report, period), the body, and print / Excel actions.
 */
export function ReportFrame({
  title,
  period,
  filters,
  onExport,
  loading,
  children,
}: {
  title: string;
  /** e.g. "من 01/11/2026 إلى 30/11/2026" — shown on paper. */
  period: ReactNode;
  filters?: ReactNode;
  onExport?: () => void;
  loading?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { data: settings } = useTenantSettings();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">{filters}</div>
        <div className="flex gap-2">
          {onExport ? (
            <Button variant="outline" size="sm" onClick={onExport}>
              <FileSpreadsheet className="me-1.5 h-4 w-4" />
              {t('reports.excel')}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="me-1.5 h-4 w-4" />
            {t('reports.print')}
          </Button>
        </div>
      </div>

      <div className="hidden text-center print:block">
        {settings?.companyName ? <p className="text-sm font-semibold">{settings.companyName}</p> : null}
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-xs text-muted-foreground">{period}</p>
      </div>

      {loading ? <Skeleton className="h-64 w-full rounded-xl" /> : children}
    </div>
  );
}

export function periodText(t: (key: string, options?: Record<string, unknown>) => string, from: string, to: string) {
  return t('reports.periodText', { from: formatDate(from), to: formatDate(to) });
}

export function asOfText(t: (key: string, options?: Record<string, unknown>) => string, asOf: string) {
  return t('reports.asOfText', { date: formatDate(asOf) });
}

/** A titled table section inside a report (edge-to-edge, no card-in-card). */
export function ReportSection({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card print:rounded-none print:border-0', className)}>
      {title ? <h2 className="border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

/** One line of a statement (account, subtotal or grand total), with optional drill-down. */
export function StatementRow({
  label,
  code,
  amount,
  level = 'account',
  onOpen,
}: {
  label: ReactNode;
  code?: string;
  amount: ReactNode;
  level?: 'account' | 'subtotal' | 'total';
  onOpen?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0',
        level === 'subtotal' && 'bg-muted/30 font-semibold',
        level === 'total' && 'bg-muted/60 text-[15px] font-bold',
        onOpen && 'cursor-pointer hover:bg-accent/60 print:cursor-auto',
      )}
      onClick={onOpen}
      role={onOpen ? 'link' : undefined}
    >
      {code ? <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{code}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-end">{amount}</span>
    </div>
  );
}
