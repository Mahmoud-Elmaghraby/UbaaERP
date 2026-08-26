import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CreateDocumentTemplateInput,
  DocumentTemplate,
  UpdateDocumentTemplateInput,
} from '../../domain/document-template.entity';

export interface DocumentTemplateRepository {
  list(db: Kysely<TenantDatabase>): Promise<DocumentTemplate[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<DocumentTemplate | null>;
  create(
    db: Kysely<TenantDatabase>,
    input: CreateDocumentTemplateInput,
  ): Promise<DocumentTemplate>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateDocumentTemplateInput,
  ): Promise<DocumentTemplate | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const DOCUMENT_TEMPLATE_REPOSITORY = Symbol('DOCUMENT_TEMPLATE_REPOSITORY');
