import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const ProductsPage = lazy(() => import('./components/products').then((m) => ({ default: m.ProductsPage })));
const WarehousesPage = lazy(() => import('./components/warehouses').then((m) => ({ default: m.WarehousesPage })));
const UnitsOfMeasurePage = lazy(() =>
  import('./components/units-of-measure').then((m) => ({ default: m.UnitsOfMeasurePage })),
);
const CatalogPage = lazy(() => import('./components/catalog').then((m) => ({ default: m.CatalogPage })));
const LabelsPage = lazy(() => import('./components/labels').then((m) => ({ default: m.LabelsPage })));
const StockPage = lazy(() => import('./components/stock').then((m) => ({ default: m.StockPage })));
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
      { index: true, element: <Navigate to="products" replace /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'labels', element: <LabelsPage /> },
      { path: 'warehouses', element: <WarehousesPage /> },
      { path: 'units-of-measure', element: <UnitsOfMeasurePage /> },
      { path: 'stock', element: <StockPage /> },
      { path: 'landed-costs', element: <LandedCostsPage /> },
    ],
  },
];
