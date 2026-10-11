import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Kysely } from 'kysely';
import { createE2eApp } from './app';
import { authHeader, loginAs, type LoggedInSession } from './auth-helpers';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';
import { createTenantKyselyClient, type TenantDatabase } from '../../src/database/tenant/kysely-client';
import { mustGetTestDatabaseUrl } from '../support/test-tenant';

/**
 * Marketplace settlement (migration 0099): Jumia orders invoiced on the
 * channel, a weekly statement pays some of them and keeps its fees; the
 * channel treasury ends with exactly the payout and the unpaid orders are
 * what's left open.
 */
describe('Sales channels & marketplace settlements (e2e)', () => {
  let app: INestApplication;
  let owner: LoggedInSession;
  let db: Kysely<TenantDatabase>;
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;

  beforeAll(async () => {
    app = await createE2eApp();
    owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    db = createTenantKyselyClient(mustGetTestDatabaseUrl(), schema());
  });

  afterAll(async () => {
    await db.destroy();
    await app.close();
  });

  /** A posted invoice of `amount` minor units on the channel with the platform order number `ref`. */
  async function postedInvoice(customerId: string, channelId: string, variantId: string, ref: string, amount: number): Promise<string> {
    const orderId = randomUUID();
    await db.insertInto('sales_orders').values({ id: orderId, so_number: `SO-${ref}`, customer_id: customerId, source_quotation_id: null, status: 'confirmed', currency: 'EGP', discount_type: null, discount_percentage: null, discount_fixed_amount: null, notes: null, custom_fields: '{}' }).execute();
    const lineId = randomUUID();
    await db.insertInto('sales_order_lines').values({ id: lineId, sales_order_id: orderId, product_variant_id: variantId, quantity: '1', unit_price_amount: String(amount), unit_price_currency: 'EGP', discount_type: null, discount_percentage: null, discount_fixed_amount: null, notes: null, unit_of_measure_id: null }).execute();
    const invoiceId = randomUUID();
    await db.insertInto('sales_invoices').values({ id: invoiceId, invoice_number: `INV-${ref}`, sales_order_id: orderId, status: 'posted', invoice_date: '2026-10-01', due_date: null, notes: null, custom_fields: '{}', sales_channel_id: channelId, external_reference: ref }).execute();
    await db.insertInto('sales_invoice_lines').values({ id: randomUUID(), sales_invoice_id: invoiceId, sales_order_line_id: lineId, product_variant_id: variantId, quantity_invoiced: '1', unit_price_amount: String(amount), unit_price_currency: 'EGP', notes: null, unit_of_measure_id: null, net_amount: String(amount) }).execute();
    return invoiceId;
  }

  it('matches statement lines to orders, receives orders − refunds, keeps fees out of the channel treasury', async () => {
    const server = app.getHttpServer();
    const auth = authHeader(owner);
    const s = Date.now().toString().slice(-6);

    const customer = await request(server).post('/customers').set(...auth).send({ name: `جوميا ${s}`, defaultCurrency: 'EGP' }).expect(201);
    const wallet = await request(server).post('/treasuries').set(...auth).send({ code: `JUM-${s}`, name: 'حساب جوميا', kind: 'bank', currency: 'EGP' }).expect(201);
    const channel = await request(server)
      .post('/sales-channels')
      .set(...auth)
      .send({ code: `JUMIA-${s}`, name: 'جوميا', kind: 'marketplace', customerId: customer.body.id, treasuryId: wallet.body.id })
      .expect(201);
    const categories = await request(server).get('/treasury-categories').set(...auth).expect(200);
    const expenseItem = categories.body.find((c: { kind: string }) => c.kind === 'expense');
    expect(expenseItem).toBeDefined();

    const product = await request(server).post('/products').set(...auth).send({ code: `TS-${s}`, name: 'تيشيرت' }).expect(201);
    const variant = { id: product.body.variants[0].id as string };
    const paid = await postedInvoice(customer.body.id, channel.body.id, variant.id, `J1-${s}`, 50000);
    await postedInvoice(customer.body.id, channel.body.id, variant.id, `J2-${s}`, 30000);

    const draft = await request(server)
      .post('/channel-settlements')
      .set(...auth)
      .send({
        salesChannelId: channel.body.id,
        statementDate: '2026-10-05',
        lines: [
          { kind: 'order', externalReference: `J1-${s}`, amountMinorUnits: '50000' },
          { kind: 'order', externalReference: `UNKNOWN-${s}`, amountMinorUnits: '1000' },
          { kind: 'fee', description: 'عمولة', amountMinorUnits: '6000', categoryId: expenseItem.id },
        ],
      })
      .expect(201);
    expect(draft.body.lines.map((l: { match: string }) => l.match)).toEqual(['matched', 'unmatched', 'not_applicable']);
    expect(draft.body.netPayout.amountMinorUnits).toBe('45000');

    const posted = await request(server).patch(`/channel-settlements/${draft.body.id}/post`).set(...auth).expect(200);
    expect(posted.body.status).toBe('posted');
    await request(server).put(`/channel-settlements/${draft.body.id}`).set(...auth).send({ salesChannelId: channel.body.id, statementDate: '2026-10-05', lines: [{ kind: 'order', amountMinorUnits: '1' }] }).expect(422);

    // The channel treasury holds the payout: 510.00 received − 60.00 fees.
    const treasury = await request(server).get(`/treasuries/${wallet.body.id}`).set(...auth).expect(200);
    expect(treasury.body.balance.amountMinorUnits).toBe('45000');

    // J1 is paid; J2 is still "shipped, not paid".
    const unpaid = await request(server).get(`/sales-channels/${channel.body.id}/unpaid-orders`).set(...auth).expect(200);
    expect(unpaid.body.map((o: { externalReference: string }) => o.externalReference)).toEqual([`J2-${s}`]);
    expect(unpaid.body.some((o: { salesInvoiceId: string }) => o.salesInvoiceId === paid)).toBe(false);
  });
});
