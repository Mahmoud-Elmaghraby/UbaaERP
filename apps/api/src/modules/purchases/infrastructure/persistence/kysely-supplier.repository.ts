import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SuppliersTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SupplierRepository } from '../../application/ports/supplier.repository';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '../../domain/supplier.entity';

function toDomain(row: Selectable<SuppliersTable>): Supplier {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxNumber: row.tax_number,
    withholdingTaxRuleId: row.withholding_tax_rule_id,
    defaultCurrency: row.default_currency,
    paymentTermsDays: row.payment_terms_days,
    notes: row.notes,
    isActive: row.is_active,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySupplierRepository implements SupplierRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Supplier[]> {
    const rows = await db.selectFrom('suppliers').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Supplier | null> {
    const row = await db.selectFrom('suppliers').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSupplierInput & { code: string }): Promise<Supplier> {
    const row = await db
      .insertInto('suppliers')
      .values({
        id: randomUUID(),
        name: input.name,
        code: input.code,
        contact_person: input.contactPerson ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        tax_number: input.taxNumber ?? null,
        withholding_tax_rule_id: input.withholdingTaxRuleId ?? null,
        default_currency: input.defaultCurrency,
        payment_terms_days: input.paymentTermsDays ?? null,
        notes: input.notes ?? null,
        is_active: input.isActive ?? true,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateSupplierInput): Promise<Supplier | null> {
    const row = await db
      .updateTable('suppliers')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.contactPerson !== undefined ? { contact_person: input.contactPerson } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.taxNumber !== undefined ? { tax_number: input.taxNumber } : {}),
        ...(input.withholdingTaxRuleId !== undefined ? { withholding_tax_rule_id: input.withholdingTaxRuleId } : {}),
        ...(input.defaultCurrency !== undefined ? { default_currency: input.defaultCurrency } : {}),
        ...(input.paymentTermsDays !== undefined ? { payment_terms_days: input.paymentTermsDays } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('suppliers').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
