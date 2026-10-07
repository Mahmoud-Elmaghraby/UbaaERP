import { lazy } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';

import { FirstAllowedRedirect } from '../../app/layout/first-allowed-redirect';

const ProductsPage = lazy(() => import('./components/products').then((m) => ({ default: m.ProductsPage })));
const WarehousesPage = lazy(() => import('./components/warehouses').then((m) => ({ default: m.WarehousesPage })));
const UnitsOfMeasurePage = lazy(() =>
  import('./components/units-of-measure').then((m) => ({ default: m.UnitsOfMeasurePage })),
);
const CatalogPage = lazy(() => import('./components/catalog').then((m) => ({ default: m.CatalogPage })));
const LabelsPage = lazy(() => import('./components/labels').then((m) => ({ default: m.LabelsPage })));
const LotTracePage = lazy(() => import('./components/lot-trace').then((m) => ({ default: m.LotTracePage })));
const ExpiryReportPage = lazy(() => import('./components/expiry').then((m) => ({ default: m.ExpiryReportPage })));
const StockCountsPage = lazy(() => import('./components/counts').then((m) => ({ default: m.StockCountsPage })));
const StockCountPage = lazy(() => import('./components/counts').then((m) => ({ default: m.StockCountPage })));
const ItemCardPage = lazy(() => import('./components/reports').then((m) => ({ default: m.ItemCardPage })));
const ValuationPage = lazy(() => import('./components/reports').then((m) => ({ default: m.ValuationPage })));
const LowStockPage = lazy(() => import('./components/reports').then((m) => ({ default: m.LowStockPage })));
const StockPage = lazy(() => import('./components/stock').then((m) => ({ default: m.StockPage })));
const StockTransfersPage = lazy(() =>
  import('./components/transfers').then((m) => ({ default: m.StockTransfersPage })),
);
const StockTransferPage = lazy(() => import('./components/transfers').then((m) => ({ default: m.StockTransferPage })));
const StockAdjustmentsPage = lazy(() =>
  import('./components/adjustments').then((m) => ({ default: m.StockAdjustmentsPage })),
);
const StockAdjustmentPage = lazy(() =>
  import('./components/adjustments').then((m) => ({ default: m.StockAdjustmentPage })),
);
const AdjustmentReasonsPage = lazy(() =>
  import('./components/adjustments').then((m) => ({ default: m.AdjustmentReasonsPage })),
);
const ProductImportPage = lazy(() => import('./components/import').then((m) => ({ default: m.ProductImportPage })));
const LandedCostsPage = lazy(() =>
  import('./components/landed-costs').then((m) => ({ default: m.LandedCostsPage })),
);

/**
 * Routes owned by the Inventory module. Each sub-section is its own routed page
 * (not an in-page tab anymore — see claude/inventory-frontend-status.md for the
 * redesign this implements) and is lazy-loaded, so each becomes its own JS chunk
 * instead of all five bundling into one large chunk. router.tsx just spreads this
 * array; AppShell wraps <Outlet /> in a single <Suspense> that covers every lazy
 * route, so no per-route loading boilerplate is needed here.
 */
export const inventoryRoutes: RouteObject[] = [
  {
    path: 'inventory',
    // No UI of its own — this route exists only to group the sub-section routes
    // below under one '/inventory' prefix, so it just renders <Outlet />.
    element: <Outlet />,
    children: [
      { index: true, element: <FirstAllowedRedirect section="/inventory" fallback="/inventory/products" /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'labels', element: <LabelsPage /> },
      { path: 'warehouses', element: <WarehousesPage /> },
      { path: 'units-of-measure', element: <UnitsOfMeasurePage /> },
      { path: 'stock', element: <StockPage /> },
      { path: 'counts', element: <StockCountsPage /> },
      { path: 'counts/:id', element: <StockCountPage /> },
      { path: 'item-card', element: <ItemCardPage /> },
      { path: 'valuation', element: <ValuationPage /> },
      { path: 'low-stock', element: <LowStockPage /> },
      { path: 'expiry', element: <ExpiryReportPage /> },
      { path: 'lot-trace', element: <LotTracePage /> },
      { path: 'landed-costs', element: <LandedCostsPage /> },
      { path: 'transfers', element: <StockTransfersPage /> },
      { path: 'transfers/:id', element: <StockTransferPage /> },
      { path: 'adjustments', element: <StockAdjustmentsPage /> },
      { path: 'adjustments/:id', element: <StockAdjustmentPage /> },
      { path: 'adjustment-reasons', element: <AdjustmentReasonsPage /> },
      { path: 'import', element: <ProductImportPage /> },
    ],
  },
];
