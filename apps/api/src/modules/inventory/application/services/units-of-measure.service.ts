import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { UNIT_OF_MEASURE_REPOSITORY, type UnitOfMeasureRepository } from '../ports/unit-of-measure.repository';
import {
  convertUnitQuantity,
  type UnitOfMeasure,
  type CreateUnitOfMeasureInput,
  type UpdateUnitOfMeasureInput,
} from '../../domain/unit-of-measure.entity';
import { BusinessRuleError, ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';

@Injectable()
export class UnitsOfMeasureService {
  constructor(@Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly repository: UnitOfMeasureRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<UnitOfMeasure[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<UnitOfMeasure> {
    const unit = await this.repository.findById(db, id);
    if (!unit) throw new NotFoundError(`Unit of measure "${id}" not found.`);
    return unit;
  }

  /**
   * Base-unit chains are deliberately capped at one level: a unit may either
   * BE a base unit (baseUnitId === null) or convert against exactly one base
   * unit. This rejects attempts to point at a unit that is itself derived.
   */
  private async assertValidBaseUnit(
    db: Kysely<TenantDatabase>,
    baseUnitId: string,
    selfId?: string,
  ): Promise<void> {
    if (baseUnitId === selfId) {
      throw new BusinessRuleError('A unit of measure cannot be its own base unit.');
    }
    const baseUnit = await this.repository.findById(db, baseUnitId);
    if (!baseUnit) {
      throw new NotFoundError(`Unit of measure "${baseUnitId}" not found.`);
    }
    if (baseUnit.baseUnitId !== null) {
      throw new BusinessRuleError(
        `"${baseUnit.name}" is itself converted from another unit and cannot be used as a base unit (conversion chains are not supported).`,
      );
    }
  }

  async create(db: Kysely<TenantDatabase>, input: CreateUnitOfMeasureInput): Promise<UnitOfMeasure> {
    if (input.baseUnitId) {
      await this.assertValidBaseUnit(db, input.baseUnitId);
    }
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A unit of measure named "${input.name}" already exists.`);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateUnitOfMeasureInput): Promise<UnitOfMeasure> {
    if (input.baseUnitId) {
      await this.assertValidBaseUnit(db, input.baseUnitId, id);
    }
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw new NotFoundError(`Unit of measure "${id}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A unit of measure named "${input.name}" already exists.`);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Unit of measure "${id}" not found.`);
  }

  async convert(db: Kysely<TenantDatabase>, fromUnitId: string, toUnitId: string, quantity: number): Promise<number> {
    const [fromUnit, toUnit] = await Promise.all([this.getById(db, fromUnitId), this.getById(db, toUnitId)]);
    try {
      return convertUnitQuantity(fromUnit, toUnit, quantity);
    } catch (err) {
      throw new BusinessRuleError(err instanceof Error ? err.message : String(err));
    }
  }
}
