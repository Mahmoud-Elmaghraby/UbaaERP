import { lazy } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

const PartyStatementPage = lazy(() => import('../statements').then((m) => ({ default: m.PartyStatementPage })));
const PartyBalancesPage = lazy(() => import('../statements').then((m) => ({ default: m.PartyBalancesPage })));

const suppliers = () => import('./components/suppliers');
const SuppliersPage = lazy(() => suppliers().then((m) => ({ default: m.SuppliersPage })));
const SupplierEditorPage = lazy(() => suppliers().then((m) => ({ default: m.SupplierEditorPage })));
const SupplierPage = lazy(() => suppliers().then((m) => ({ default: m.SupplierPage })));

const requisitions = () => import('./components/purchase-requisitions');
const PurchaseRequisitionsPage = lazy(() => requisitions().then((m) => ({ default: m.PurchaseRequisitionsPage })));
const PurchaseRequisitionEditorPage = lazy(() => requisitions().then((m) => ({ default: m.PurchaseRequisitionEditorPage })));
const PurchaseRequisitionPage = lazy(() => requisitions().then((m) => ({ default: m.PurchaseRequisitionPage })));

const rfqs = () => import('./components/rfqs');
const RfqsPage = lazy(() => rfqs().then((m) => ({ default: m.RfqsPage })));
const RfqEditorPage = lazy(() => rfqs().then((m) => ({ default: m.RfqEditorPage })));
const RfqPage = lazy(() => rfqs().then((m) => ({ default: m.RfqPage })));

const orders = () => import('./components/purchase-orders');
const PurchaseOrdersPage = lazy(() => orders().then((m) => ({ default: m.PurchaseOrdersPage })));
const PurchaseOrderEditorPage = lazy(() => orders().then((m) => ({ default: m.PurchaseOrderEditorPage })));
const PurchaseOrderPage = lazy(() => orders().then((m) => ({ default: m.PurchaseOrderPage })));

const receipts = () => import('./components/goods-receipts');
const GoodsReceiptsPage = lazy(() => receipts().then((m) => ({ default: m.GoodsReceiptsPage })));
const GoodsReceiptCreatePage = lazy(() => receipts().then((m) => ({ default: m.GoodsReceiptCreatePage })));
const GoodsReceiptPage = lazy(() => receipts().then((m) => ({ default: m.GoodsReceiptPage })));

const returns = () => import('./components/purchase-returns');
const PurchaseReturnsPage = lazy(() => returns().then((m) => ({ default: m.PurchaseReturnsPage })));
const PurchaseReturnCreatePage = lazy(() => returns().then((m) => ({ default: m.PurchaseReturnCreatePage })));
const PurchaseReturnPage = lazy(() => returns().then((m) => ({ default: m.PurchaseReturnPage })));

const debitNotes = () => import('./components/purchase-debit-notes');
const DebitNotesPage = lazy(() => debitNotes().then((m) => ({ default: m.DebitNotesPage })));
const DebitNotePage = lazy(() => debitNotes().then((m) => ({ default: m.DebitNotePage })));

const invoices = () => import('./components/purchase-invoices');
const PurchaseInvoicesPage = lazy(() => invoices().then((m) => ({ default: m.PurchaseInvoicesPage })));
const PurchaseInvoiceCreatePage = lazy(() => invoices().then((m) => ({ default: m.PurchaseInvoiceCreatePage })));
const PurchaseInvoiceDetailsPage = lazy(() => invoices().then((m) => ({ default: m.PurchaseInvoiceDetailsPage })));

const payments = () => import('./components/supplier-payments');
const SupplierPaymentsPage = lazy(() => payments().then((m) => ({ default: m.SupplierPaymentsPage })));
const SupplierPaymentEditorPage = lazy(() => payments().then((m) => ({ default: m.SupplierPaymentEditorPage })));
const SupplierPaymentPage = lazy(() => payments().then((m) => ({ default: m.SupplierPaymentPage })));

const PurchaseAnalysisPage = lazy(() => import('./components/reports').then((m) => ({ default: m.PurchaseAnalysisPage })));
// Supplier price lists reuse the Sales price-list screens (same tables, kind 'purchase').
const priceLists = () => import('../sales/components/price-lists');
const PriceListsPage = lazy(() => priceLists().then((m) => ({ default: m.PriceListsPage })));
const PriceListEditorPage = lazy(() => priceLists().then((m) => ({ default: m.PriceListEditorPage })));

/**
 * Routes owned by the Purchases module — every document is a full page: list, /new, /:id
 * (and /:id/edit for editable drafts), the same shape as Sales. router.tsx spreads this array.
 */
export const purchasesRoutes: RouteObject[] = [
  {
    path: 'purchases',
    element: <Outlet />,
    children: [
      { index: true, element: <Navigate to="suppliers" replace /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/new', element: <SupplierEditorPage /> },
      { path: 'suppliers/:id', element: <SupplierPage /> },
      { path: 'suppliers/:id/edit', element: <SupplierEditorPage /> },
      { path: 'suppliers/:id/statement', element: <PartyStatementPage kind="supplier" /> },
      { path: 'payables', element: <PartyBalancesPage kind="supplier" /> },
      { path: 'purchase-requisitions', element: <PurchaseRequisitionsPage /> },
      { path: 'purchase-requisitions/new', element: <PurchaseRequisitionEditorPage /> },
      { path: 'purchase-requisitions/:id', element: <PurchaseRequisitionPage /> },
      { path: 'purchase-requisitions/:id/edit', element: <PurchaseRequisitionEditorPage /> },
      { path: 'rfqs', element: <RfqsPage /> },
      { path: 'rfqs/new', element: <RfqEditorPage /> },
      { path: 'rfqs/:id', element: <RfqPage /> },
      { path: 'rfqs/:id/edit', element: <RfqEditorPage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'purchase-orders/new', element: <PurchaseOrderEditorPage /> },
      { path: 'purchase-orders/:id', element: <PurchaseOrderPage /> },
      { path: 'purchase-orders/:id/edit', element: <PurchaseOrderEditorPage /> },
      { path: 'goods-receipts', element: <GoodsReceiptsPage /> },
      { path: 'goods-receipts/new', element: <GoodsReceiptCreatePage /> },
      { path: 'goods-receipts/:id', element: <GoodsReceiptPage /> },
      { path: 'purchase-returns', element: <PurchaseReturnsPage /> },
      { path: 'purchase-returns/new', element: <PurchaseReturnCreatePage /> },
      { path: 'purchase-returns/:id', element: <PurchaseReturnPage /> },
      { path: 'debit-notes', element: <DebitNotesPage /> },
      { path: 'debit-notes/:id', element: <DebitNotePage /> },
      { path: 'purchase-invoices', element: <PurchaseInvoicesPage /> },
      { path: 'purchase-invoices/new', element: <PurchaseInvoiceCreatePage /> },
      { path: 'purchase-invoices/:id', element: <PurchaseInvoiceDetailsPage /> },
      { path: 'supplier-payments', element: <SupplierPaymentsPage /> },
      { path: 'supplier-payments/new', element: <SupplierPaymentEditorPage /> },
      { path: 'supplier-payments/:id', element: <SupplierPaymentPage /> },
      { path: 'reports/analysis', element: <PurchaseAnalysisPage /> },
      { path: 'price-lists', element: <PriceListsPage kind="purchase" /> },
      { path: 'price-lists/:id', element: <PriceListEditorPage kind="purchase" /> },
    ],
  },
];
