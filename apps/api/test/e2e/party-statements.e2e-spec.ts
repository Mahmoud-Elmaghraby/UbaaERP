import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { authHeader, loginAs, type LoggedInSession } from './auth-helpers';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';
import { createTenantKyselyClient, type TenantDatabase } from '../../src/database/tenant/kysely-client';
import { mustGetTestDatabaseUrl } from '../support/test-tenant';
import type { Kysely } from 'kysely';

/**
 * Customer/supplier opening balances, statements and balances — and that
 * Accounting only posts the opening balance when the module is enabled
 * (the outbox event is consumed either way).
 */
describe('Party statements & opening balances (e2e)', () => {
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
    await db.deleteFrom('tenant_feature_toggles').where('feature_key', '=', 'accounting').execute();
    await db.destroy();
    await app.close();
  });

  async function createCustomer(code: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set(...authHeader(owner))
      .send({ name: `عميل ${code}`, code, defaultCurrency: 'EGP' })
      .expect(201);
    return res.body.id;
  }

  async function waitForOutbox(eventType: string, entityId: string): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      const rows = await db
        .selectFrom('outbox_events')
        .select(['status', 'payload'])
        .where('event_type', '=', eventType)
        .execute();
      const mine = rows.filter((r) => (r.payload as { entityId?: string }).entityId === entityId);
      if (mine.length > 0 && mine.every((r) => r.status === 'processed')) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`outbox event ${eventType} for ${entityId} was not processed`);
  }

  const openingEntries = () =>
    db.selectFrom('journal_entries').select(['id']).where('source_reference_type', '=', 'customer_opening_balance').execute();

  it('opening balance flows into the statement, the balances report and the printed statement', async () => {
    const id = await createCustomer(`OB-${Date.now()}`);
    const server = app.getHttpServer();

    await request(server)
      .put(`/customers/${id}/opening-balance`)
      .set(...authHeader(owner))
      .send({ amount: { amountMinorUnits: '150000', currency: 'EGP' }, side: 'owes_us', date: '2026-01-01' })
      .expect(200, { amount: { amountMinorUnits: '150000', currency: 'EGP' }, side: 'owes_us', date: '2026-01-01' });

    const statement = await request(server).get(`/customers/${id}/statement`).set(...authHeader(owner)).expect(200);
    expect(statement.body.rows).toHaveLength(1);
    expect(statement.body.rows[0]).toMatchObject({ kind: 'opening_balance', date: '2026-01-01' });
    expect(statement.body.closingBalance).toEqual({ amountMinorUnits: '150000', currency: 'EGP' });

    const later = await request(server).get(`/customers/${id}/statement?from=2026-02-01`).set(...authHeader(owner)).expect(200);
    expect(later.body.openingBalance.amountMinorUnits).toBe('150000');
    expect(later.body.rows).toHaveLength(0);

    const balances = await request(server).get('/customer-balances?asOf=2026-06-30').set(...authHeader(owner)).expect(200);
    const row = balances.body.rows.find((r: { partyId: string }) => r.partyId === id);
    expect(row.balance.amountMinorUnits).toBe('150000');
    expect(row.aging.over90.amountMinorUnits).toBe('150000');

    const printed = await request(server).get(`/print/customer_statement/${id}?from=2025-01-01`).set(...authHeader(owner)).expect(200);
    expect(printed.body.document.ledger.closingBalance.amountMinorUnits).toBe('150000');
    expect(printed.body.document.fields[0].value).toContain('2025-01-01');

    await request(server)
      .put(`/customers/${id}/opening-balance`)
      .set(...authHeader(owner))
      .send({ amount: { amountMinorUnits: '-5', currency: 'EGP' }, side: 'owes_us', date: '2026-01-01' })
      .expect(400);
  });

  it('posts the opening balance to Accounting only while Accounting is enabled', async () => {
    const server = app.getHttpServer();
    const before = (await openingEntries()).length;

    // Accounting off: the event is consumed, nothing is posted.
    await db
      .insertInto('tenant_feature_toggles')
      .values({ feature_key: 'accounting', enabled: false })
      .onConflict((oc) => oc.column('feature_key').doUpdateSet({ enabled: false }))
      .execute();
    const off = await createCustomer(`OFF-${Date.now()}`);
    await request(server)
      .put(`/customers/${off}/opening-balance`)
      .set(...authHeader(owner))
      .send({ amount: { amountMinorUnits: '1000', currency: 'EGP' }, side: 'owes_us', date: '2026-01-01' })
      .expect(200);
    await waitForOutbox('sales.customer.opening_balance_set', off);
    expect((await openingEntries()).length).toBe(before);

    // Accounting on: the change is posted.
    await db.updateTable('tenant_feature_toggles').set({ enabled: true }).where('feature_key', '=', 'accounting').execute();
    const on = await createCustomer(`ON-${Date.now()}`);
    await request(server)
      .put(`/customers/${on}/opening-balance`)
      .set(...authHeader(owner))
      .send({ amount: { amountMinorUnits: '2000', currency: 'EGP' }, side: 'owes_us', date: '2026-01-01' })
      .expect(200);
    await waitForOutbox('sales.customer.opening_balance_set', on);
    expect((await openingEntries()).length).toBe(before + 1);
  });

  it('supplier statement and payables report answer for a new supplier', async () => {
    const server = app.getHttpServer();
    const supplier = await request(server)
      .post('/suppliers')
      .set(...authHeader(owner))
      .send({ name: 'مورد كشف', code: `SUP-${Date.now()}`, defaultCurrency: 'EGP' })
      .expect(201);
    await request(server)
      .put(`/suppliers/${supplier.body.id}/opening-balance`)
      .set(...authHeader(owner))
      .send({ amount: { amountMinorUnits: '7000', currency: 'EGP' }, side: 'we_owe', date: '2026-01-01' })
      .expect(200);
    const statement = await request(server).get(`/suppliers/${supplier.body.id}/statement`).set(...authHeader(owner)).expect(200);
    expect(statement.body.partyKind).toBe('supplier');
    expect(statement.body.closingBalance.amountMinorUnits).toBe('7000');
    const payables = await request(server).get('/supplier-balances').set(...authHeader(owner)).expect(200);
    expect(payables.body.rows.some((r: { partyId: string }) => r.partyId === supplier.body.id)).toBe(true);
  });
});
