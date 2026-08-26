import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  DOCUMENT_TEMPLATE_REPOSITORY,
  type DocumentTemplateRepository,
} from '../ports/document-template.repository';
import type {
  CreateDocumentTemplateInput,
  DocumentTemplate,
  UpdateDocumentTemplateInput,
} from '../../domain/document-template.entity';
import { ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';

@Injectable()
export class DocumentTemplatesService {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly repository: DocumentTemplateRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<DocumentTemplate[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<DocumentTemplate> {
    const template = await this.repository.findById(db, id);
    if (!template) throw new NotFoundError(`Document template "${id}" not found.`);
    return template;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateDocumentTemplateInput,
  ): Promise<DocumentTemplate> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          `A default template already exists for document type "${input.documentType}". ` +
            'Unset the current default before setting a new one.',
        );
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateDocumentTemplateInput,
  ): Promise<DocumentTemplate> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw new NotFoundError(`Document template "${id}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(
          'Another template is already the default for this document type.',
        );
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Document template "${id}" not found.`);
  }
}
