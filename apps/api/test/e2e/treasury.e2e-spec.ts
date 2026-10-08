import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Kysely } from 'kysely';
import { createE2eApp } from './app';
import { authHeader, loginAs, type LoggedInSession } from './auth-helpers';
import { E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';
import { createTenantKyselyClient, type TenantDatabase } from '../../src/database/tenant/kysely-client';
import { mustGetTestDatabaseUrl } from '../support/test-tenant';

/**
 * Treasury module end to end: treasuries with balances, expense / income /
 * transfer vouchers, cancellation, the treasury statement, printing,
 * permissions — and the journal entries Accounting posts from the events.
 */
describe('Treasury (e2e)', () => {
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

  async function waitForProcessed(entityId: string): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      const rows = await db.selectFrom('outbox_events').select(['status', 'payload']).where('event_type', 'like', 'treasury.%').execute();
      const mine = rows.filter((r) => (r.payload as { entityId?: string }).entityId === entityId);
      if (mine.length > 0 && mine.every((r) => r.status === 'processed')) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`treasury events for ${entityId} were not processed`);
  }

  it('records vouchers, keeps balances and statements, and posts them to Accounting', async () => {
    const server = app.getHttpServer();
    const suffix = Date.now().toString().slice(-6);

    const cash = await request(server)
      .post('/treasuries')
      .set(...authHeader(owner))
      .send({ code: `C-${suffix}`, name: 'خزينة الفرع', kind: 'cash', currency: 'EGP', openingBalanceMinorUnits: '100000', openingBalanceDate: '2026-01-01' })
      .expect(201);
    const bank = await request(server)
      .post('/treasuries')
      .set(...authHeader(owner))
      .send({ code: `B-${suffix}`, name: 'بنك', kind: 'bank', currency: 'EGP', bankName: 'CIB' })
      .expect(201);
    expect(cash.body.balance.amountMinorUnits).toBe('100000');

    await request(server)
      .post('/treasuries')
      .set(...authHeader(owner))
      .send({ code: `C-${suffix}`, name: 'مكرر', kind: 'cash', currency: 'EGP' })
      .expect(409);

    const categories = await request(server).get('/treasury-categories?kind=expense').set(...authHeader(owner)).expect(200);
    const rent = categories.body.find((c: { name: string }) => c.name === 'إيجارات');
    expect(rent).toBeDefined();
    const income = (await request(server).get('/treasury-categories?kind=income').set(...authHeader(owner)).expect(200)).body[0];

    const expense = await request(server)
      .post('/treasury-vouchers')
      .set(...authHeader(owner))
      .send({ kind: 'expense', voucherDate: '2026-03-01', treasuryId: cash.body.id, categoryId: rent.id, amountMinorUnits: '30000', counterparty: 'المالك' })
      .expect(201);
    expect(expense.body.voucherNumber).toMatch(/^EXP-/);
    const other = await request(server)
      .post('/treasury-vouchers')
      .set(...authHeader(owner))
      .send({ kind: 'income', voucherDate: '2026-03-02', treasuryId: cash.body.id, categoryId: income.id, amountMinorUnits: '5000' })
      .expect(201);
    const transfer = await request(server)
      .post('/treasury-vouchers')
      .set(...authHeader(owner))
      .send({ kind: 'transfer', voucherDate: '2026-03-03', treasuryId: cash.body.id, toTreasuryId: bank.body.id, amountMinorUnits: '20000' })
      .expect(201);

    // An expense needs an item; a transfer needs another treasury.
    await request(server)
      .post('/treasury-vouchers')
      .set(...authHeader(owner))
      .send({ kind: 'expense', voucherDate: '2026-03-01', treasuryId: cash.body.id, amountMinorUnits: '1' })
      .expect(400);
    await request(server)
      .post('/treasury-vouchers')
      .set(...authHeader(owner))
      .send({ kind: 'expense', voucherDate: '2026-03-01', treasuryId: cash.body.id, categoryId: income.id, amountMinorUnits: '1' })
      .expect(422);

    const statement = await request(server).get(`/treasuries/${cash.body.id}/statement`).set(...authHeader(owner)).expect(200);
    expect(statement.body.rows.map((r: { kind: string }) => r.kind)).toEqual(['opening_balance', 'expense', 'income', 'transfer_out']);
    expect(statement.body.closingBalance.amountMinorUnits).toBe('55000'); // 1000 − 300 + 50 − 200
    const bankNow = await request(server).get(`/treasuries/${bank.body.id}`).set(...authHeader(owner)).expect(200);
    expect(bankNow.body.balance.amountMinorUnits).toBe('20000');

    // Cancelling takes the voucher out of the balance and needs a reason.
    await request(server).post(`/treasury-vouchers/${other.body.id}/cancel`).set(...authHeader(owner)).send({}).expect(400);
    await request(server).post(`/treasury-vouchers/${other.body.id}/cancel`).set(...authHeader(owner)).send({ reason: 'خطأ' }).expect(201);
    const after = await request(server).get(`/treasuries/${cash.body.id}`).set(...authHeader(owner)).expect(200);
    expect(after.body.balance.amountMinorUnits).toBe('50000');

    const printed = await request(server).get(`/print/treasury_voucher/${expense.body.id}`).set(...authHeader(owner)).expect(200);
    expect(printed.body.document.title).toBe('سند صرف');
    expect(printed.body.document.totals.amountInWords).toContain('ثلاثمائة');

    // A treasury with movements can't be deleted.
    await request(server).delete(`/treasuries/${cash.body.id}`).set(...authHeader(owner)).expect(422);

    // Accounting (enabled for this tenant) posted every voucher, the cancellation and the opening balance.
    for (const id of [expense.body.id, other.body.id, transfer.body.id, cash.body.id]) await waitForProcessed(id);
    const refs = await db
      .selectFrom('journal_entries')
      .select(['source_reference_type', 'source_reference_id'])
      .where('source_reference_type', 'like', 'treasury%')
      .execute();
    const types = (id: string) => refs.filter((r) => r.source_reference_id === id).map((r) => r.source_reference_type).sort();
    expect(types(expense.body.id)).toEqual(['treasury_voucher']);
    expect(types(transfer.body.id)).toEqual(['treasury_voucher']);
    expect(types(other.body.id)).toEqual(['treasury_voucher', 'treasury_voucher_cancellation']);
    expect(refs.some((r) => r.source_reference_type === 'treasury_opening_balance')).toBe(true);
  });

  it('a user without treasury permissions is refused', async () => {
    const limited = await loginAs(app, schema(), E2E_LIMITED_EMAIL, E2E_LIMITED_PASSWORD);
    await request(app.getHttpServer()).get('/treasuries').set(...authHeader(limited)).expect(403);
    await request(app.getHttpServer())
      .post('/treasury-vouchers')
      .set(...authHeader(limited))
      .send({ kind: 'income', voucherDate: '2026-03-02', treasuryId: '00000000-0000-0000-0000-000000000000', categoryId: '00000000-0000-0000-0000-000000000000', amountMinorUnits: '1' })
      .expect(403);
  });
});
