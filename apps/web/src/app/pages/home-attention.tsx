import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, Skeleton, cn, useHasFeature } from '@erp-platform/ui';
import { CheckCircle2, ChevronLeft } from 'lucide-react';

import { useSalesInvoices } from '../../features/sales/api/sales-invoices/queries';
import { usePurchaseInvoices } from '../../features/purchases/api/purchase-invoices/queries';
import { useJournalEntries } from '../../features/accounting/api/journal-entries/queries';
import { useStockLevels } from '../../features/inventory/api/stock/queries';
import { FEATURE_KEYS } from '../../lib/feature-keys';

type Tone = 'warning' | 'info' | 'danger';

function AttentionRow({
  to,
  title,
  count,
  isLoading,
  tone,
}: {
  to: string;
  title: ReactNode;
  count: number;
  isLoading: boolean;
  tone: Tone;
}) {
  const { t } = useTranslation();
  const clear = !isLoading && count === 0;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      {isLoading ? (
        <Skeleton className="h-9 w-9 rounded-lg" />
      ) : (
        <span
          className={cn(
            'tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            clear && 'bg-success-soft text-success',
            !clear && tone === 'warning' && 'bg-warning-soft text-warning',
            !clear && tone === 'info' && 'bg-info-soft text-info',
            !clear && tone === 'danger' && 'bg-danger-soft text-danger',
          )}
        >
          {clear ? <CheckCircle2 className="h-4 w-4" /> : count}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {clear ? t('home.attention.allClear') : t('home.attention.needsAction')}
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function DraftSalesInvoices() {
  const { t } = useTranslation();
  const { data, isLoading } = useSalesInvoices();
  const count = (data ?? []).filter((i) => i.status === 'draft').length;
  return (
    <AttentionRow
      to="/sales/sales-invoices"
      title={t('home.attention.draftSalesInvoices')}
      count={count}
      isLoading={isLoading}
      tone="info"
    />
  );
}

function DraftPurchaseInvoices() {
  const { t } = useTranslation();
  const { data, isLoading } = usePurchaseInvoices();
  const count = (data ?? []).filter((i) => i.status === 'draft').length;
  return (
    <AttentionRow
      to="/purchases/purchase-invoices"
      title={t('home.attention.draftPurchaseInvoices')}
      count={count}
      isLoading={isLoading}
      tone="info"
    />
  );
}

function DraftJournalEntries() {
  const { t } = useTranslation();
  const { data, isLoading } = useJournalEntries({ status: 'draft' });
  return (
    <AttentionRow
      to="/accounting/journal-entries"
      title={t('home.attention.draftJournalEntries')}
      count={(data ?? []).length}
      isLoading={isLoading}
      tone="warning"
    />
  );
}

function LowStock() {
  const { t } = useTranslation();
  const { data, isLoading } = useStockLevels();
  const count = (data ?? []).filter(
    (level) => level.reorderPoint !== null && level.quantityOnHand <= level.reorderPoint,
  ).length;
  return (
    <AttentionRow
      to="/inventory/stock"
      title={t('home.attention.lowStock')}
      count={count}
      isLoading={isLoading}
      tone="danger"
    />
  );
}

/**
 * "Needs your attention" — real counts from existing list endpoints (no invented
 * numbers). Each row only mounts (and so only fetches) when the user has the module's
 * permission, and Accounting only when the tenant has that feature.
 */
export function HomeAttention() {
  const { t } = useTranslation();
  const accountingEnabled = useHasFeature(FEATURE_KEYS.ACCOUNTING);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t('home.attention.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Can permission="sales.manage">
          <DraftSalesInvoices />
        </Can>
        <Can permission="purchases.manage">
          <DraftPurchaseInvoices />
        </Can>
        {accountingEnabled ? (
          <Can permission="accounting.manage">
            <DraftJournalEntries />
          </Can>
        ) : null}
        <Can permission="inventory.manage">
          <LowStock />
        </Can>
      </div>
    </section>
  );
}
