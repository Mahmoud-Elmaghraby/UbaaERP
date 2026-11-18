import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { assertStockDocumentDate } from './stock-document-date';
import { localIsoDate } from './local-date';

/** A Kysely stand-in: accounting_periods returns `period`; app_settings returns 'documents.allowFutureDates'. */
function dbWithPeriod(period: { name: string; status: string } | undefined, allowFutureDates?: boolean) {
  const query = (row: unknown) => {
    const q = { select: () => q, where: () => q, executeTakeFirst: async () => row };
    return q;
  };
  return {
    selectFrom: (table: string) =>
      table === 'app_settings' ? query(allowFutureDates === undefined ? undefined : { value: allowFutureDates }) : query(period),
  } as unknown as Kysely<TenantDatabase>;
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

  it('refuses a future date when the settings forbid future-dated documents', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await expect(assertStockDocumentDate(dbWithPeriod(undefined, false), localIsoDate(tomorrow))).rejects.toMatchObject({
      code: 'DOCUMENT_DATE.IN_FUTURE',
    });
  });

  it('accepts a future date when the settings allow future-dated documents (the default)', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await expect(assertStockDocumentDate(dbWithPeriod(undefined, true), localIsoDate(tomorrow))).resolves.toBeUndefined();
    await expect(assertStockDocumentDate(dbWithPeriod(undefined), localIsoDate(tomorrow))).resolves.toBeUndefined();
  });

  it('refuses a date inside a closed period', async () => {
    await expect(
      assertStockDocumentDate(dbWithPeriod({ name: 'سبتمبر 2026', status: 'closed' }), '2026-09-05'),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DATE.PERIOD_CLOSED', params: { name: 'سبتمبر 2026', date: '2026-09-05' } });
  });
});
