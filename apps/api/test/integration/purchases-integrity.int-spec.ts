import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { GoodsReceiptsService } from '../../src/modules/purchases/application/services/goods-receipts.service';
import { PurchaseInvoicesService } from '../../src/modules/purchases/application/services/purchase-invoices.service';
import { PurchaseOrdersService } from '../../src/modules/purchases/application/services/purchase-orders.service';
import { KyselyGoodsReceiptRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-goods-receipt.repository';
import { KyselyGoodsReceiptLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-goods-receipt-line.repository';
import { KyselyPurchaseOrderRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-order.repository';
import { KyselyPurchaseOrderLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-order-line.repository';
import { KyselyPurchaseInvoiceRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-invoice.repository';
import { KyselyPurchaseInvoiceLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-invoice-line.repository';
import { KyselySupplierRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier.repository';
import { KyselySupplierQuotationRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier-quotation.repository';
import { KyselySupplierQuotationLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier-quotation-line.repository';
import { KyselyProductTrackingReader } from '../../src/modules/purchases/infrastructure/persistence/kysely-product-tracking.reader';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { localIsoDate } from '../../src/shared/time/local-date';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/**
 * Purchases integrity (migration 0114 + the confirm/post re-checks): two
 * drafts on the same order line can't both be confirmed/posted past the
 * ordered quantity, nothing is received/invoiced on a cancelled order, and
 * an order with documents can't be cancelled.
 */
describe('Purchases integrity (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let goodsReceipts: GoodsReceiptsService;
  let invoices: PurchaseInvoicesService;
  let orders: PurchaseOrdersService;
  let warehouseId: string;
  const schema = 'integration';

  async function createSupplier(): Promise<string> {
    const suffix = uniqueSuffix();
    const id = randomUUID();
    await db
      .insertInto('suppliers')
      .values({
        id,
        name: `Integrity supplier ${suffix}`,
        code: `IS-${suffix}`,
        contact_person: null,
        email: null,
        phone: null,
        address: null,
        tax_number: null,
        default_currency: 'EGP',
        payment_terms_days: null,
        notes: null,
        is_active: true,
        custom_fields: '{}',
      })
      .execute();
    return id;
  }

  async function createVariant(): Promise<string> {
    const suffix = uniqueSuffix();
    const unitId = randomUUID();
    await db
      .insertInto('units_of_measure')
      .values({ id: unitId, name: `pc-${suffix}`, symbol: `pc${suffix}`, is_active: true, conversion_factor: '1' })
      .execute();
    const productId = randomUUID();
    await db
      .insertInto('products')
      .values({
        id: productId,
        code: `IP-${suffix}`,
        name: `Integrity product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: 'none',
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `IPS-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  /** A confirmed one-line purchase order of `quantity` × 10.00 EGP. */
  async function createOrder(quantity: number): Promise<{ orderId: string; orderLineId: string; variantId: string }> {
    const supplierId = await createSupplier();
    const variantId = await createVariant();
    const orderId = randomUUID();
    await db
      .insertInto('purchase_orders')
      .values({
        id: orderId,
        po_number: `PO-I-${uniqueSuffix()}`,
        supplier_id: supplierId,
        source_quotation_id: null,
        status: 'confirmed',
        expected_delivery_date: null,
        notes: null,
        custom_fields: '{}',
      })
      .execute();
    const orderLineId = randomUUID();
    await db
      .insertInto('purchase_order_lines')
      .values({
        id: orderLineId,
        purchase_order_id: orderId,
        product_variant_id: variantId,
        quantity: String(quantity),
        unit_price_amount: '1000',
        unit_price_currency: 'EGP',
        notes: null,
        unit_of_measure_id: null,
      })
      .execute();
    return { orderId, orderLineId, variantId };
  }

  /** A DRAFT purchase invoice for `quantity` of the order line (invoice date left empty). */
  async function createDraftInvoice(
    order: { orderId: string; orderLineId: string; variantId: string },
    quantity: number,
  ): Promise<string> {
    const invoiceId = randomUUID();
    await db
      .insertInto('purchase_invoices')
      .values({
        id: invoiceId,
        invoice_number: `PINV-I-${uniqueSuffix()}`,
        supplier_invoice_number: null,
        purchase_order_id: order.orderId,
        status: 'draft',
        invoice_date: null,
        due_date: null,
        notes: null,
        custom_fields: '{}',
      })
      .execute();
    await db
      .insertInto('purchase_invoice_lines')
      .values({
        id: randomUUID(),
        purchase_invoice_id: invoiceId,
        purchase_order_line_id: order.orderLineId,
        product_variant_id: order.variantId,
        quantity_invoiced: String(quantity),
        unit_price_amount: '1000',
        unit_price_currency: 'EGP',
        notes: null,
        unit_of_measure_id: null,
      })
      .execute();
    return invoiceId;
  }

  function draftReceipt(order: { orderId: string; orderLineId: string }, quantity: number) {
    return goodsReceipts.create(db, {
      purchaseOrderId: order.orderId,
      warehouseId,
      lines: [{ purchaseOrderLineId: order.orderLineId, quantityReceived: quantity }],
      customFields: {},
    });
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    const suffix = uniqueSuffix();
    warehouseId = randomUUID();
    await db
      .insertInto('warehouses')
      .values({ id: warehouseId, name: `Integrity WH ${suffix}`, code: `IW-${suffix}`, is_active: true })
      .execute();

    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    await numbering.ensureTenantWide(db, 'goods_receipt', { prefix: 'GRN-', paddingLength: 5 });
    const outbox = new OutboxWriterService(new KyselyOutboxEventRepository());
    const orderRepo = new KyselyPurchaseOrderRepository();
    const orderLineRepo = new KyselyPurchaseOrderLineRepository();
    goodsReceipts = new GoodsReceiptsService(
      new KyselyGoodsReceiptRepository(),
      new KyselyGoodsReceiptLineRepository(),
      orderRepo,
      orderLineRepo,
      numbering,
      outbox,
      new KyselyProductTrackingReader(),
    );
    // Only cancel() is exercised here: the create-time collaborators are never reached.
    orders = new PurchaseOrdersService(
      orderRepo,
      orderLineRepo,
      new KyselySupplierRepository(),
      new KyselySupplierQuotationRepository(),
      new KyselySupplierQuotationLineRepository(),
      numbering,
      {} as never,
      {} as never,
      {} as never,
    );
    // Only post()/cancel() are exercised: tenant settings and feature toggles are create()-only.
    invoices = new PurchaseInvoicesService(
      new KyselyPurchaseInvoiceRepository(),
      new KyselyPurchaseInvoiceLineRepository(),
      orderRepo,
      orderLineRepo,
      new KyselyGoodsReceiptLineRepository(),
      numbering,
      {} as never,
      outbox,
      {} as never,
      orders,
      goodsReceipts,
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('two draft receipts for the whole order line: only one can be confirmed, even at the same moment', async () => {
    const order = await createOrder(5);
    const first = await draftReceipt(order, 5);
    const second = await draftReceipt(order, 5); // drafts don't count at create time

    const results = await Promise.allSettled([
      goodsReceipts.confirm(db, first.id, schema, null),
      goodsReceipts.confirm(db, second.id, schema, null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    // The loser sees either the PO already fully received or no quantity left — both refuse it.
    expect(['GOODS_RECEIPT.QUANTITY_EXCEEDS_REMAINING', 'GOODS_RECEIPT.PURCHASE_ORDER_NOT_RECEIVABLE']).toContain(
      (rejected.reason as { code?: string }).code,
    );

    const po = await db.selectFrom('purchase_orders').select('status').where('id', '=', order.orderId).executeTakeFirstOrThrow();
    expect(po.status).toBe('fully_received');
  });

  it('two draft invoices for the whole order line: only one posts, and it gets today as its date', async () => {
    const order = await createOrder(4);
    const first = await createDraftInvoice(order, 4);
    const second = await createDraftInvoice(order, 4);

    const results = await Promise.allSettled([
      invoices.post(db, first, schema, null),
      invoices.post(db, second, schema, null),
    ]);
    const posted = results.filter((result) => result.status === 'fulfilled') as PromiseFulfilledResult<{ invoiceDate: string | null }>[];
    expect(posted).toHaveLength(1);
    expect(posted[0]!.value.invoiceDate).toBe(localIsoDate());
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'PURCHASE_INVOICE.QUANTITY_EXCEEDS_REMAINING' });

    const postedId = results[0]!.status === 'fulfilled' ? first : second;
    const event = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', 'purchases.purchase_invoice.posted')
      .where(sql<string>`payload->>'entityId'`, '=', postedId)
      .executeTakeFirstOrThrow();
    // The outbox event carries the date the invoice was just given.
    expect((event.payload as { metadata: { invoiceDate: string | null } }).metadata.invoiceDate).toBe(localIsoDate());
  });

  it('nothing is received or invoiced against an order cancelled after the drafts were made', async () => {
    const order = await createOrder(3);
    const receipt = await draftReceipt(order, 3);
    const invoiceId = await createDraftInvoice(order, 3);
    await db.updateTable('purchase_orders').set({ status: 'cancelled' }).where('id', '=', order.orderId).execute();

    await expect(goodsReceipts.confirm(db, receipt.id, schema, null)).rejects.toMatchObject({
      code: 'GOODS_RECEIPT.PURCHASE_ORDER_NOT_RECEIVABLE',
    });
    await expect(invoices.post(db, invoiceId, schema, null)).rejects.toMatchObject({
      code: 'PURCHASE_INVOICE.PURCHASE_ORDER_NOT_INVOICEABLE',
    });
  });

  it('an order with a receipt or invoice (even a draft) cannot be cancelled until those are', async () => {
    const order = await createOrder(2);
    const receipt = await draftReceipt(order, 2);
    await expect(orders.cancel(db, order.orderId)).rejects.toMatchObject({
      code: 'PURCHASE_ORDER.HAS_DOCUMENTS',
      params: { documentNumber: receipt.receiptNumber },
    });

    await goodsReceipts.cancel(db, receipt.id);
    const invoiceId = await createDraftInvoice(order, 2);
    await expect(orders.cancel(db, order.orderId)).rejects.toMatchObject({ code: 'PURCHASE_ORDER.HAS_DOCUMENTS' });

    await invoices.cancel(db, invoiceId);
    await expect(orders.cancel(db, order.orderId)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('a status change by someone else is reported, not silently overwritten', async () => {
    const order = await createOrder(1);
    const receipt = await draftReceipt(order, 1);
    await goodsReceipts.cancel(db, receipt.id);
    await expect(goodsReceipts.cancel(db, receipt.id)).rejects.toMatchObject({
      code: 'GOODS_RECEIPT.INVALID_STATUS_TRANSITION',
    });
  });
});
