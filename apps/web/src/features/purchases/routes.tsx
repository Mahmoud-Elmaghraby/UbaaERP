import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const SuppliersPage = lazy(() => import('./components/suppliers').then((m) => ({ default: m.SuppliersPage })));
const PurchaseRequisitionsPage = lazy(() =>
  import('./components/purchase-requisitions').then((m) => ({ default: m.PurchaseRequisitionsPage })),
);
const RfqsPage = lazy(() => import('./components/rfqs').then((m) => ({ default: m.RfqsPage })));
const PurchaseOrdersPage = lazy(() =>
  import('./components/purchase-orders').then((m) => ({ default: m.PurchaseOrdersPage })),
);
const GoodsReceiptsPage = lazy(() =>
  import('./components/goods-receipts').then((m) => ({ default: m.GoodsReceiptsPage })),
);
const PurchaseReturnsPage = lazy(() =>
  import('./components/purchase-returns').then((m) => ({ default: m.PurchaseReturnsPage })),
);
const PurchaseInvoicesPage = lazy(() =>
  import('./components/purchase-invoices').then((m) => ({ default: m.PurchaseInvoicesPage })),
);
const PurchaseInvoiceCreatePage = lazy(() =>
  import('./components/purchase-invoices').then((m) => ({ default: m.PurchaseInvoiceCreatePage })),
);
const PurchaseInvoiceDetailsPage = lazy(() =>
  import('./components/purchase-invoices').then((m) => ({ default: m.PurchaseInvoiceDetailsPage })),
);
const SupplierPaymentsPage = lazy(() =>
  import('./components/supplier-payments').then((m) => ({ default: m.SupplierPaymentsPage })),
);

/**
 * Routes owned by the Purchases module. Follows the same route-per-entity,
 * lazy-loaded structure as Inventory (see features/inventory/routes.tsx) —
 * router.tsx just spreads this array, and AppShell's single <Suspense>
 * around <Outlet /> covers these lazy routes too.
 *
 * Suppliers, Purchase Requisitions, RFQs (Supplier Quotations live nested
 * inside the RFQ details view, not as their own route), Purchase Orders,
 * Goods Receipts, Purchase Returns and Purchase Invoices — this is every
 * entity in the Purchases module's scope (master doc §10, step 3, plus the
 * two approved research-pass additions). The Purchases frontend is
 * complete as of this file; the next module per CLAUDE.md §10 is Sales.
 */
export const purchasesRoutes: RouteObject[] = [
  {
    path: 'purchases',
    // No UI of its own — groups the sub-section routes under '/purchases'.
    element: <Outlet />,
    children: [
      { index: true, element: <Navigate to="suppliers" replace /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'purchase-requisitions', element: <PurchaseRequisitionsPage /> },
      { path: 'rfqs', element: <RfqsPage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'goods-receipts', element: <GoodsReceiptsPage /> },
      { path: 'purchase-returns', element: <PurchaseReturnsPage /> },
      { path: 'purchase-invoices', element: <PurchaseInvoicesPage /> },
      { path: 'purchase-invoices/new', element: <PurchaseInvoiceCreatePage /> },
      { path: 'purchase-invoices/:id', element: <PurchaseInvoiceDetailsPage /> },
      { path: 'supplier-payments', element: <SupplierPaymentsPage /> },
    ],
  },
];
