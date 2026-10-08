import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { computeDocumentTaxes, documentTotals, toSnapshot } from '../../src/shared/taxes/document-taxes';
import { Money } from '@erp-platform/shared-kernel';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('Invoice taxes — rules, defaults and totals (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let vat14: string;
  let wht1: string;
  let tbl8: string;
  let salesOnly: string;

  async function rule(name: string, rate: number, kind: string, scope = 'both', isActive = true): Promise<string> {
    const id = randomUUID();
    await db
      .insertInto('tax_rules')
      .values({ id, name: `${name} ${uniqueSuffix()}`, rate: String(rate), kind, scope, is_active: isActive })
      .execute();
    return id;
  }

  async function product(taxRuleId: string | null): Promise<string> {
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
        code: `T-${suffix}`,
        name: `Taxed ${suffix}`,
        unit_of_measure_id: unitId,
        is_active: true,
        track_variants: false,
        tax_rule_id: taxRuleId,
      })
      .execute();
    const variantId = randomUUID();
    await db.insertInto('product_variants').values({ id: variantId, product_id: productId, sku: `TS-${suffix}`, is_active: true }).execute();
    return variantId;
  }

  beforeAll(async () => {
    db = openIntegrationDb();
    vat14 = await rule('VAT', 14, 'vat');
    wht1 = await rule('WHT', 1, 'withholding');
    tbl8 = await rule('Table', 8, 'table');
    salesOnly = await rule('Sales-only VAT', 5, 'vat', 'sales');
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('migration 0091 seeded the Egyptian rules with kinds and ETA codes', async () => {
    const seeded = await db.selectFrom('tax_rules').select(['kind', 'eta_type', 'eta_subtype', 'rate']).execute();
    expect(seeded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'vat', eta_type: 'T1', eta_subtype: 'V009' }),
        expect.objectContaining({ kind: 'withholding', eta_type: 'T4', eta_subtype: 'W010' }),
      ]),
    );
  });

  it('defaults: the product VAT rule plus the party withholding; [] means untaxed', async () => {
    const taxed = await product(vat14);
    const untaxedProduct = await product(null);
    const [a, b, c] = await computeDocumentTaxes(db, {
      scope: 'sales',
      partyWithholdingRuleId: wht1,
      lines: [
        { productVariantId: taxed, amountMinor: 100_000n },
        { productVariantId: untaxedProduct, amountMinor: 50_000n },
        { productVariantId: taxed, amountMinor: 10_000n, taxRuleIds: [] },
      ],
    });
    expect(a).toMatchObject({ net: 100_000n, vat: 14_000n, withholding: 1_000n, total: 113_000n });
    expect(b).toMatchObject({ net: 50_000n, vat: 0n, withholding: 500n, total: 49_500n });
    expect(c).toMatchObject({ net: 10_000n, total: 10_000n, taxes: [] });

    const totals = documentTotals(
      [a!, b!, c!].map((line) => ({ netAmount: Money.fromMinorUnits(line.net, 'EGP'), taxes: toSnapshot(line.taxes) })),
    );
    expect(totals.totalAmount.toMinorUnits()).toBe(172_500n);
    expect(totals.vatAmount.toMinorUnits()).toBe(14_000n);
    expect(totals.withholdingAmount.toMinorUnits()).toBe(1_500n);
  });

  it('table tax enters the VAT base; tax-inclusive prices keep the shelf price', async () => {
    const variant = await product(null);
    const [line] = await computeDocumentTaxes(db, {
      scope: 'sales',
      lines: [{ productVariantId: variant, amountMinor: 100_000n, taxRuleIds: [tbl8, vat14] }],
    });
    expect(line).toMatchObject({ table: 8_000n, vat: 15_120n, total: 123_120n });
    const [inclusive] = await computeDocumentTaxes(db, {
      scope: 'sales',
      pricesIncludeTax: true,
      lines: [{ productVariantId: variant, amountMinor: 11_400n, taxRuleIds: [vat14] }],
    });
    expect(inclusive).toMatchObject({ net: 10_000n, vat: 1_400n, total: 11_400n });
  });

  it('rejects an explicit rule from the other scope, an inactive rule, or two VATs on a line; skips a stale default', async () => {
    const variant = await product(salesOnly);
    await expect(
      computeDocumentTaxes(db, { scope: 'purchases', lines: [{ productVariantId: variant, amountMinor: 1n, taxRuleIds: [salesOnly] }] }),
    ).rejects.toMatchObject({ code: 'TAX.RULE_NOT_USABLE' });
    const inactive = await rule('Old', 10, 'vat', 'both', false);
    await expect(
      computeDocumentTaxes(db, { scope: 'sales', lines: [{ productVariantId: variant, amountMinor: 1n, taxRuleIds: [inactive] }] }),
    ).rejects.toMatchObject({ code: 'TAX.RULE_NOT_USABLE' });
    await expect(
      computeDocumentTaxes(db, {
        scope: 'sales',
        lines: [{ productVariantId: variant, amountMinor: 1n, taxRuleIds: [vat14, salesOnly] }],
      }),
    ).rejects.toMatchObject({ code: 'TAX.DUPLICATE_KIND' });
    // The product's sales-only VAT is simply not applied on a purchase.
    const [purchaseLine] = await computeDocumentTaxes(db, {
      scope: 'purchases',
      lines: [{ productVariantId: variant, amountMinor: 10_000n }],
    });
    expect(purchaseLine).toMatchObject({ vat: 0n, total: 10_000n });
  });
});
