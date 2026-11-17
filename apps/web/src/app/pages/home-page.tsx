import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, PageHeader, cn, useFeatureChecker } from '@erp-platform/ui';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpenText,
  FileText,
  MonitorSmartphone,
  Package,
  ShoppingBag,
  UsersRound,
} from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { HomeAttention } from './home-attention';
import { HOME_PERIODS, HomeDashboard, type HomePeriod } from './home-dashboard';
import { INV, PURCH, SALES } from '../../lib/permissions';

interface QuickAction {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  permission: string;
  feature?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/sales/sales-invoices/new',
    labelKey: 'home.actions.newSalesInvoice',
    icon: FileText,
    permission: SALES.create,
  },
  { to: '/pos', labelKey: 'home.actions.pos', icon: MonitorSmartphone, permission: SALES.posUse, feature: 'pos' },
  {
    to: '/purchases/purchase-invoices/new',
    labelKey: 'home.actions.newPurchaseInvoice',
    icon: ShoppingBag,
    permission: PURCH.create,
  },
  {
    to: '/accounting/journal-entries',
    labelKey: 'home.actions.journalEntry',
    icon: BookOpenText,
    permission: 'accounting.manage',
  },
  {
    to: '/inventory/products',
    labelKey: 'home.actions.products',
    icon: Package,
    permission: INV.productsView,
  },
  {
    to: '/sales/customers',
    labelKey: 'home.actions.customers',
    icon: UsersRound,
    permission: SALES.view,
  },
];

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Landing screen after login: the business at a glance — live figures for the chosen period
 * (sales, profit, cash, what customers owe and what we owe), the six-month trend, best sellers,
 * the biggest debtors and stock about to expire, plus what needs attention and quick actions.
 * Each block shows only for users who may see it (see HomeDashboard).
 */
export function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const now = new Date();
  const greeting = now.getHours() < 12 ? t('home.greetingMorning') : t('home.greetingEvening');
  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const hasFeature = useFeatureChecker();
  const [period, setPeriod] = useState<HomePeriod>('thisMonth');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `${greeting}، ${firstName}` : greeting}
        description={`${dateFormatter.format(now)} · ${t('home.subtitle')}`}
        actions={
          <div role="radiogroup" aria-label={t('home.periodLabel')} className="flex rounded-lg border bg-card p-1">
            {HOME_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  period === p
                    ? 'bg-accent font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--highlight))]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`home.periods.${p}`)}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.filter((action) => !action.feature || hasFeature(action.feature)).map((action) => (
          <Can key={action.to} permission={action.permission}>
            <Link
              to={action.to}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px] font-medium shadow-card transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <action.icon className="h-4 w-4 text-primary" />
              {t(action.labelKey)}
            </Link>
          </Can>
        ))}
      </div>

      <HomeDashboard period={period} />

      <HomeAttention />
    </div>
  );
}
