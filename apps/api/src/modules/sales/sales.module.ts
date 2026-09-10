import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository';
import { ETA_CREDENTIALS_REPOSITORY } from './application/ports/eta-credentials.repository';
import { QUOTATION_REPOSITORY } from './application/ports/quotation.repository';
import { QUOTATION_LINE_REPOSITORY } from './application/ports/quotation-line.repository';
import { SALES_ORDER_REPOSITORY } from './application/ports/sales-order.repository';
import { SALES_ORDER_LINE_REPOSITORY } from './application/ports/sales-order-line.repository';
import { DELIVERY_REPOSITORY } from './application/ports/delivery.repository';
import { DELIVERY_LINE_REPOSITORY } from './application/ports/delivery-line.repository';
import { SALES_INVOICE_REPOSITORY } from './application/ports/sales-invoice.repository';
import { SALES_INVOICE_LINE_REPOSITORY } from './application/ports/sales-invoice-line.repository';
import { PAYMENT_RECEIVED_REPOSITORY } from './application/ports/payment-received.repository';
import { PAYMENT_ALLOCATION_REPOSITORY } from './application/ports/payment-allocation.repository';
import { SALES_RETURN_REPOSITORY } from './application/ports/sales-return.repository';
import { SALES_RETURN_LINE_REPOSITORY } from './application/ports/sales-return-line.repository';
import { SALES_CREDIT_NOTE_REPOSITORY } from './application/ports/sales-credit-note.repository';
import { SALES_CREDIT_NOTE_LINE_REPOSITORY } from './application/ports/sales-credit-note-line.repository';
import { POS_SESSION_REPOSITORY } from './application/ports/pos-session.repository';

import { KyselyCustomerRepository } from './infrastructure/persistence/kysely-customer.repository';
import { KyselyEtaCredentialsRepository } from './infrastructure/persistence/kysely-eta-credentials.repository';
import { KyselyQuotationRepository } from './infrastructure/persistence/kysely-quotation.repository';
import { KyselyQuotationLineRepository } from './infrastructure/persistence/kysely-quotation-line.repository';
import { KyselySalesOrderRepository } from './infrastructure/persistence/kysely-sales-order.repository';
import { KyselySalesOrderLineRepository } from './infrastructure/persistence/kysely-sales-order-line.repository';
import { KyselyDeliveryRepository } from './infrastructure/persistence/kysely-delivery.repository';
import { KyselyDeliveryLineRepository } from './infrastructure/persistence/kysely-delivery-line.repository';
import { KyselySalesInvoiceRepository } from './infrastructure/persistence/kysely-sales-invoice.repository';
import { KyselySalesInvoiceLineRepository } from './infrastructure/persistence/kysely-sales-invoice-line.repository';
import { KyselyPaymentReceivedRepository } from './infrastructure/persistence/kysely-payment-received.repository';
import { KyselyPaymentAllocationRepository } from './infrastructure/persistence/kysely-payment-allocation.repository';
import { KyselySalesReturnRepository } from './infrastructure/persistence/kysely-sales-return.repository';
import { KyselySalesReturnLineRepository } from './infrastructure/persistence/kysely-sales-return-line.repository';
import { KyselySalesCreditNoteRepository } from './infrastructure/persistence/kysely-sales-credit-note.repository';
import { KyselySalesCreditNoteLineRepository } from './infrastructure/persistence/kysely-sales-credit-note-line.repository';
import { KyselyPosSessionRepository } from './infrastructure/persistence/kysely-pos-session.repository';

import { CustomersService } from './application/services/customers.service';
import { EtaCredentialsService } from './application/services/eta-credentials.service';
import { QuotationsService } from './application/services/quotations.service';
import { SalesOrdersService } from './application/services/sales-orders.service';
import { DeliveriesService } from './application/services/deliveries.service';
import { SalesInvoicesService } from './application/services/sales-invoices.service';
import { PaymentsReceivedService } from './application/services/payments-received.service';
import { SalesReturnsService } from './application/services/sales-returns.service';
import { SalesCreditNotesService } from './application/services/sales-credit-notes.service';
import { PosSessionsService } from './application/services/pos-sessions.service';
import { PosSalesService } from './application/services/pos-sales.service';

import { CustomersController } from './presentation/customers.controller';
import { EtaCredentialsController } from './presentation/eta-credentials.controller';
import { QuotationsController } from './presentation/quotations.controller';
import { SalesOrdersController } from './presentation/sales-orders.controller';
import { DeliveriesController } from './presentation/deliveries.controller';
import { SalesInvoicesController } from './presentation/sales-invoices.controller';
import { PaymentsReceivedController } from './presentation/payments-received.controller';
import { SalesReturnsController } from './presentation/sales-returns.controller';
import { SalesCreditNotesController } from './presentation/sales-credit-notes.controller';
import { PosSessionsController } from './presentation/pos-sessions.controller';

import { SalesEventPublisher } from './infrastructure/events/sales-event-publisher';

/**
 * Sales module (CLAUDE.md §10: step 4). Stages so far — see
 * claude/sales-module-status.md for full detail and what's next:
 *  1. Customers (done) — foundational entity, mirrors Suppliers in
 *     Purchases.
 *  + eta_credentials (done, ahead of its natural stage) — config-only
 *    readiness for CLAUDE.md §8's mandatory e-invoice integration; see
 *    migration 0040's comment and claude/sales-einvoice-spike.md. No
 *    ETA API call exists anywhere in this codebase yet.
 *  2. Quotations (done) — the first Sales document that carries a
 *     real price; structurally mirrors Purchase Orders (one document,
 *     not an RFQ/response pair — see migration 0041's comment for why
 *     Sales doesn't need Purchases' two-document shape here).
 *  3. Sales Orders (done) — mirrors Purchase Orders' two creation
 *     paths exactly (resolveCustomerAndLines(), from an 'accepted'
 *     quotation or given directly).
 *  4. Deliveries (done) — Sales' first cross-module side effect:
 *     DeliveriesService.confirm() publishes 'sales.delivery.confirmed',
 *     consumed by Inventory's DeliveryStockListener to record an
 *     'out' stock movement (never a direct call — CLAUDE.md §2.6).
 *     Mirrors Purchases' Goods Receipts two-step create()/confirm()
 *     shape.
 *  5. Sales Invoices (done) — this module's first genuinely
 *     financial document; posting one uses the Outbox Pattern
 *     (CLAUDE.md §2.7), direct mirror of PurchaseInvoicesService.
 *     Also where the ETA e-invoice submission engine will
 *     eventually attach (claude/sales-einvoice-spike.md §6) — not
 *     built yet, only the financial document itself.
 *  6. Payments Received (done) — the last baseline entity in the
 *     master doc's Sales entity list [مستقر]. Also Outbox-backed
 *     (a payment is as ledger-worthy as an invoice); allocates
 *     across one or more posted Sales Invoices, validated against
 *     each invoice's outstanding balance.
 *  7. Sales Returns (done, this pass) — the approved research-
 *     pass addition (claude/sales-module-research.md), mirroring
 *     Purchase Returns with the stock direction flipped ('in',
 *     not 'out'). Deliberately scoped to the physical return
 *     only — no financial credit note against Sales
 *     Invoices/Payments Received; that stays a distinct, unbuilt
 *     decision. See migration 0047 and SalesReturnsService's
 *     class comments.
 * This module's backend has now reached full baseline parity with
 * Purchases' entity list, plus its own approved Sales Returns
 * addition. Remaining work: the ETA submission engine (still
 * blocked on user decisions), a financial credit-note mechanism
 * for Sales Returns (unbuilt, flagged), and PlanFeatureGuard — see
 * claude/sales-module-status.md.
 *
 *  8. Sales Credit Notes (done, this pass) — the real financial
 *     credit-note mechanism deferred by Sales Returns (migration
 *     0047), built per the user's explicit approval alongside
 *     Accounting's Stage 6/7 auto-posting. Always auto-generated by
 *     SalesReturnsService.confirm() (see migration 0053) — no
 *     create/update/delete surface of its own. SalesReturnsService.confirm()
 *     now also writes BOTH its integration events through the Outbox
 *     (CLAUDE.md §2.7), not a direct post-commit publish() call — see
 *     that service's own comment.
 *
 *  9. POS Cash Sessions (done) — Stage 1 of the POS feature
 *     (claude/sales-pos-research.md). The one genuinely new domain
 *     concept POS needs: open()/close() lifecycle, close() being a
 *     financial event (Outbox-backed, CLAUDE.md §2.7) whenever the
 *     counted-vs-expected variance is non-zero — consumed by
 *     AccountingAutoPostingListeners.handlePosSessionClosed(). Stage 2
 *     (discounts on Sales Order + Walk-in Customer provisioning) is
 *     also done.
 *
 *  10. POS Checkout orchestration (done) — Stage 3.
 *      PosSalesService.checkout() drives the existing Sales Order ->
 *      Delivery -> Sales Invoice -> Payment(s) Received chain
 *      atomically in one outer transaction (see that service's own
 *      comment, and database/tenant/transaction.util.ts's
 *      withTransaction() helper — needed because Kysely 0.29.5 does
 *      not support calling .transaction() on an already-active
 *      Transaction). Every service method that chain calls now goes
 *      through withTransaction() instead of a raw db.transaction()
 *      call, so it stays a no-op change for every existing
 *      single-step caller.
 *
 *  11. Invoice-takeover orchestrator (done, this pass) —
 *      claude/platform-flexibility-strategy.md's "قاعدة مين هيقوم
 *      بالدور". Generalizes Stage 10's pattern beyond POS:
 *      SalesInvoicesService.create() now accepts customerId +
 *      directLines instead of salesOrderId (only when
 *      SALES_SALES_ORDERS is not effectively enabled for the tenant —
 *      FeatureAvailabilityService, shared/plans/), and, whenever
 *      SALES_DELIVERIES is not effectively enabled, auto-creates and
 *      confirms a matching Delivery for whatever quantity isn't
 *      already covered by an existing one — same
 *      "closest-still-active-document absorbs the disabled step" rule,
 *      still inside the one invoice-creation transaction, still zero
 *      duplicated business logic (reuses SalesOrdersService/
 *      DeliveriesService's own create()/confirm()). Purchases' mirror
 *      (RFQ/Supplier Quotations/Purchase Orders/Goods Receipts →
 *      Purchase Invoice) is a deliberately separate, not-yet-started
 *      follow-up pass.
 *
 * Imports SettingsModule for NumberingSequencesService only (exported
 * narrowly there) — same treatment as PurchasesModule; see
 * PurchaseRequisitionsService's class comment for why this cross-module
 * dependency is foundational/platform, not business-module-to-business-
 * module.
 *
 * SecretsEncryptionModule (used by EtaCredentialsService) is @Global(),
 * registered once in app.module.ts — not re-imported here.
 *
 * PlanFeatureGuard now gates the optional document-chain controllers
 * (QuotationsController: SALES_QUOTATIONS, SalesOrdersController:
 * SALES_SALES_ORDERS, DeliveriesController: SALES_DELIVERIES) — see
 * QuotationsController's class comment, mirroring Accounting's
 * ChartOfAccountsController. CustomersController, SalesInvoicesController,
 * PaymentsReceivedController, SalesReturnsController,
 * SalesCreditNotesController, PosSessionsController and
 * EtaCredentialsController do not carry it (customers/invoices/payments
 * are foundational or mandatory, not optional chain steps; returns,
 * credit notes and POS are out of scope for this pass — tracked, not
 * forgotten).
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    CustomersController,
    EtaCredentialsController,
    QuotationsController,
    SalesOrdersController,
    DeliveriesController,
    SalesInvoicesController,
    PaymentsReceivedController,
    SalesReturnsController,
    SalesCreditNotesController,
    PosSessionsController,
  ],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: KyselyCustomerRepository },
    { provide: ETA_CREDENTIALS_REPOSITORY, useClass: KyselyEtaCredentialsRepository },
    { provide: QUOTATION_REPOSITORY, useClass: KyselyQuotationRepository },
    { provide: QUOTATION_LINE_REPOSITORY, useClass: KyselyQuotationLineRepository },
    { provide: SALES_ORDER_REPOSITORY, useClass: KyselySalesOrderRepository },
    { provide: SALES_ORDER_LINE_REPOSITORY, useClass: KyselySalesOrderLineRepository },
    { provide: DELIVERY_REPOSITORY, useClass: KyselyDeliveryRepository },
    { provide: DELIVERY_LINE_REPOSITORY, useClass: KyselyDeliveryLineRepository },
    { provide: SALES_INVOICE_REPOSITORY, useClass: KyselySalesInvoiceRepository },
    { provide: SALES_INVOICE_LINE_REPOSITORY, useClass: KyselySalesInvoiceLineRepository },
    { provide: PAYMENT_RECEIVED_REPOSITORY, useClass: KyselyPaymentReceivedRepository },
    { provide: PAYMENT_ALLOCATION_REPOSITORY, useClass: KyselyPaymentAllocationRepository },
    { provide: SALES_RETURN_REPOSITORY, useClass: KyselySalesReturnRepository },
    { provide: SALES_RETURN_LINE_REPOSITORY, useClass: KyselySalesReturnLineRepository },
    { provide: SALES_CREDIT_NOTE_REPOSITORY, useClass: KyselySalesCreditNoteRepository },
    { provide: SALES_CREDIT_NOTE_LINE_REPOSITORY, useClass: KyselySalesCreditNoteLineRepository },
    { provide: POS_SESSION_REPOSITORY, useClass: KyselyPosSessionRepository },
    CustomersService,
    EtaCredentialsService,
    QuotationsService,
    SalesOrdersService,
    DeliveriesService,
    SalesInvoicesService,
    PaymentsReceivedService,
    SalesReturnsService,
    SalesCreditNotesService,
    PosSessionsService,
    PosSalesService,
    SalesEventPublisher,
  ],
})
export class SalesModule {}
