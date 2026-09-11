import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../ports/supplier.repository';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '../../domain/supplier.entity';
import { isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class SuppliersService {
  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly repository: SupplierRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<Supplier[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Supplier> {
    const supplier = await this.repository.findById(db, id);
    if (!supplier) throw entityNotFound('SUPPLIER', id);
    return supplier;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSupplierInput): Promise<Supplier> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('SUPPLIER', 'code', input.code);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateSupplierInput): Promise<Supplier> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw entityNotFound('SUPPLIER', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('SUPPLIER', 'code', input.code);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('SUPPLIER', id);
  }
}
