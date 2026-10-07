import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, PageHeader, useFeatureChecker } from '@erp-platform/ui';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpenText,
  ChevronLeft,
  FileText,
  MonitorSmartphone,
  Package,
  ShoppingBag,
  UsersRound,
} from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { NAV_ITEMS } from '../layout/nav-items';
import { HomeAttention } from './home-attention';
import { INV } from '../../lib/permissions';

interface QuickAction {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  permission: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    to: '/sales/sales-invoices/new',
    labelKey: 'home.actions.newSalesInvoice',
    icon: FileText,
    permission: 'sales.manage',
  },
  { to: '/pos', labelKey: 'home.actions.pos', icon: MonitorSmartphone, permission: 'sales.manage' },
  {
    to: '/purchases/purchase-invoices/new',
    labelKey: 'home.actions.newPurchaseInvoice',
    icon: ShoppingBag,
    permission: 'purchases.manage',
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
    permission: 'sales.manage',
  },
];

/** Module key (last path segment) → description key, for the sections grid. */
const MODULE_DESCRIPTIONS: Record<string, string> = {
  '/sales': 'home.moduleDescriptions.sales',
  '/purchases': 'home.moduleDescriptions.purchases',
  '/inventory': 'home.moduleDescriptions.inventory',
  '/accounting': 'home.moduleDescriptions.accounting',
  '/pos': 'home.moduleDescriptions.pos',
  '/settings': 'home.moduleDescriptions.settings',
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Landing screen after login (replaces the old redirect to /settings). For now it is a
 * launcher — quick actions + module sections, permission-aware. Live KPIs (sales this
 * month, receivables, cash…) are Phase 4 of claude/ui-redesign-plan.md and need their
 * own read endpoints first; nothing here shows made-up numbers.
 */
export function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const now = new Date();
  const greeting = now.getHours() < 12 ? t('home.greetingMorning') : t('home.greetingEvening');
  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const hasFeature = useFeatureChecker();
  const modules = NAV_ITEMS.filter(
    (item) => MODULE_DESCRIPTIONS[item.to] && (!item.feature || hasFeature(item.feature)),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={firstName ? `${greeting}، ${firstName}` : greeting}
        description={`${dateFormatter.format(now)} · ${t('home.subtitle')}`}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('home.quickActions')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map((action) => (
            <Can key={action.to} permission={action.permission}>
              <Link
                to={action.to}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">{t(action.labelKey)}</span>
              </Link>
            </Can>
          ))}
        </div>
      </section>

      <HomeAttention />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('home.modules')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            const card = (
              <div
                key={item.to}
                className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-card"
              >
                <Link to={item.to} className="group flex items-start gap-3">
                  {Icon ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold group-hover:text-primary">
                      {t(item.labelKey)}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {t(MODULE_DESCRIPTIONS[item.to]!)}
                    </span>
                  </span>
                  <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                {item.children?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.children
                      .filter((child) => !child.feature || hasFeature(child.feature))
                      .slice(0, 5)
                      .map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {t(child.labelKey)}
                        </Link>
                      ))}
                  </div>
                ) : null}
              </div>
            );
            return item.permission ? (
              <Can key={item.to} permission={item.permission}>
                {card}
              </Can>
            ) : (
              card
            );
          })}
        </div>
      </section>
    </div>
  );
}
