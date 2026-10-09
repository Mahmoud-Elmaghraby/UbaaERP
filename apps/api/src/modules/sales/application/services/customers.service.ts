import { Inject, Injectable } from '@nestjs/common';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from '../../domain/customer.entity';
import { BusinessRuleError, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly repository: CustomerRepository,
    private readonly numbering: NumberingSequencesService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Customer[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Customer> {
    const customer = await this.repository.findById(db, id);
    if (!customer) throw entityNotFound('CUSTOMER', id);
    return customer;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCustomerInput): Promise<Customer> {
    // An empty code takes the next 'customer' number (Settings › Numbering).
    const code =
      input.code?.trim() ||
      (await this.numbering.allocateCode(db, 'customer', async (candidate) =>
        Boolean(await db.selectFrom('customers').select('id').where('code', '=', candidate).executeTakeFirst()),
      ));
    try {
      return await this.repository.create(db, { ...input, code });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('CUSTOMER', 'code', input.code);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateCustomerInput): Promise<Customer> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw entityNotFound('CUSTOMER', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('CUSTOMER', 'code', input.code);
      }
      throw err;
    }
  }

  /** The system-default Walk-in Customer (POS feature Stage 2) can never be deleted — see its own field comment on Customer. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.getById(db, id);
    if (existing.isSystemDefault) {
      throw new BusinessRuleError(
        `Customer "${existing.name}" is the system-default Walk-in Customer and cannot be deleted.`,
        { code: 'CUSTOMER.CANNOT_DELETE_SYSTEM_DEFAULT', params: { name: existing.name } },
      );
    }
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('CUSTOMER', id);
  }
}
