import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton, cn, useHasPermission } from '@erp-platform/ui';
import { ChevronLeft } from 'lucide-react';

import { useSalesAnalysis } from '../../features/sales/api/sales-reps/queries';
import { usePartyBalances } from '../../features/statements/queries';
import { useTreasuries } from '../../features/treasury/api/queries';
import { useExpiringLots } from '../../features/inventory/api/stock/queries';
import { useBaseCurrency } from '../../features/settings/queries';
import { Amount } from '../../components/amount';
import { presetRange } from '../../components/report/report-layout';
import { todayIso, toIsoDate } from '../../lib/format-date';
import { formatAmount, sumMinorUnits } from '../../lib/money';
import { INV, PURCH, SALES } from '../../lib/permissions';

/**
 * The live numbers on the home page (competitor baseline: Qoyod's period-filtered overview,
 * Zoho Books' receivables/payables/cash panels). Every widget reads an existing, permission-
 * scoped report endpoint and only renders — and only fetches — when the user may see it and
 * the module is on; every figure links to the report behind it.
 */

export type HomePeriod = 'today' | 'thisMonth' | 'lastMonth' | 'thisYear';
export const HOME_PERIODS: HomePeriod[] = ['today', 'thisMonth', 'lastMonth', 'thisYear'];

export function periodRange(period: HomePeriod): { from: string; to: string } {
  if (period === 'today') {
    const today = todayIso();
    return { from: today, to: today };
  }
  const range = presetRange(period);
  // Never ask for days that haven't happened yet.
  return { from: range.from, to: range.to > todayIso() ? todayIso() : range.to };
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(1)}%`);
const minus = (a: string, b: string) => (BigInt(a) - BigInt(b)).toString();

// ── building blocks ──────────────────────────────────────────────────────

function Panel({ title, to, linkLabel, children, className }: { title: ReactNode; to?: string; linkLabel?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border bg-card shadow-card', className)}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {to ? (
          <Link to={to} className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            {linkLabel}
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  currency,
  hint,
  tone,
  to,
  loading,
  featured = false,
}: {
  /** The page's headline figure: carries the brand orange accent. */
  featured?: boolean;
  label: string;
  value: string | undefined;
  currency: string;
  hint?: ReactNode;
  tone?: 'default' | 'warning';
  to: string;
  loading: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40',
        featured && 'border-t-[3px] border-t-highlight',
      )}
    >
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <span dir="ltr" className="truncate text-end text-2xl font-bold tabular-nums tracking-tight">
          {value === undefined ? '—' : formatAmount(value)}
          <span className="ms-1.5 text-sm font-medium text-muted-foreground">{currency}</span>
        </span>
      )}
      {hint ? (
        <span className={cn('text-[13px]', tone === 'warning' ? 'font-medium text-warning' : 'text-muted-foreground')}>{hint}</span>
      ) : null}
    </Link>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

// ── the dashboard ────────────────────────────────────────────────────────

export function HomeDashboard({ period }: { period: HomePeriod }) {
  const { t } = useTranslation();
  const currency = useBaseCurrency();
  const range = periodRange(period);

  const canSalesReports = useHasPermission(SALES.reportsView);
  const canCustomers = useHasPermission(SALES.view);
  const canSuppliers = useHasPermission(PURCH.view);
  const canTreasury = useHasPermission('treasury.view');
  const canStock = useHasPermission(INV.stockView);

  const sales = useSalesAnalysis({ groupBy: 'month', fromDate: range.from, toDate: range.to }, canSalesReports);
  const receivables = usePartyBalances('customer', { nonZeroOnly: true }, canCustomers);
  const payables = usePartyBalances('supplier', { nonZeroOnly: true }, canSuppliers);
  const treasuries = useTreasuries(canTreasury);

  const cash = useMemo(() => {
    const own = (treasuries.data ?? []).filter((tr) => tr.isActive && tr.balance.currency === currency);
    return sumMinorUnits(own.map((tr) => tr.balance.amountMinorUnits));
  }, [treasuries.data, currency]);

  const overdue = (totals?: { total: { amountMinorUnits: string }; current: { amountMinorUnits: string } }) =>
    totals ? minus(totals.total.amountMinorUnits, totals.current.amountMinorUnits) : undefined;
  const receivableOverdue = overdue(receivables.data?.totals);
  const payableOverdue = overdue(payables.data?.totals);
  const salesTotals = sales.data?.totals;
  const reportLink = `/sales/reports/analysis?from=${range.from}&to=${range.to}`;

  const kpis = [
    canSalesReports && (
      <Kpi
        key="sales"
        featured
        label={t('home.kpi.netSales')}
        value={salesTotals?.netSalesMinorUnits}
        currency={currency}
        hint={salesTotals ? t('home.kpi.invoices', { count: salesTotals.invoiceCount }) : undefined}
        to={reportLink}
        loading={sales.isLoading}
      />
    ),
    canSalesReports && (
      <Kpi
        key="profit"
        label={t('home.kpi.grossProfit')}
        value={salesTotals?.grossProfitMinorUnits}
        currency={currency}
        hint={salesTotals ? t('home.kpi.margin', { value: pct(salesTotals.marginPercent) }) : undefined}
        to={reportLink}
        loading={sales.isLoading}
      />
    ),
    canTreasury && (
      <Kpi key="cash" label={t('home.kpi.cash')} value={cash} currency={currency} hint={t('home.kpi.cashHint')} to="/treasury" loading={treasuries.isLoading} />
    ),
    canCustomers && (
      <Kpi
        key="receivables"
        label={t('home.kpi.receivables')}
        value={receivables.data?.totals.total.amountMinorUnits}
        currency={currency}
        hint={receivableOverdue && receivableOverdue !== '0' ? t('home.kpi.overdue', { amount: formatAmount(receivableOverdue) }) : t('home.kpi.nothingOverdue')}
        tone={receivableOverdue && receivableOverdue !== '0' ? 'warning' : 'default'}
        to="/sales/receivables"
        loading={receivables.isLoading}
      />
    ),
    canSuppliers && (
      <Kpi
        key="payables"
        label={t('home.kpi.payables')}
        value={payables.data?.totals.total.amountMinorUnits}
        currency={currency}
        hint={payableOverdue && payableOverdue !== '0' ? t('home.kpi.overdue', { amount: formatAmount(payableOverdue) }) : t('home.kpi.nothingOverdue')}
        tone={payableOverdue && payableOverdue !== '0' ? 'warning' : 'default'}
        to="/purchases/payables"
        loading={payables.isLoading}
      />
    ),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      {kpis.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis}</div> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        {canSalesReports ? <SalesTrend className="xl:col-span-2" /> : null}
        {canTreasury ? (
          <Panel title={t('home.cash.title')} to="/treasury" linkLabel={t('home.viewAll')}>
            {treasuries.isLoading ? (
              <ListSkeleton />
            ) : (
              <ul className="flex flex-col divide-y">
                {(treasuries.data ?? [])
                  .filter((tr) => tr.isActive)
                  .map((tr) => (
                    <li key={tr.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link to={`/treasury/${tr.id}`} className="truncate hover:text-primary">
                        {tr.name}
                      </Link>
                      <Amount value={tr.balance.amountMinorUnits} currency={tr.balance.currency} className="font-semibold" />
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {canSalesReports ? <TopItems from={range.from} to={range.to} /> : null}
        {canCustomers ? (
          <Panel title={t('home.topDebtors.title')} to="/sales/receivables" linkLabel={t('home.viewAll')}>
            {receivables.isLoading ? (
              <ListSkeleton />
            ) : !receivables.data?.rows.length ? (
              <EmptyLine>{t('home.topDebtors.empty')}</EmptyLine>
            ) : (
              <ul className="flex flex-col divide-y">
                {[...receivables.data.rows]
                  .sort((a, b) => (BigInt(b.balance.amountMinorUnits) > BigInt(a.balance.amountMinorUnits) ? 1 : -1))
                  .slice(0, 5)
                  .map((row) => (
                    <li key={row.partyId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link to={`/sales/customers/${row.partyId}/statement`} className="truncate hover:text-primary">
                        {row.name}
                      </Link>
                      <Amount value={row.balance.amountMinorUnits} hideCurrency className="font-semibold" />
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        ) : null}
        {canStock ? <ExpiringSoon /> : null}
      </div>
    </div>
  );
}

// ── sales trend: last six months, net sales per month ───────────────────

function SalesTrend({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const now = new Date();
  const from = toIsoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const report = useSalesAnalysis({ groupBy: 'month', fromDate: from, toDate: todayIso() });

  const months = useMemo(() => {
    const now = new Date();
    const rows = new Map((report.data?.rows ?? []).map((r) => [r.key, r]));
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = rows.get(key);
      return {
        key,
        label: new Intl.DateTimeFormat('ar-EG', { month: 'short' }).format(d),
        sales: Number(row?.netSalesMinorUnits ?? 0) / 100,
        profit: Number(row?.grossProfitMinorUnits ?? 0) / 100,
        invoices: row?.invoiceCount ?? 0,
      };
    });
  }, [report.data]);

  const max = Math.max(1, ...months.map((m) => m.sales));
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  const active = hover !== null ? months[hover] : null;

  return (
    <Panel title={t('home.trend.title')} to="/sales/reports/analysis" linkLabel={t('home.trend.report')} className={className}>
      {report.isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="min-h-5 text-[13px] text-muted-foreground">
            {active ? (
              <>
                <span className="font-semibold text-foreground">{active.label}</span> · {t('home.trend.sales')}{' '}
                <span dir="ltr" className="font-semibold tabular-nums text-foreground">{fmt(active.sales)}</span> · {t('home.trend.profit')}{' '}
                <span dir="ltr" className="tabular-nums">{fmt(active.profit)}</span> · {t('home.kpi.invoices', { count: active.invoices })}
              </>
            ) : (
              t('home.trend.hint')
            )}
          </p>
          <div className="flex h-48 items-end gap-3 border-b border-border" role="img" aria-label={t('home.trend.title')}>
            {months.map((m, i) => (
              <button
                key={m.key}
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${m.label}: ${fmt(m.sales)}`}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-1 outline-none"
              >
                <span dir="ltr" className={cn('text-[11px] tabular-nums text-muted-foreground', hover === i && 'text-foreground')}>
                  {m.sales ? fmt(Math.round(m.sales / 1000)) + 'k' : ''}
                </span>
                <span
                  className={cn(
                    'w-full max-w-14 rounded-t transition-colors',
                    // The current month wears the brand orange ("you are here"); the past ones navy.
                    i === months.length - 1 ? 'bg-highlight group-hover:bg-highlight/85' : 'bg-primary/80 group-hover:bg-primary group-focus-visible:bg-primary',
                    m.sales === 0 && 'bg-muted',
                  )}
                  style={{ height: `${Math.max(2, (m.sales / max) * 100)}%` }}
                />
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            {months.map((m) => (
              <span key={m.key} className="flex-1 text-center text-xs text-muted-foreground">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── best sellers in the chosen period ───────────────────────────────────

function TopItems({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const report = useSalesAnalysis({ groupBy: 'item', fromDate: from, toDate: to });
  const rows = [...(report.data?.rows ?? [])]
    .sort((a, b) => (BigInt(b.netSalesMinorUnits) > BigInt(a.netSalesMinorUnits) ? 1 : -1))
    .slice(0, 5);
  const top = rows[0] ? Number(rows[0].netSalesMinorUnits) : 1;
  return (
    <Panel title={t('home.topItems.title')} to={`/sales/reports/analysis?groupBy=item&from=${from}&to=${to}`} linkLabel={t('home.viewAll')}>
      {report.isLoading ? (
        <ListSkeleton />
      ) : !rows.length ? (
        <EmptyLine>{t('home.topItems.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.key ?? row.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{row.label}</span>
                <Amount value={row.netSalesMinorUnits} hideCurrency className="font-semibold" />
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-full rounded-full', index === 0 ? 'bg-highlight' : 'bg-primary/70')} style={{ width: `${(Number(row.netSalesMinorUnits) / top) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── stock about to expire (lot-tracked items) ───────────────────────────

function ExpiringSoon() {
  const { t } = useTranslation();
  const lots = useExpiringLots(30);
  const rows = lots.data ?? [];
  return (
    <Panel title={t('home.expiry.title')} to="/inventory/expiry" linkLabel={t('home.viewAll')}>
      {lots.isLoading ? (
        <ListSkeleton />
      ) : !rows.length ? (
        <EmptyLine>{t('home.expiry.empty')}</EmptyLine>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.slice(0, 5).map((lot) => (
            <li key={`${lot.stockLotId}-${lot.warehouseId}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{lot.productName}</span>
                <span className="text-xs text-muted-foreground">{lot.warehouseName}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  lot.daysToExpiry < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                )}
              >
                {lot.daysToExpiry < 0 ? t('home.expiry.expired') : t('home.expiry.days', { count: lot.daysToExpiry })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
