import { lazy } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';

const TreasuriesPage = lazy(() => import('./components').then((m) => ({ default: m.TreasuriesPage })));
const TreasuryStatementPage = lazy(() => import('./components').then((m) => ({ default: m.TreasuryStatementPage })));
const TreasuryVouchersPage = lazy(() => import('./components').then((m) => ({ default: m.TreasuryVouchersPage })));
const TreasuryCategoriesPage = lazy(() => import('./components').then((m) => ({ default: m.TreasuryCategoriesPage })));

/** Treasury (الخزائن): treasuries, vouchers, expense/income items, per-treasury statement. */
export const treasuryRoutes: RouteObject[] = [
  {
    path: 'treasury',
    element: <Outlet />,
    children: [
      { index: true, element: <TreasuriesPage /> },
      { path: 'vouchers', element: <TreasuryVouchersPage /> },
      { path: 'categories', element: <TreasuryCategoriesPage /> },
      { path: ':id', element: <TreasuryStatementPage /> },
    ],
  },
];
