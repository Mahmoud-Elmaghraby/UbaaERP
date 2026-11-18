import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { assertStockDocumentDate } from './stock-document-date';
import { localIsoDate } from './local-date';

/** A Kysely stand-in whose accounting_periods lookup returns `period`. */
function dbWithPeriod(period: { name: string; status: string } | undefined) {
  const query = {
    select: () => query,
    where: () => query,
    executeTakeFirst: async () => period,
  };
  return { selectFrom: () => query } as unknown as Kysely<TenantDatabase>;
}

describe('assertStockDocumentDate', () => {
  it('accepts a past date in an open period', async () => {
    await expect(assertStockDocumentDate(dbWithPeriod({ name: 'سبتمبر', status: 'open' }), '2026-09-05')).resolves.toBeUndefined();
  });

  it('accepts a date no period covers (accounting not set up)', async () => {
    await expect(assertStockDocumentDate(dbWithPeriod(undefined), '2020-01-01')).resolves.toBeUndefined();
  });

  it('treats a missing date as today', async () => {
    await expect(assertStockDocumentDate(dbWithPeriod(undefined), null)).resolves.toBeUndefined();
  });

  it('refuses a future date', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await expect(assertStockDocumentDate(dbWithPeriod(undefined), localIsoDate(tomorrow))).rejects.toMatchObject({
      code: 'DOCUMENT_DATE.IN_FUTURE',
    });
  });

  it('refuses a date inside a closed period', async () => {
    await expect(
      assertStockDocumentDate(dbWithPeriod({ name: 'سبتمبر 2026', status: 'closed' }), '2026-09-05'),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DATE.PERIOD_CLOSED', params: { name: 'سبتمبر 2026', date: '2026-09-05' } });
  });
});
