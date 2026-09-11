import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type {
  CustomFieldDefinitionsTable,
  TenantDatabase,
} from '../../../../database/tenant/kysely-client';
import type { CustomFieldDefinitionRepository } from '../../application/ports/custom-field-definition.repository';
import type {
  CreateCustomFieldDefinitionInput,
  CustomFieldDefinition,
  CustomFieldType,
  UpdateCustomFieldDefinitionInput,
} from '../../domain/custom-field-definition.entity';

function toDomain(row: Selectable<CustomFieldDefinitionsTable>): CustomFieldDefinition {
  return {
    id: row.id,
    entityType: row.entity_type,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type as CustomFieldType,
    options: (row.options as string[] | null) ?? null,
    isRequired: row.is_required,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyCustomFieldDefinitionRepository implements CustomFieldDefinitionRepository {
  async listByEntityType(
    db: Kysely<TenantDatabase>,
    entityType: string,
  ): Promise<CustomFieldDefinition[]> {
    const rows = await db
      .selectFrom('custom_field_definitions')
      .selectAll()
      .where('entity_type', '=', entityType)
      .orderBy('display_order')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<CustomFieldDefinition | null> {
    const row = await db
      .selectFrom('custom_field_definitions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition> {
    const row = await db
      .insertInto('custom_field_definitions')
      .values({
        id: randomUUID(),
        entity_type: input.entityType,
        field_key: input.fieldKey,
        label: input.label,
        field_type: input.fieldType,
        options: input.options ? JSON.stringify(input.options) : null,
        is_required: input.isRequired ?? false,
        display_order: input.displayOrder ?? 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition | null> {
    const row = await db
      .updateTable('custom_field_definitions')
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.fieldType !== undefined ? { field_type: input.fieldType } : {}),
        ...(input.options !== undefined
          ? { options: input.options ? JSON.stringify(input.options) : null }
          : {}),
        ...(input.isRequired !== undefined ? { is_required: input.isRequired } : {}),
        ...(input.displayOrder !== undefined ? { display_order: input.displayOrder } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db
      .deleteFrom('custom_field_definitions')
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
