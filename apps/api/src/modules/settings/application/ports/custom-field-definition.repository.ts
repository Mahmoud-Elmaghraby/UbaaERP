import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CreateCustomFieldDefinitionInput,
  CustomFieldDefinition,
  UpdateCustomFieldDefinitionInput,
} from '../../domain/custom-field-definition.entity';

export interface CustomFieldDefinitionRepository {
  listByEntityType(db: Kysely<TenantDatabase>, entityType: string): Promise<CustomFieldDefinition[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<CustomFieldDefinition | null>;
  create(
    db: Kysely<TenantDatabase>,
    input: CreateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateCustomFieldDefinitionInput,
  ): Promise<CustomFieldDefinition | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const CUSTOM_FIELD_DEFINITION_REPOSITORY = Symbol('CUSTOM_FIELD_DEFINITION_REPOSITORY');
