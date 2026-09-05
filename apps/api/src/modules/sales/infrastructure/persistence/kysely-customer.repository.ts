import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { CustomersTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CustomerRepository } from '../../application/ports/customer.repository';
import type { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerType } from '../../domain/customer.entity';

function toDomain(row: Selectable<CustomersTable>): Customer {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    customerType: row.customer_type as CustomerType,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxNumber: row.tax_number,
    defaultCurrency: row.default_currency,
    paymentTermsDays: row.payment_terms_days,
    notes: row.notes,
    isActive: row.is_active,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyCustomerRepository implements CustomerRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Customer[]> {
    const rows = await db.selectFrom('customers').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Customer | null> {
    const row = await db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCustomerInput): Promise<Customer> {
    const row = await db
      .insertInto('customers')
      .values({
        id: randomUUID(),
        name: input.name,
        code: input.code,
        customer_type: input.customerType ?? 'business',
        contact_person: input.contactPerson ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        tax_number: input.taxNumber ?? null,
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

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateCustomerInput): Promise<Customer | null> {
    const row = await db
      .updateTable('customers')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.customerType !== undefined ? { customer_type: input.customerType } : {}),
        ...(input.contactPerson !== undefined ? { contact_person: input.contactPerson } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.taxNumber !== undefined ? { tax_number: input.taxNumber } : {}),
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
    const result = await db.deleteFrom('customers').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
