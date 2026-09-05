import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RfqSupplierRepository } from '../../application/ports/rfq-supplier.repository';

export class KyselyRfqSupplierRepository implements RfqSupplierRepository {
  async listSupplierIdsByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<string[]> {
    const rows = await db
      .selectFrom('rfq_suppliers')
      .select('supplier_id')
      .where('rfq_id', '=', rfqId)
      .execute();
    return rows.map((r) => r.supplier_id);
  }

  async add(db: Kysely<TenantDatabase>, rfqId: string, supplierId: string): Promise<void> {
    await db
      .insertInto('rfq_suppliers')
      .values({ id: randomUUID(), rfq_id: rfqId, supplier_id: supplierId })
      .execute();
  }

  async deleteByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<void> {
    await db.deleteFrom('rfq_suppliers').where('rfq_id', '=', rfqId).execute();
  }
}
