import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { PurchaseDebitNotesService, PURCHASE_DEBIT_NOTE_ISSUED } from '../../src/modules/purchases/application/services/purchase-debit-notes.service';
import { SupplierLedgerSource } from '../../src/modules/purchases/infrastructure/statements/supplier-ledger.source';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Purchase debit notes (migration 0096): only the invoiced part of a return, at the invoice's price and taxes. */
describe('Purchase debit notes (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let service: PurchaseDebitNotesService;
  const ctx = { schema: 'test', actorUserId: null };

  /** Supplier → PO line (10 × 100.00) → receipt of 10 → posted invoice of `invoiced` units with 14% VAT. */
  async function setup(invoiced: number) {
    const s = uniqueSuffix();
    const supplierId = randomUUID();
    await db.insertInto('suppliers').values({
      id: supplierId, name: `DN supplier ${s}`, code: `DN-${s}`, contact_person: null, email: null, phone: null, address: null,
      tax_number: null, default_currency: 'EGP', payment_terms_days: null, notes: null, is_active: true, custom_fields: '{}',
    }).execute();
    const unitId = randomUUID();
    await db.insertInto('units_of_measure').values({ id: unitId, name: `pc-${s}`, symbol: `pc${s}`, is_active: true, conversion_factor: '1' }).execute();
    const productId = randomUUID();
    await db.insertInto('products').values({
      id: productId, code: `DNP-${s}`, name: `DN product ${s}`, unit_of_measure_id: unitId, tracking_type: 'none', is_active: true, track_variants: false,
    }).execute();
    const variantId = randomUUID();
    await db.insertInto('product_variants').values({ id: variantId, product_id: productId, sku: `DNS-${s}`, is_active: true }).execute();
    const warehouseId = randomUUID();
    await db.insertInto('warehouses').values({ id: warehouseId, name: `W ${s}`, code: `W-${s}`, address: null, branch_id: null, is_active: true, custom_fields: '{}' }).execute();
    const orderId = randomUUID();
    await db.insertInto('purchase_orders').values({
      id: orderId, po_number: `PO-DN-${s}`, supplier_id: supplierId, source_quotation_id: null, status: 'confirmed',
      expected_delivery_date: null, notes: null, custom_fields: '{}',
    }).execute();
    const orderLineId = randomUUID();
    await db.insertInto('purchase_order_lines').values({
      id: orderLineId, purchase_order_id: orderId, product_variant_id: variantId, quantity: '10', unit_price_amount: '10000',
      unit_price_currency: 'EGP', notes: null, unit_of_measure_id: null,
    }).execute();
    const receiptId = randomUUID();
    await db.insertInto('goods_receipts').values({
      id: receiptId, receipt_number: `GR-DN-${s}`, purchase_order_id: orderId, warehouse_id: warehouseId, status: 'confirmed',
      received_date: '2026-10-01', notes: null, custom_fields: '{}', exchange_rate: null,
    }).execute();
    const receiptLineId = randomUUID();
    await db.insertInto('goods_receipt_lines').values({
      id: receiptLineId, goods_receipt_id: receiptId, purchase_order_line_id: orderLineId, product_variant_id: variantId,
      quantity_received: '10', unit_cost_amount: '10000', unit_cost_currency: 'EGP', notes: null, unit_of_measure_id: null,
    }).execute();
    if (invoiced > 0) {
      const invoiceId = randomUUID();
      await db.insertInto('purchase_invoices').values({
        id: invoiceId, invoice_number: `PINV-DN-${s}`, supplier_invoice_number: null, purchase_order_id: orderId, status: 'posted',
        invoice_date: '2026-10-01', due_date: null, notes: null, custom_fields: '{}',
      }).execute();
      const net = 10000 * invoiced;
      await db.insertInto('purchase_invoice_lines').values({
        id: randomUUID(), purchase_invoice_id: invoiceId, purchase_order_line_id: orderLineId, product_variant_id: variantId,
        quantity_invoiced: String(invoiced), unit_price_amount: '10000', unit_price_currency: 'EGP', notes: null, unit_of_measure_id: null,
        net_amount: String(net),
        taxes: JSON.stringify([{ taxRuleId: randomUUID(), name: 'VAT 14%', kind: 'vat', rate: '14', etaType: 'T1', etaSubtype: 'V009', baseMinorUnits: String(net), amountMinorUnits: String((net * 14) / 100) }]),
      }).execute();
    }
    return { supplierId, variantId, receiptId, receiptLineId };
  }

  async function returnOf(setupResult: Awaited<ReturnType<typeof setup>>, quantity: number) {
    const id = randomUUID();
    const returnNumber = `PRT-DN-${uniqueSuffix()}`;
    await db.insertInto('purchase_returns').values({
      id, return_number: returnNumber, goods_receipt_id: setupResult.receiptId, status: 'confirmed', return_date: '2026-10-05', notes: null, custom_fields: '{}',
    }).execute();
    const lineId = randomUUID();
    await db.insertInto('purchase_return_lines').values({
      id: lineId, purchase_return_id: id, goods_receipt_line_id: setupResult.receiptLineId, product_variant_id: setupResult.variantId,
      quantity_returned: String(quantity), reason: null, notes: null, unit_of_measure_id: null,
    }).execute();
    return service.issueForReturn(
      db,
      { id, returnNumber, returnDate: '2026-10-05' },
      [{ id: lineId, goodsReceiptLineId: setupResult.receiptLineId, productVariantId: setupResult.variantId, quantityReturned: quantity, unitFactor: 1 }],
      ctx,
    );
  }

  async function supplierBalance(supplierId: string): Promise<bigint> {
    const entries = await new SupplierLedgerSource().listEntries(db, supplierId);
    return entries.reduce((sum, e) => sum + e.amountMinor, 0n);
  }

  beforeAll(() => {
    db = openIntegrationDb();
    service = new PurchaseDebitNotesService(
      new NumberingSequencesService(new KyselyNumberingSequenceRepository()),
      new OutboxWriterService(new KyselyOutboxEventRepository()),
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('credits the invoiced price and VAT, caps at what is still invoiced, and lowers the supplier balance', async () => {
    const s = await setup(10);
    expect(await supplierBalance(s.supplierId)).toBe(114_000n);

    const first = await returnOf(s, 3);
    expect(first?.debitNoteNumber).toBeTruthy();
    const outbox = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', PURCHASE_DEBIT_NOTE_ISSUED)
      .where(sql`payload->>'entityId'`, '=', first!.id)
      .executeTakeFirstOrThrow();
    const metadata = (outbox.payload as { metadata: Record<string, { amountMinorUnits: string }> }).metadata;
    expect(metadata.netAmount!.amountMinorUnits).toBe('30000');
    expect(metadata.vatAmount!.amountMinorUnits).toBe('4200');
    expect(metadata.totalAmount!.amountMinorUnits).toBe('34200');
    expect(await supplierBalance(s.supplierId)).toBe(79_800n);

    // 8 more returned, only 7 still invoiced → capped; nothing left after that.
    expect(await returnOf(s, 8)).not.toBeNull();
    expect(await supplierBalance(s.supplierId)).toBe(0n);
    expect(await returnOf(s, 1)).toBeNull();
  });

  it('issues nothing for goods returned before they were invoiced', async () => {
    const s = await setup(0);
    expect(await returnOf(s, 2)).toBeNull();
    expect(await supplierBalance(s.supplierId)).toBe(0n);
  });
});
