import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const ChartOfAccountsPage = lazy(() =>
  import('./components/chart-of-accounts').then((m) => ({ default: m.ChartOfAccountsPage })),
);
const FiscalYearsPage = lazy(() =>
  import('./components/fiscal-years').then((m) => ({ default: m.FiscalYearsPage })),
);
const JournalEntriesPage = lazy(() =>
  import('./components/journal-entries').then((m) => ({ default: m.JournalEntriesPage })),
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
const BankAccountsPage = lazy(() =>
  import('./components/bank-accounts').then((m) => ({ default: m.BankAccountsPage })),
);

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
      { index: true, element: <Navigate to="chart-of-accounts" replace /> },
      { path: 'chart-of-accounts', element: <ChartOfAccountsPage /> },
      { path: 'fiscal-years', element: <FiscalYearsPage /> },
      { path: 'journal-entries', element: <JournalEntriesPage /> },
      { path: 'reports', element: <AccountingReportsPage /> },
      { path: 'settings', element: <AccountingSettingsPage /> },
      { path: 'cost-centers', element: <CostCentersPage /> },
      { path: 'bank-accounts', element: <BankAccountsPage /> },
    ],
  },
];
