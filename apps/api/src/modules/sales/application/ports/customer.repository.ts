import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../domain/customer.entity';

export interface CustomerRepository {
  list(db: Kysely<TenantDatabase>): Promise<Customer[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Customer | null>;
  create(db: Kysely<TenantDatabase>, input: CreateCustomerInput): Promise<Customer>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateCustomerInput): Promise<Customer | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
