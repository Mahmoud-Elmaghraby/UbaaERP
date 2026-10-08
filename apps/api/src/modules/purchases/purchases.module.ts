import { PurchasesTreasuryMovements } from './infrastructure/statements/purchases-treasury-movements';
import { SupplierStatementsController } from './presentation/supplier-statements.controller';
import { SupplierLedgerSource } from './infrastructure/statements/supplier-ledger.source';
import { Module } from '@nestjs/common';
import { PurchaseOrderPrintProvider } from './infrastructure/printing/purchase-order.print-provider';
import { GoodsReceiptPrintProvider } from './infrastructure/printing/goods-receipt.print-provider';
import { PurchaseInvoicePrintProvider } from './infrastructure/printing/purchase-invoice.print-provider';
import { SupplierPaymentPrintProvider } from './infrastructure/printing/supplier-payment.print-provider';
import { PurchasesPrintRegistration } from './infrastructure/printing/purchases-print.registration';
import { SettingsModule } from '../settings/settings.module';
import { SUPPLIER_REPOSITORY } from './application/ports/supplier.repository';
import { PURCHASE_REQUISITION_REPOSITORY } from './application/ports/purchase-requisition.repository';
import { PURCHASE_REQUISITION_LINE_REPOSITORY } from './application/ports/purchase-requisition-line.repository';
import { RFQ_REPOSITORY } from './application/ports/rfq.repository';
import { RFQ_LINE_REPOSITORY } from './application/ports/rfq-line.repository';
import { RFQ_SUPPLIER_REPOSITORY } from './application/ports/rfq-supplier.repository';
import { SUPPLIER_QUOTATION_REPOSITORY } from './application/ports/supplier-quotation.repository';
import { SUPPLIER_QUOTATION_LINE_REPOSITORY } from './application/ports/supplier-quotation-line.repository';
import { PURCHASE_ORDER_REPOSITORY } from './application/ports/purchase-order.repository';
import { PURCHASE_ORDER_LINE_REPOSITORY } from './application/ports/purchase-order-line.repository';
import { GOODS_RECEIPT_REPOSITORY } from './application/ports/goods-receipt.repository';
import { GOODS_RECEIPT_LINE_REPOSITORY } from './application/ports/goods-receipt-line.repository';
import { PURCHASE_RETURN_REPOSITORY } from './application/ports/purchase-return.repository';
import { PURCHASE_RETURN_LINE_REPOSITORY } from './application/ports/purchase-return-line.repository';
import { PURCHASE_INVOICE_REPOSITORY } from './application/ports/purchase-invoice.repository';
import { PURCHASE_INVOICE_LINE_REPOSITORY } from './application/ports/purchase-invoice-line.repository';
import { SUPPLIER_PAYMENT_REPOSITORY } from './application/ports/supplier-payment.repository';
import { SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY } from './application/ports/supplier-payment-allocation.repository';

import { KyselySupplierRepository } from './infrastructure/persistence/kysely-supplier.repository';
import { KyselyPurchaseRequisitionRepository } from './infrastructure/persistence/kysely-purchase-requisition.repository';
import { KyselyPurchaseRequisitionLineRepository } from './infrastructure/persistence/kysely-purchase-requisition-line.repository';
import { KyselyRfqRepository } from './infrastructure/persistence/kysely-rfq.repository';
import { KyselyRfqLineRepository } from './infrastructure/persistence/kysely-rfq-line.repository';
import { KyselyRfqSupplierRepository } from './infrastructure/persistence/kysely-rfq-supplier.repository';
import { KyselySupplierQuotationRepository } from './infrastructure/persistence/kysely-supplier-quotation.repository';
import { KyselySupplierQuotationLineRepository } from './infrastructure/persistence/kysely-supplier-quotation-line.repository';
import { KyselyPurchaseOrderRepository } from './infrastructure/persistence/kysely-purchase-order.repository';
import { KyselyPurchaseOrderLineRepository } from './infrastructure/persistence/kysely-purchase-order-line.repository';
import { KyselyGoodsReceiptRepository } from './infrastructure/persistence/kysely-goods-receipt.repository';
import { KyselyGoodsReceiptLineRepository } from './infrastructure/persistence/kysely-goods-receipt-line.repository';
import { KyselyPurchaseReturnRepository } from './infrastructure/persistence/kysely-purchase-return.repository';
import { KyselyPurchaseReturnLineRepository } from './infrastructure/persistence/kysely-purchase-return-line.repository';
import { KyselyPurchaseInvoiceRepository } from './infrastructure/persistence/kysely-purchase-invoice.repository';
import { KyselyPurchaseInvoiceLineRepository } from './infrastructure/persistence/kysely-purchase-invoice-line.repository';
import { KyselySupplierPaymentRepository } from './infrastructure/persistence/kysely-supplier-payment.repository';
import { KyselySupplierPaymentAllocationRepository } from './infrastructure/persistence/kysely-supplier-payment-allocation.repository';

import { SuppliersService } from './application/services/suppliers.service';
import { PurchaseRequisitionsService } from './application/services/purchase-requisitions.service';
import { RfqsService } from './application/services/rfqs.service';
import { SupplierQuotationsService } from './application/services/supplier-quotations.service';
import { PurchaseOrdersService } from './application/services/purchase-orders.service';
import { GoodsReceiptsService } from './application/services/goods-receipts.service';
import { PurchaseReturnsService } from './application/services/purchase-returns.service';
import { PurchaseInvoicesService } from './application/services/purchase-invoices.service';
import { SupplierPaymentsService } from './application/services/supplier-payments.service';

import { SuppliersController } from './presentation/suppliers.controller';
import { PurchaseRequisitionsController } from './presentation/purchase-requisitions.controller';
import { RfqsController } from './presentation/rfqs.controller';
import { SupplierQuotationsController } from './presentation/supplier-quotations.controller';
import { PurchaseOrdersController } from './presentation/purchase-orders.controller';
import { GoodsReceiptsController } from './presentation/goods-receipts.controller';
import { PurchaseReturnsController } from './presentation/purchase-returns.controller';
import { PurchaseInvoicesController } from './presentation/purchase-invoices.controller';
import { SupplierPaymentsController } from './presentation/supplier-payments.controller';

import { PurchasesEventPublisher } from './infrastructure/events/purchases-event-publisher';
import { PRODUCT_TRACKING_READER } from './application/ports/product-tracking.reader';
import { KyselyProductTrackingReader } from './infrastructure/persistence/kysely-product-tracking.reader';
import { ProductUnitResolver } from '../../shared/catalog/product-unit-resolver';
import { StockAvailabilityChecker } from '../../shared/catalog/stock-availability-checker';

/**
 * Purchases module (CLAUDE.md §10: step 3). Stages so far — see
 * claude/purchases-module-status.md for full detail and what's next:
 *  1. Suppliers (done).
 *  2. Purchase Requisitions (done).
 *  3. RFQ + Supplier Quotations (done).
 *  4. Purchase Orders (done).
 *  5. Goods Receipts (done) — the Event Bus integration point with
 *     Inventory (no direct import, §2.6); see GoodsReceiptStockListener
 *     in the inventory module.
 *  6. Purchase Returns (done) — the physical/operational half of the
 *     approved "purchase returns/debit notes" research-pass addition;
 *     see PurchaseReturnStockListener in the inventory module.
 *  7. Purchase Invoices (done, this pass) — the last baseline entity from
 *     the master doc's Purchases scope, and this codebase's first
 *     genuinely financial document: posting one uses the Outbox Pattern
 *     (§2.7, shared/outbox/), not the plain Event Bus every earlier stage
 *     here uses.
 * Purchases' baseline + both approved research-pass additions are now
 * all built. Sales is next per CLAUDE.md §10's fixed build order.
 *  8. Invoice-takeover orchestrator (done, this pass) — mirrors Sales'
 *     own SalesInvoicesService orchestrator: create() gains a direct-
 *     invoicing path (supplierId + directLines) usable only when
 *     PURCHASES_PURCHASE_ORDERS is disabled, plus independent Goods
 *     Receipt auto-creation when PURCHASES_GOODS_RECEIPTS is disabled —
 *     see PurchaseInvoicesService's own class comment.
 *  9. GoodsReceiptsService → Outbox symmetry (closed,
 *     claude/next-steps-backlog.md item 2) — confirm() now writes
 *     'purchases.goods_receipt.confirmed' to the Outbox in the same
 *     transaction as the status flip, mirroring DeliveriesService on the
 *     Sales side, instead of relying on GoodsReceiptsController to
 *     publish it post-commit. This removed the one asymmetry the
 *     invoice-takeover orchestrator (item 8) previously had to work
 *     around by replicating the controller's publish() call itself.
 * 10. Supplier Payments — mirror of Sales' Payments Received so payables
 *     can be settled; posting writes 'purchases.supplier_payment.posted'
 *     to the Outbox (Accounting: Dr AP / Cr cash-or-bank). Migration 0090.
 *
 * Imports SettingsModule for NumberingSequencesService and (since
 * 2026-09-13, the multi-currency tenant-vs-line-currency gate —
 * claude/multi-currency-strategy.md §9) TenantSettingsService, both
 * exported narrowly there — see PurchaseRequisitionsService's class
 * comment for why this cross-module dependency is treated as
 * foundational/platform, not a business-module-to-business-module call.
 *
 * TenantConnectionManager comes from the global TenancyModule — not
 * re-provided here, same as every other business module.
 *
 * PlanFeatureGuard now gates the optional document-chain controllers
 * (RfqsController: PURCHASES_RFQ, SupplierQuotationsController:
 * PURCHASES_SUPPLIER_QUOTATIONS, PurchaseOrdersController:
 * PURCHASES_PURCHASE_ORDERS, GoodsReceiptsController:
 * PURCHASES_GOODS_RECEIPTS) — see RfqsController's class comment,
 * mirroring Accounting's ChartOfAccountsController. SuppliersController,
 * PurchaseRequisitionsController, PurchaseInvoicesController and
 * PurchaseReturnsController do not carry it (suppliers/invoices are
 * foundational or mandatory; requisitions and returns are out of
 * scope for this pass — tracked, not forgotten).
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    SuppliersController,
    SupplierStatementsController,
    PurchaseRequisitionsController,
    RfqsController,
    SupplierQuotationsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    PurchaseReturnsController,
    PurchaseInvoicesController,
    SupplierPaymentsController,
  ],
  providers: [
    PurchasesTreasuryMovements,
    SupplierLedgerSource,
    PurchaseOrderPrintProvider,
    GoodsReceiptPrintProvider,
    PurchaseInvoicePrintProvider,
    SupplierPaymentPrintProvider,
    PurchasesPrintRegistration,
    ProductUnitResolver,
    StockAvailabilityChecker,
    { provide: SUPPLIER_REPOSITORY, useClass: KyselySupplierRepository },
    { provide: PURCHASE_REQUISITION_REPOSITORY, useClass: KyselyPurchaseRequisitionRepository },
    { provide: PURCHASE_REQUISITION_LINE_REPOSITORY, useClass: KyselyPurchaseRequisitionLineRepository },
    { provide: RFQ_REPOSITORY, useClass: KyselyRfqRepository },
    { provide: RFQ_LINE_REPOSITORY, useClass: KyselyRfqLineRepository },
    { provide: RFQ_SUPPLIER_REPOSITORY, useClass: KyselyRfqSupplierRepository },
    { provide: SUPPLIER_QUOTATION_REPOSITORY, useClass: KyselySupplierQuotationRepository },
    { provide: SUPPLIER_QUOTATION_LINE_REPOSITORY, useClass: KyselySupplierQuotationLineRepository },
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: KyselyPurchaseOrderRepository },
    { provide: PURCHASE_ORDER_LINE_REPOSITORY, useClass: KyselyPurchaseOrderLineRepository },
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: KyselyGoodsReceiptRepository },
    { provide: GOODS_RECEIPT_LINE_REPOSITORY, useClass: KyselyGoodsReceiptLineRepository },
    { provide: PRODUCT_TRACKING_READER, useClass: KyselyProductTrackingReader },
    { provide: PURCHASE_RETURN_REPOSITORY, useClass: KyselyPurchaseReturnRepository },
    { provide: PURCHASE_RETURN_LINE_REPOSITORY, useClass: KyselyPurchaseReturnLineRepository },
    { provide: PURCHASE_INVOICE_REPOSITORY, useClass: KyselyPurchaseInvoiceRepository },
    { provide: PURCHASE_INVOICE_LINE_REPOSITORY, useClass: KyselyPurchaseInvoiceLineRepository },
    { provide: SUPPLIER_PAYMENT_REPOSITORY, useClass: KyselySupplierPaymentRepository },
    { provide: SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY, useClass: KyselySupplierPaymentAllocationRepository },
    SuppliersService,
    PurchaseRequisitionsService,
    RfqsService,
    SupplierQuotationsService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    PurchaseReturnsService,
    PurchaseInvoicesService,
    SupplierPaymentsService,
    PurchasesEventPublisher,
  ],
})
export class PurchasesModule {}
