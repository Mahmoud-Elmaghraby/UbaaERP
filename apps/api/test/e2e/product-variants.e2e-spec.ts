import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './app';
import { authHeader, loginAs, type LoggedInSession } from './auth-helpers';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from './global-setup';

/** One-step product with sizes × colours (no SKU, no unit typed) and per-variant prices (migrations 0097, 0101). */
describe('Product options and variant prices (e2e)', () => {
  let app: INestApplication;
  let owner: LoggedInSession;
  const schema = () => process.env.TEST_E2E_TENANT_SCHEMA as string;

  beforeAll(async () => {
    app = await createE2eApp();
    owner = await loginAs(app, schema(), E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates every combination, prices XXL on its own and lets the rest follow the product price', async () => {
    const server = app.getHttpServer();
    const auth = authHeader(owner);
    const s = Date.now().toString().slice(-6);
    const egp = (minor: string) => ({ amountMinorUnits: minor, currency: 'EGP' });

    const created = await request(server)
      .post('/products')
      .set(...auth)
      .send({
        code: `TEE-${s}`,
        name: 'تيشيرت',
        salePrice: egp('25000'),
        variantOptions: { المقاس: ['M', 'XXL'], اللون: ['أسود'] },
        variantPrices: [{ attributeValues: { المقاس: 'XXL', اللون: 'أسود' }, salePrice: egp('30000') }],
      })
      .expect(201);
    expect(created.body.unitOfMeasureId).toBeTruthy();
    expect(created.body.variants).toHaveLength(2);
    const xxl = created.body.variants.find((v: { attributeValues: Record<string, string> }) => v.attributeValues['المقاس'] === 'XXL');
    const m = created.body.variants.find((v: { attributeValues: Record<string, string> }) => v.attributeValues['المقاس'] === 'M');
    expect(xxl.salePrice.amountMinorUnits).toBe('30000');
    expect(m.salePrice).toBeNull();

    // Documents read the variant's price first, else the product's.
    const lookup = await request(server).get('/product-variants').set(...auth).expect(200);
    const price = (id: string) => lookup.body.find((v: { id: string }) => v.id === id)?.salePrice?.amountMinorUnits;
    expect(price(xxl.id)).toBe('30000');
    expect(price(m.id)).toBe('25000');

    // Back to the product price.
    await request(server).patch(`/products/${created.body.id}/variants/${xxl.id}`).set(...auth).send({ salePrice: null }).expect(200);
    const after = await request(server).get('/product-variants').set(...auth).expect(200);
    expect(after.body.find((v: { id: string }) => v.id === xxl.id).salePrice.amountMinorUnits).toBe('25000');
  });
});
