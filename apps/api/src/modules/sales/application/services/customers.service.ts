import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../domain/customer.entity';
import { ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';

@Injectable()
export class CustomersService {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repository: CustomerRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<Customer[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Customer> {
    const customer = await this.repository.findById(db, id);
    if (!customer) throw new NotFoundError(`Customer "${id}" not found.`);
    return customer;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCustomerInput): Promise<Customer> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A customer with code "${input.code}" already exists.`);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateCustomerInput): Promise<Customer> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw new NotFoundError(`Customer "${id}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A customer with code "${input.code}" already exists.`);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Customer "${id}" not found.`);
  }
}
