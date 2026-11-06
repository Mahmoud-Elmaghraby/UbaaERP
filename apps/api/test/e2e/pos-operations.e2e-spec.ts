import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { authHeader, loginAs, type LoggedInSession } from './auth-helpers';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';

/**
 * The till beyond checkout (migration 0113): a sale, its return refunded
 * from the drawer, a parked sale, cash out of the drawer — and the shift's
 * expected cash accounts for all of it. The owner supervises, so no PIN.
 */
describe('POS operations (e2e)', () => {
  let app: INestApplication;
  let owner: LoggedInSession;
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;
  const egp = (minor: number) => ({ amountMinorUnits: String(minor), currency: 'EGP' });

  beforeAll(async () => {
    app = await createE2eApp();
    owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  }, 60_000);

  it('sale → return refunded from the drawer → parked sale → cash out → expected cash', async () => {
    const server = app.getHttpServer();
    const auth = authHeader(owner);
    const s = Date.now().toString().slice(-6);

    const warehouse = await request(server).post('/warehouses').set(...auth).send({ code: `POS-${s}`, name: `مخزن الكاشير ${s}` }).expect(201);
    const product = await request(server).post('/products').set(...auth).send({ code: `PS-${s}`, name: 'كوباية' }).expect(201);
    const variantId = product.body.variants[0].id as string;
    await request(server)
      .post('/stock-adjustments')
      .set(...auth)
      .send({ warehouseId: warehouse.body.id, post: true, lines: [{ productVariantId: variantId, direction: 'increase', quantity: 10, unitCost: egp(2000) }] })
      .expect(201);

    // Close any shift the owner left open in this tenant, then open ours.
    const current = await request(server).get('/pos-sessions/current').set(...auth).expect(200);
    if (current.body?.id) {
      await request(server).post(`/pos-sessions/${current.body.id}/close`).set(...auth).send({ countedCashAmount: egp(0) }).expect(201);
    }
    const session = await request(server).post('/pos-sessions').set(...auth).send({ openingCashAmount: egp(10000), warehouseId: warehouse.body.id }).expect(201);
    const sessionId = session.body.id as string;

    // Sale: 3 × 50.00 paid 200.00 cash → change 50.00.
    const sale = await request(server)
      .post(`/pos-sessions/${sessionId}/checkout`)
      .set(...auth)
      .send({ checkoutId: randomUUID(), lines: [{ productVariantId: variantId, quantity: 3, unitPrice: egp(5000) }], tenders: [{ paymentMethod: 'cash', amount: egp(20000) }] })
      .expect(201);
    expect(sale.body.changeAmount.amountMinorUnits).toBe('5000');
    const invoiceNumber = sale.body.salesInvoice.invoiceNumber as string;

    const receipts = await request(server).get(`/pos/sessions/${sessionId}/sales`).set(...auth).expect(200);
    expect(receipts.body.map((r: { invoiceNumber: string }) => r.invoiceNumber)).toContain(invoiceNumber);

    // Return 1 of the 3, refunded in cash from the drawer.
    const lookup = await request(server).get('/pos/sales/lookup').query({ number: invoiceNumber }).set(...auth).expect(200);
    expect(lookup.body.lines[0].returnableQuantity).toBe(3);
    expect(lookup.body.lines[0].unitAmount.amountMinorUnits).toBe('5000');
    const returned = await request(server)
      .post(`/pos/sessions/${sessionId}/returns`)
      .set(...auth)
      .send({ deliveryId: lookup.body.deliveryId, lines: [{ deliveryLineId: lookup.body.lines[0].deliveryLineId, quantity: 1 }], refund: { paymentMethod: 'cash' } })
      .expect(201);
    expect(returned.body.amount.amountMinorUnits).toBe('5000');
    expect(returned.body.refund.amount.amountMinorUnits).toBe('5000');
    const again = await request(server).get('/pos/sales/lookup').query({ number: invoiceNumber }).set(...auth).expect(200);
    expect(again.body.lines[0].returnableQuantity).toBe(2);
    expect(again.body.hasReturns).toBe(true);

    // A refund can't go beyond the customer's credit (the walk-in has none left).
    await request(server)
      .post('/customer-refunds')
      .set(...auth)
      .send({ customerId: sale.body.salesOrder.customerId, amount: egp(100), paymentMethod: 'cash' })
      .expect((res) => expect(res.body.code).toBe('CUSTOMER_REFUND.EXCEEDS_CREDIT'));

    // Park a sale and take it back.
    const held = await request(server)
      .post(`/pos/sessions/${sessionId}/held-carts`)
      .set(...auth)
      .send({ label: 'الزبون الأحمر', payload: { lines: [{ productVariantId: variantId, quantity: 1 }] }, total: egp(5000), itemCount: 1 })
      .expect(201);
    const parked = await request(server).get(`/pos/sessions/${sessionId}/held-carts`).set(...auth).expect(200);
    expect(parked.body.map((c: { id: string }) => c.id)).toContain(held.body.id);
    await request(server).delete(`/pos/held-carts/${held.body.id}`).set(...auth).expect(204);
    await request(server).delete(`/pos/held-carts/${held.body.id}`).set(...auth).expect(404);

    // 30.00 to the safe, from the drawer.
    const safe = await request(server).post('/treasuries').set(...auth).send({ code: `SAFE-${s}`, name: `الخزنة ${s}`, kind: 'cash', currency: 'EGP' }).expect(201);
    const options = await request(server).get(`/pos-drawer/${sessionId}/options`).set(...auth).expect(200);
    expect(options.body.treasuries.map((t: { id: string }) => t.id)).toContain(safe.body.id);
    await request(server)
      .post(`/pos-drawer/${sessionId}/movements`)
      .set(...auth)
      .send({ kind: 'to_treasury', amount: egp(3000), otherTreasuryId: safe.body.id })
      .expect(201);

    // Expected: 100 opening + 150 sale − 50 refund − 30 to the safe = 170.00.
    const report = await request(server).get(`/pos-sessions/${sessionId}/report`).set(...auth).expect(200);
    expect(report.body.cashRefundsAmount.amountMinorUnits).toBe('5000');
    expect(report.body.cashOutAmount.amountMinorUnits).toBe('3000');
    expect(report.body.returnsCount).toBe(1);
    expect(report.body.expectedCashAmount.amountMinorUnits).toBe('17000');

    const closed = await request(server).post(`/pos-sessions/${sessionId}/close`).set(...auth).send({ countedCashAmount: egp(17000) }).expect(201);
    expect(closed.body.varianceAmount.amountMinorUnits).toBe('0');
  }, 120_000);
});
