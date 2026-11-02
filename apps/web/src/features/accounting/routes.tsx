import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const AccountingOverviewPage = lazy(() =>
  import('./components/overview').then((m) => ({ default: m.AccountingOverviewPage })),
);
const ChartOfAccountsPage = lazy(() =>
  import('./components/chart-of-accounts').then((m) => ({ default: m.ChartOfAccountsPage })),
);
const FiscalYearsPage = lazy(() =>
  import('./components/fiscal-years').then((m) => ({ default: m.FiscalYearsPage })),
);
const JournalEntriesPage = lazy(() =>
  import('./components/journal-entries').then((m) => ({ default: m.JournalEntriesPage })),
);
const JournalEntryPage = lazy(() =>
  import('./components/journal-entries').then((m) => ({ default: m.JournalEntryPage })),
);
const JournalEntryEditorPage = lazy(() =>
  import('./components/journal-entries').then((m) => ({ default: m.JournalEntryEditorPage })),
);
const AccountingReportsPage = lazy(() =>
  import('./components/accounting-reports').then((m) => ({ default: m.AccountingReportsPage })),
);
const AccountingSettingsPage = lazy(() =>
  import('./components/accounting-settings').then((m) => ({ default: m.AccountingSettingsPage })),
);
const CostCentersPage = lazy(() =>
  import('./components/cost-centers').then((m) => ({ default: m.CostCentersPage })),
);
const BankReconciliationPage = lazy(() =>
  import('./components/bank-accounts').then((m) => ({ default: m.BankReconciliationPage })),
);
const BankAccountsPage = lazy(() =>
  import('./components/bank-accounts').then((m) => ({ default: m.BankAccountsPage })),
);

const RecurringEntriesPage = lazy(() =>
  import('./components/recurring-entries').then((m) => ({ default: m.RecurringEntriesPage })),
);
const RecurringEntryEditorPage = lazy(() =>
  import('./components/recurring-entries').then((m) => ({ default: m.RecurringEntryEditorPage })),
);
const FixedAssetsPage = lazy(() => import('./components/fixed-assets').then((m) => ({ default: m.FixedAssetsPage })));
const FixedAssetPage = lazy(() => import('./components/fixed-assets').then((m) => ({ default: m.FixedAssetPage })));
const BudgetsPage = lazy(() => import('./components/budgets').then((m) => ({ default: m.BudgetsPage })));
const ChartOfAccountPage = lazy(() =>
  import('./components/chart-of-accounts').then((m) => ({ default: m.ChartOfAccountPage })),
);
const BudgetPage = lazy(() => import('./components/budgets').then((m) => ({ default: m.BudgetPage })));

/**
 * Routes owned by the Accounting module (CLAUDE.md §10, step 5 — the last module,
 * first frontend pass). Follows the same route-per-entity, lazy-loaded structure as
 * Inventory/Purchases/Sales (see sales/routes.tsx). Five routes for five backend
 * surfaces: Chart of Accounts (Stage 1), Fiscal Years — which also covers Accounting
 * Periods, reached from within the Fiscal Years screen rather than its own top-level
 * nav entry, since a period only ever makes sense in the context of the fiscal year
 * that generated it (Stage 1), Journal Entries (Stage 2), Reports — one routed page
 * covering all four read-only reports (دفتر الأستاذ / ميزان المراجعة / قائمة الدخل /
 * الميزانية العمومية) via an in-page Tabs switcher (Stage 2b), and Settings — the
 * default-account mapping auto-posting reads (Stage 6/7).
 *
 * Cost Centers (Stage 4) and Bank Accounts (Stage 5, including its register/
 * reconciliation view) add two more top-level routes below, same lazy-loaded pattern.
 *
 * Not yet built: Tax Returns (Stage 8) — no backend yet either, see
 * claude/accounting-module-status.md.
 */
export const accountingRoutes: RouteObject[] = [
  {
    path: 'accounting',
    // No UI of its own — groups the sub-section routes under '/accounting'.
    element: <Outlet />,
    children: [
      { index: true, element: <AccountingOverviewPage /> },
      { path: 'chart-of-accounts', element: <ChartOfAccountsPage /> },
      { path: 'chart-of-accounts/new', element: <ChartOfAccountPage /> },
      { path: 'chart-of-accounts/:id/edit', element: <ChartOfAccountPage /> },
      { path: 'fiscal-years', element: <FiscalYearsPage /> },
      { path: 'journal-entries', element: <JournalEntriesPage /> },
      { path: 'journal-entries/new', element: <JournalEntryEditorPage /> },
      { path: 'journal-entries/:id', element: <JournalEntryPage /> },
      { path: 'journal-entries/:id/edit', element: <JournalEntryEditorPage /> },
      { path: 'reports', element: <Navigate to="trial-balance" replace /> },
      { path: 'reports/:report', element: <AccountingReportsPage /> },
      { path: 'settings', element: <AccountingSettingsPage /> },
      { path: 'cost-centers', element: <CostCentersPage /> },
      { path: 'bank-accounts', element: <BankAccountsPage /> },
      { path: 'bank-accounts/:id', element: <BankReconciliationPage /> },
      { path: 'recurring-entries', element: <RecurringEntriesPage /> },
      { path: 'recurring-entries/new', element: <RecurringEntryEditorPage /> },
      { path: 'recurring-entries/:id', element: <RecurringEntryEditorPage /> },
      { path: 'fixed-assets', element: <FixedAssetsPage /> },
      { path: 'fixed-assets/new', element: <FixedAssetPage /> },
      { path: 'fixed-assets/:id', element: <FixedAssetPage /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'budgets/:id', element: <BudgetPage /> },
    ],
  },
];
