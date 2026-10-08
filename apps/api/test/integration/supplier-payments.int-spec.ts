import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { SupplierPaymentsService } from '../../src/modules/purchases/application/services/supplier-payments.service';
import { KyselySupplierPaymentRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier-payment.repository';
import { KyselySupplierPaymentAllocationRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier-payment-allocation.repository';
import { KyselySupplierRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-supplier.repository';
import { KyselyPurchaseOrderRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-order.repository';
import { KyselyPurchaseInvoiceRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-invoice.repository';
import { KyselyPurchaseInvoiceLineRepository } from '../../src/modules/purchases/infrastructure/persistence/kysely-purchase-invoice-line.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** Supplier payments (migration 0090): allocation rules against posted purchase invoices + the posting outbox row. */
describe('Supplier payments (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let service: SupplierPaymentsService;
  const egp = (minor: bigint) => Money.fromMinorUnits(minor, 'EGP');

  async function createSupplier(): Promise<string> {
    const suffix = uniqueSuffix();
    const id = randomUUID();
    await db
      .insertInto('suppliers')
      .values({
        id,
        name: `Pay supplier ${suffix}`,
        code: `PS-${suffix}`,
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
        code: `SP-${suffix}`,
        name: `Pay product ${suffix}`,
        unit_of_measure_id: unitId,
        tracking_type: 'none',
        is_active: true,
        track_variants: false,
      })
      .execute();
    const variantId = randomUUID();
    await db
      .insertInto('product_variants')
      .values({ id: variantId, product_id: productId, sku: `SPS-${suffix}`, is_active: true })
      .execute();
    return variantId;
  }

  /** A purchase order + one-line purchase invoice for `supplierId` totalling qty × unit price (minor units). */
  async function createInvoice(
    supplierId: string,
    quantity: number,
    unitPriceMinor: bigint,
    status: 'draft' | 'posted' = 'posted',
  ): Promise<string> {
    const suffix = uniqueSuffix();
    const variantId = await createVariant();
    const orderId = randomUUID();
    await db
      .insertInto('purchase_orders')
      .values({
        id: orderId,
        po_number: `PO-T-${suffix}`,
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
        unit_price_amount: unitPriceMinor.toString(),
        unit_price_currency: 'EGP',
        notes: null,
        unit_of_measure_id: null,
      })
      .execute();
    const invoiceId = randomUUID();
    await db
      .insertInto('purchase_invoices')
      .values({
        id: invoiceId,
        invoice_number: `PINV-T-${suffix}`,
        supplier_invoice_number: null,
        purchase_order_id: orderId,
        status,
        invoice_date: '2026-10-01',
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
        purchase_order_line_id: orderLineId,
        product_variant_id: variantId,
        quantity_invoiced: String(quantity),
        unit_price_amount: unitPriceMinor.toString(),
        unit_price_currency: 'EGP',
        notes: null,
        unit_of_measure_id: null,
      })
      .execute();
    return invoiceId;
  }

  async function outboxPayloads(eventType: string, paymentId: string): Promise<{ metadata: Record<string, unknown> }[]> {
    const rows = await db
      .selectFrom('outbox_events')
      .select('payload')
      .where('event_type', '=', eventType)
      .where(sql`payload->>'entityId'`, '=', paymentId)
      .execute();
    return rows.map((r) => r.payload as { metadata: Record<string, unknown> });
  }

  beforeAll(() => {
    db = openIntegrationDb();
    service = new SupplierPaymentsService(
      new KyselySupplierPaymentRepository(),
      new KyselySupplierPaymentAllocationRepository(),
      new KyselySupplierRepository(),
      new KyselyPurchaseOrderRepository(),
      new KyselyPurchaseInvoiceRepository(),
      new KyselyPurchaseInvoiceLineRepository(),
      new NumberingSequencesService(new KyselyNumberingSequenceRepository()),
      new OutboxWriterService(new KyselyOutboxEventRepository()),
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a draft with an allocation, posts it and writes the outbox row in the same transaction', async () => {
    const supplierId = await createSupplier();
    const invoiceId = await createInvoice(supplierId, 2, 50_00n); // 100.00 EGP

    const draft = await service.create(db, {
      supplierId,
      amount: egp(150_00n),
      paymentMethod: 'cash',
      paymentDate: '2026-10-05',
      allocations: [{ purchaseInvoiceId: invoiceId, allocatedAmount: egp(60_00n) }],
    });
    expect(draft.status).toBe('draft');
    expect(draft.paymentNumber).toMatch(/^PAY-/);
    expect(draft.unallocatedAmount.toMinorUnits()).toBe(90_00n);
    expect(await outboxPayloads('purchases.supplier_payment.posted', draft.id)).toHaveLength(0);

    const posted = await service.post(db, draft.id, 'test', null);
    expect(posted.status).toBe('posted');

    const [event] = await outboxPayloads('purchases.supplier_payment.posted', draft.id);
    expect(event.metadata).toMatchObject({
      supplierId,
      paymentNumber: draft.paymentNumber,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      // A cash payment with no treasury chosen goes out of the default cash box (migration 0095).
      treasuryId: expect.any(String),
      amount: { amountMinorUnits: '15000', currency: 'EGP' },
      allocations: [{ purchaseInvoiceId: invoiceId, allocatedAmount: { amountMinorUnits: '6000', currency: 'EGP' } }],
    });

    const [outstanding] = await service.listOutstandingInvoices(db, supplierId);
    expect(outstanding.purchaseInvoiceId).toBe(invoiceId);
    expect(outstanding.totalAmount.toMinorUnits()).toBe(100_00n);
    expect(outstanding.paidAmount.toMinorUnits()).toBe(60_00n);
    expect(outstanding.outstandingAmount.toMinorUnits()).toBe(40_00n);
  });

  it('rejects an allocation beyond the invoice outstanding (counting other posted payments)', async () => {
    const supplierId = await createSupplier();
    const invoiceId = await createInvoice(supplierId, 1, 100_00n);

    const first = await service.create(db, {
      supplierId,
      amount: egp(70_00n),
      paymentMethod: 'cash',
      allocations: [{ purchaseInvoiceId: invoiceId, allocatedAmount: egp(70_00n) }],
    });
    await service.post(db, first.id, 'test', null);

    await expect(
      service.create(db, {
        supplierId,
        amount: egp(50_00n),
        paymentMethod: 'cash',
        allocations: [{ purchaseInvoiceId: invoiceId, allocatedAmount: egp(40_00n) }],
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.ALLOCATION_EXCEEDS_OUTSTANDING' });
  });

  it('rejects allocations that exceed the payment amount', async () => {
    const supplierId = await createSupplier();
    const invoiceId = await createInvoice(supplierId, 1, 100_00n);
    await expect(
      service.create(db, {
        supplierId,
        amount: egp(30_00n),
        paymentMethod: 'cash',
        allocations: [{ purchaseInvoiceId: invoiceId, allocatedAmount: egp(50_00n) }],
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.ALLOCATION_EXCEEDS_AVAILABLE' });
  });

  it("rejects another supplier's invoice and a draft invoice", async () => {
    const supplierId = await createSupplier();
    const otherSupplierId = await createSupplier();
    const otherInvoice = await createInvoice(otherSupplierId, 1, 100_00n);
    const draftInvoice = await createInvoice(supplierId, 1, 100_00n, 'draft');

    await expect(
      service.create(db, {
        supplierId,
        amount: egp(10_00n),
        paymentMethod: 'cash',
        allocations: [{ purchaseInvoiceId: otherInvoice, allocatedAmount: egp(10_00n) }],
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.INVOICE_SUPPLIER_MISMATCH' });
    await expect(
      service.create(db, {
        supplierId,
        amount: egp(10_00n),
        paymentMethod: 'cash',
        allocations: [{ purchaseInvoiceId: draftInvoice, allocatedAmount: egp(10_00n) }],
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.INVOICE_NOT_POSTED' });
  });

  it('allocates a posted payment remainder later and writes the allocated outbox row', async () => {
    const supplierId = await createSupplier();
    const invoiceA = await createInvoice(supplierId, 1, 40_00n);
    const invoiceB = await createInvoice(supplierId, 1, 80_00n);

    const payment = await service.create(db, { supplierId, amount: egp(100_00n), paymentMethod: 'cash' });
    await expect(
      service.allocate(db, payment.id, 'test', null, [{ purchaseInvoiceId: invoiceA, allocatedAmount: egp(10_00n) }]),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.NOT_ALLOCATABLE' });

    await service.post(db, payment.id, 'test', null);
    const afterFirst = await service.allocate(db, payment.id, 'test', null, [
      { purchaseInvoiceId: invoiceA, allocatedAmount: egp(40_00n) },
    ]);
    expect(afterFirst.unallocatedAmount.toMinorUnits()).toBe(60_00n);

    await expect(
      service.allocate(db, payment.id, 'test', null, [{ purchaseInvoiceId: invoiceB, allocatedAmount: egp(70_00n) }]),
    ).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.ALLOCATION_EXCEEDS_AVAILABLE' });

    const afterSecond = await service.allocate(db, payment.id, 'test', null, [
      { purchaseInvoiceId: invoiceB, allocatedAmount: egp(60_00n) },
    ]);
    expect(afterSecond.unallocatedAmount.isZero()).toBe(true);
    expect((await service.getById(db, payment.id)).allocations).toHaveLength(2);
    expect(await outboxPayloads('purchases.supplier_payment.allocated', payment.id)).toHaveLength(2);
  });

  it('only cancels / deletes drafts, and refuses an unknown treasury', async () => {
    const supplierId = await createSupplier();
    const posted = await service.create(db, { supplierId, amount: egp(5_00n), paymentMethod: 'cash' });
    await service.post(db, posted.id, 'test', null);
    await expect(service.cancel(db, posted.id)).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.NOT_CANCELLABLE' });
    await expect(service.delete(db, posted.id)).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.NOT_DELETABLE' });

    const draft = await service.create(db, { supplierId, amount: egp(5_00n), paymentMethod: 'check' });
    expect((await service.cancel(db, draft.id)).status).toBe('cancelled');
    await service.delete(db, draft.id);
    await expect(service.getById(db, draft.id)).rejects.toMatchObject({ code: 'SUPPLIER_PAYMENT.NOT_FOUND' });

    await expect(
      service.create(db, { supplierId, amount: egp(5_00n), paymentMethod: 'cash', treasuryId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'PAYMENT.TREASURY_UNUSABLE' });
  });
});
