import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { AppSettingsService } from '../../src/modules/settings/application/services/app-settings.service';
import { Money } from '@erp-platform/shared-kernel';
import { salePriceFloors } from '../../src/shared/catalog/sale-price-floor-reader';
import { SalesLimitsService } from '../../src/modules/sales/application/services/sales-limits.service';
import type { FeatureAvailabilityService } from '../../src/shared/plans/feature-availability.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** The settings hub store (0119/0120), the activity-feature defaults (0118) and the sales price floors. */
describe('Settings hub (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const emit = jest.fn();
  const repo = new AppSettingsRepository();
  const ADMIN = ['settings.manage'];
  let service: AppSettingsService;

  beforeAll(() => {
    db = openIntegrationDb();
    service = new AppSettingsService(repo, { emit } as unknown as EventEmitter2);
  });

  afterAll(async () => {
    await db.deleteFrom('app_settings').execute();
    await db.destroy();
  });

  it('returns defaults, stores a change with an audit event, and resets back', async () => {
    const before = await service.list(db);
    expect(before.find((e) => e.key === 'security.lockoutMinutes')).toMatchObject({ value: 15, isDefault: true });

    await service.update(db, 'tenant_x', { 'security.lockoutMinutes': 30 }, '00000000-0000-0000-0000-000000000001', ADMIN);
    expect(await repo.get(db, 'security.lockoutMinutes')).toBe(30);
    expect(emit).toHaveBeenCalledWith(
      'settings.app_setting.updated',
      expect.objectContaining({ entityId: 'security.lockoutMinutes', metadata: expect.objectContaining({ from: 15, to: 30 }) }),
    );

    await service.update(db, 'tenant_x', { 'security.lockoutMinutes': { reset: true } }, '00000000-0000-0000-0000-000000000001', ADMIN);
    expect(await repo.get(db, 'security.lockoutMinutes')).toBe(15);
  });

  it('refuses unknown keys and out-of-range values without writing anything', async () => {
    await expect(service.update(db, 'x', { 'security.lockoutMinutes': 0 }, 'u', ADMIN)).rejects.toMatchObject({ code: 'APP_SETTING.INVALID' });
    await expect(service.update(db, 'x', { nope: 1 }, 'u', ADMIN)).rejects.toMatchObject({ code: 'APP_SETTING.UNKNOWN' });
    expect((await service.list(db)).every((e) => e.isDefault)).toBe(true);
  });

  it('stores "no limit" (null), decimals and text, and checks who may change each section', async () => {
    const u = '00000000-0000-0000-0000-000000000001';
    await service.update(db, 'x', { 'sales.maxDiscountPercent': 12.5, 'sales.defaultInvoiceNotes': 'شكراً لتعاملكم' }, u, ['sales.settings.manage']);
    expect(await repo.get(db, 'sales.maxDiscountPercent')).toBe(12.5);
    expect(await repo.get(db, 'sales.defaultInvoiceNotes')).toBe('شكراً لتعاملكم');
    await service.update(db, 'x', { 'sales.maxDiscountPercent': null }, u, ADMIN);
    expect(await repo.getMany(db, ['sales.maxDiscountPercent', 'sales.returnWindowDays'])).toEqual({
      'sales.maxDiscountPercent': null,
      'sales.returnWindowDays': null,
    });
    await expect(service.update(db, 'x', { 'sales.maxDiscountPercent': 12.345 }, u, ADMIN)).rejects.toMatchObject({ code: 'APP_SETTING.INVALID' });
    // A sales manager can't touch security or document dates.
    await expect(service.update(db, 'x', { 'documents.backdateDays': 3 }, u, ['sales.settings.manage'])).rejects.toMatchObject({ status: 403 });
    await db.deleteFrom('app_settings').execute();
  });

  it('reads price floors: average cost of the stock on hand, else the purchase price, and the minimum price', async () => {
    const suffix = uniqueSuffix();
    const unitId = randomUUID();
    await db.insertInto('units_of_measure').values({ id: unitId, name: `u-${suffix}`, symbol: `u${suffix}`, is_active: true, conversion_factor: '1' }).execute();
    const product = async (name: string, extra: Record<string, unknown>) => {
      const productId = randomUUID();
      const variantId = randomUUID();
      await db
        .insertInto('products')
        .values({ id: productId, code: `F-${name}-${suffix}`, name, unit_of_measure_id: unitId, tracking_type: 'none', is_active: true, track_variants: false, ...extra })
        .execute();
      await db.insertInto('product_variants').values({ id: variantId, product_id: productId, sku: `F-${name}-${suffix}`, is_active: true }).execute();
      return variantId;
    };
    const stocked = await product('stocked', { purchase_price_amount: '999', purchase_price_currency: 'EGP', min_sale_price_amount: '1500', min_sale_price_currency: 'EGP' });
    const unstocked = await product('unstocked', { purchase_price_amount: '800', purchase_price_currency: 'EGP' });
    const warehouseId = randomUUID();
    const locationA = randomUUID();
    const locationB = randomUUID();
    await db.insertInto('warehouses').values({ id: warehouseId, name: `F ${suffix}`, code: `F-${suffix}`, is_active: true }).execute();
    await db
      .insertInto('warehouse_locations')
      .values([
        { id: locationA, warehouse_id: warehouseId, code: 'A', name: 'A', is_active: true },
        { id: locationB, warehouse_id: warehouseId, code: 'B', name: 'B', is_active: true },
      ])
      .execute();
    // 10 at 10.00 and 30 at 12.00 → 11.50 average.
    await db
      .insertInto('stock_levels')
      .values([
        { id: randomUUID(), product_variant_id: stocked, warehouse_id: warehouseId, location_id: locationA, quantity_on_hand: '10', average_cost_amount: '1000', average_cost_currency: 'EGP', inventory_value_amount: '10000' },
        { id: randomUUID(), product_variant_id: stocked, warehouse_id: warehouseId, location_id: locationB, quantity_on_hand: '30', average_cost_amount: '1200', average_cost_currency: 'EGP', inventory_value_amount: '36000' },
      ] as never)
      .execute();
    const floors = await salePriceFloors(db, [stocked, unstocked]);
    expect(floors.get(stocked)).toMatchObject({ costMinor: 1150n, costCurrency: 'EGP', minMinor: 1500n, minCurrency: 'EGP' });
    expect(floors.get(unstocked)).toMatchObject({ costMinor: 800n, minMinor: null });

    // The limits on a document: 14.00 is above cost (11.50) but below the minimum (15.00).
    const limits = new SalesLimitsService(repo, { isEnabled: async () => true } as unknown as FeatureAvailabilityService);
    const doc = {
      schema: 'x',
      salesRepId: null,
      discountType: 'percentage' as const,
      discountPercentage: 10,
      lines: [{ id: 'l1', productVariantId: stocked, quantity: 1, unitPrice: Money.fromMinorUnits(1556n, 'EGP'), unitFactor: 1 }],
    };
    const off = await limits.check(db, doc, []);
    expect(off).toMatchObject({ blocked: false, needsConfirmation: false, violations: [], repMissing: false });

    await repo.set(db, 'sales.belowMinPriceMode', 'block', '00000000-0000-0000-0000-000000000001');
    await repo.set(db, 'sales.maxDiscountPercent', 5, '00000000-0000-0000-0000-000000000001');
    await repo.set(db, 'sales.repRequired', true, '00000000-0000-0000-0000-000000000001');
    const on = await limits.check(db, doc, []);
    expect(on).toMatchObject({ discountPercent: 10, discountExceeded: true, repMissing: true, blocked: true });
    expect(on.violations).toEqual([expect.objectContaining({ kind: 'below_min', unitNet: '14.00', floor: '15.00' })]);
    await expect(limits.assert(db, doc, ['sales.override_limits'])).rejects.toMatchObject({ code: 'SALES_LIMITS.REP_REQUIRED' });
    await expect(limits.assert(db, { ...doc, salesRepId: 'rep' }, [])).rejects.toMatchObject({ code: 'SALES_LIMITS.DISCOUNT_ABOVE_LIMIT' });
    await expect(limits.assert(db, { ...doc, salesRepId: 'rep' }, ['sales.override_limits'])).resolves.toBeUndefined();

    await repo.set(db, 'sales.returnWindowDays', 14, '00000000-0000-0000-0000-000000000001');
    await expect(limits.assertReturnWindow(db, '2026-01-01', '2026-01-15', false)).resolves.toBeUndefined();
    await expect(limits.assertReturnWindow(db, '2026-01-01', '2026-01-16', false)).rejects.toMatchObject({ code: 'SALES_LIMITS.RETURN_WINDOW_PASSED' });
    await expect(limits.assertReturnWindow(db, '2026-01-01', '2026-01-16', true)).resolves.toBeUndefined();
    await db.deleteFrom('app_settings').execute();
  });

  it('switched unused activity features off for a fresh tenant (migration 0118)', async () => {
    const rows = await db.selectFrom('tenant_feature_toggles').selectAll().execute();
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.feature_key));
    // Migrations ran on an empty schema, so every activity option starts off.
    for (const key of ['sales.channels', 'sales.installments', 'sales.reps', 'cheques', 'pos', 'inventory.landed_costs', 'fixed_assets', 'budgets']) {
      expect(off.has(key)).toBe(true);
    }
    // Core document-chain switches are untouched (no row = on).
    expect(off.has('sales.quotations')).toBe(false);
  });
});
