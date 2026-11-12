/**
 * Upgrade rehearsal (clothing client, 2026-11-10): a tenant at the version installed on 2026-10-15
 * (migrations up to 0101_variant_prices), filled like the client's (categories, a model in
 * sizes × colours with own prices, stock in two warehouses, customers, a Jumia channel), then
 * upgraded to the latest migration. Checks that every row survives and the new features work.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { Pool } from 'pg';
import { createTenantKyselyClient } from '../../src/database/tenant/kysely-client';
import { loadTenantMigrations } from '../../src/database/tenant/load-migrations';
import { PriceListsService } from '../../src/modules/sales/application/services/price-lists.service';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { salePriceFloors } from '../../src/shared/catalog/sale-price-floor-reader';

const url = process.env.DATABASE_URL as string;
const schema = 'upgrade_rehearsal';
const INSTALLED = '0101_variant_prices';

const failures: string[] = [];
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function rehearse() {
  const pool = new Pool({ connectionString: url });
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`);
  await pool.end();
  const db = createTenantKyselyClient(url, schema);
  const all = loadTenantMigrations();
  const cut = all.findIndex((m) => m.name === INSTALLED);
  if (cut < 0) throw new Error('installed migration not found');
  for (const m of all.slice(0, cut + 1)) await m.up(db);

  // ---- The client's data, as the old version stored it ----
  const run = (q: string) => sql.raw(q).execute(db);
  const unit = (await sql<{ id: string }>`SELECT id FROM units_of_measure ORDER BY created_at LIMIT 1`.execute(db)).rows[0]!.id;
  const cat = randomUUID();
  await run(`INSERT INTO product_categories (id, name) VALUES ('${cat}', 'قمصان')`);
  const product = randomUUID();
  await run(`INSERT INTO products (id, code, name, unit_of_measure_id, tracking_type, is_active, track_variants, category_id, sale_price_amount, sale_price_currency, purchase_price_amount, purchase_price_currency)
             VALUES ('${product}', 'SH-1', 'قميص كتان', '${unit}', 'none', true, true, '${cat}', 30000, 'EGP', 15000, 'EGP')`);
  const variants: string[] = [];
  for (const size of ['M', 'L', 'XL']) {
    for (const color of ['أبيض', 'أزرق']) {
      const id = randomUUID();
      variants.push(id);
      const own = size === 'XL' ? `32000, 'EGP'` : 'NULL, NULL';
      await run(`INSERT INTO product_variants (id, product_id, sku, attribute_values, barcode, is_active, sale_price_amount, sale_price_currency)
                 VALUES ('${id}', '${product}', 'SH-1-${size}-${variants.length}', '{"المقاس":"${size}","اللون":"${color}"}', '62${String(variants.length).padStart(10, '0')}', true, ${own})`);
    }
  }
  const warehouses: string[] = [];
  for (const name of ['المخزن الرئيسي', 'المحل']) {
    const wh = randomUUID();
    const loc = randomUUID();
    warehouses.push(wh);
    await run(`INSERT INTO warehouses (id, name, code, is_active) VALUES ('${wh}', '${name}', 'W${warehouses.length}', true)`);
    await run(`INSERT INTO warehouse_locations (id, warehouse_id, code, name, is_active) VALUES ('${loc}', '${wh}', 'DEFAULT', 'Default', true)`);
    for (const v of variants) {
      await run(`INSERT INTO stock_levels (id, product_variant_id, warehouse_id, location_id, quantity_on_hand, average_cost_amount, average_cost_currency, inventory_value_amount)
                 VALUES ('${randomUUID()}', '${v}', '${wh}', '${loc}', 10, 15000, 'EGP', 150000)`);
    }
  }
  const customers: string[] = [];
  for (const name of ['جوميا', 'عميل جملة']) {
    const id = randomUUID();
    customers.push(id);
    await run(`INSERT INTO customers (id, code, name, default_currency) VALUES ('${id}', 'C${customers.length}', '${name}', 'EGP')`);
  }
  const treasury = (await sql<{ id: string }>`SELECT id FROM treasuries ORDER BY created_at LIMIT 1`.execute(db)).rows[0]?.id;
  await run(`INSERT INTO sales_channels (id, code, name, kind, customer_id, treasury_id) VALUES ('${randomUUID()}', 'JUMIA', 'جوميا', 'marketplace', '${customers[0]}', '${treasury}')`);

  const before = async () => ({
    products: Number((await sql<{ n: number }>`SELECT count(*)::int n FROM products`.execute(db)).rows[0]!.n),
    variants: Number((await sql<{ n: number }>`SELECT count(*)::int n FROM product_variants`.execute(db)).rows[0]!.n),
    stock: (await sql<{ q: string }>`SELECT sum(quantity_on_hand)::text q FROM stock_levels`.execute(db)).rows[0]!.q,
    value: (await sql<{ v: string }>`SELECT sum(inventory_value_amount)::text v FROM stock_levels`.execute(db)).rows[0]!.v,
    customers: Number((await sql<{ n: number }>`SELECT count(*)::int n FROM customers`.execute(db)).rows[0]!.n),
    xlPrice: (await sql<{ p: string }>`SELECT sale_price_amount::text p FROM product_variants WHERE sku LIKE 'SH-1-XL%' LIMIT 1`.execute(db)).rows[0]!.p,
    barcodes: Number((await sql<{ n: number }>`SELECT count(barcode)::int n FROM product_variants`.execute(db)).rows[0]!.n),
  });
  const old = await before();

  // ---- The upgrade: exactly what the app runs on start ----
  const pending = all.slice(cut + 1);
  for (const m of pending) await m.up(db);

  const now = await before();
  for (const key of Object.keys(old) as (keyof typeof old)[]) check(`kept ${key}`, String(old[key]) === String(now[key]), `${old[key]} → ${now[key]}`);

  // ---- Activity switches: what the client used stays on, the rest starts off ----
  const toggles = new Map(
    (await sql<{ feature_key: string; enabled: boolean }>`SELECT feature_key, enabled FROM tenant_feature_toggles`.execute(db)).rows.map((r) => [r.feature_key, r.enabled]),
  );
  check('marketplaces stay on (a channel exists)', toggles.get('sales.channels') !== false);
  check('POS switched off until used (no shift yet)', toggles.get('pos') === false, 'turn on from Settings › Modules');

  // ---- New features on the upgraded data ----
  const settings = new AppSettingsRepository();
  check('settings at defaults', (await settings.get(db, 'sales.belowCostMode')) === 'allow' && (await settings.get(db, 'pos.cashRounding')) === 'none');
  const lists = new PriceListsService();
  const jumia = await lists.save(db, null, { name: 'جوميا', currency: 'EGP', adjustPercent: '15', items: [], categoryRules: [{ categoryId: cat, adjustPercent: '20' }] });
  check('price list with markup + category rule', jumia.adjustPercent === '15' && jumia.categoryAdjust[cat] === '20');
  await sql`UPDATE customers SET price_list_id = ${jumia.id} WHERE id = ${customers[0]!}`.execute(db);
  const floors = await salePriceFloors(db, variants);
  check('cost read for every variant', [...floors.values()].every((f) => f.costMinor === 15000n), `${floors.size} variants`);
  const minCol = (await sql<{ n: number }>`SELECT count(*)::int n FROM products WHERE min_sale_price_amount IS NULL`.execute(db)).rows[0]!.n;
  check('new product columns empty (no behaviour change)', Number(minCol) === now.products);

  // ---- HR module (0123–0128): off until switched on, defaults in place, nothing else touched ----
  check('HR switched off for an upgraded tenant', toggles.get('hr') === false, 'turn on from Settings › Modules');
  const hr = (
    await sql<{ shifts: number; leave_types: number; employees: number; runs: number }>`
      SELECT (SELECT count(*)::int FROM hr_shifts WHERE is_default) shifts,
             (SELECT count(*)::int FROM hr_leave_types) leave_types,
             (SELECT count(*)::int FROM employees) employees,
             (SELECT count(*)::int FROM hr_payroll_runs) runs
    `.execute(db)
  ).rows[0]!;
  check('HR defaults seeded (one default shift, four leave types), no data invented', hr.shifts === 1 && hr.leave_types === 4 && hr.employees === 0 && hr.runs === 0, JSON.stringify(hr));

  await db.destroy();
  const cleanup = new Pool({ connectionString: url });
  await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
  await cleanup.end();
}
describe('Upgrade from the clothing client\'s installed version (integration, real Postgres)', () => {
  it('keeps every row and turns on the new features without changing behaviour', async () => {
    await rehearse();
    expect(failures).toEqual([]);
  }, 120_000);
});
