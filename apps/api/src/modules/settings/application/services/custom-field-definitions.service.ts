import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  CUSTOM_FIELD_DEFINITION_REPOSITORY,
  type CustomFieldDefinitionRepository,
} from '../ports/custom-field-definition.repository';
import type {
  CreateCustomFieldDefinitionInput,
  CustomFieldDefinition,
  UpdateCustomFieldDefinitionInput,
} from '../../domain/custom-field-definition.entity';
import { ConflictError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Backend half of CLAUDE.md §7 (custom fields). This module only defines
 * and stores field metadata — the dynamic form engine (frontend, later)
 * reads it and renders inputs. Storing definitions without that frontend
 * piece is explicitly an incomplete implementation of §7, not a finished
 * partial version of it (§7's own wording) — flagged here, not silently
 * treated as "done".
 */
@Injectable()
export class CustomFieldDefinitionsService {
  constructor(
    @Inject(CUSTOM_FIELD_DEFINITION_REPOSITORY)
    private readonly repository: CustomFieldDefinitionRepository,
  ) {}

  listByEntityType(db: Kysely<TenantDatabase>, entityType: string): Promise<CustomFieldDefinition[]> {
    return this.repository.listByEntityType(db, entityType);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<CustomFieldDefinition> {
    const definition = await this.repository.findById(db, id);
    if (!definition) throw entityNotFound('CUSTOM_FIELD_DEFINITION', id);
    return definition;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          `A custom field "${input.fieldKey}" already exists for entity type "${input.entityType}".`,
          {
            code: 'CUSTOM_FIELD_DEFINITION.DUPLICATE_FIELD_KEY',
            params: { fieldKey: input.fieldKey, entityType: input.entityType },
          },
        );
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    const updated = await this.repository.update(db, id, input);
    if (!updated) throw entityNotFound('CUSTOM_FIELD_DEFINITION', id);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('CUSTOM_FIELD_DEFINITION', id);
  }
}
