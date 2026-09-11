import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { DocumentTemplatesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DocumentTemplateRepository } from '../../application/ports/document-template.repository';
import type {
  CreateDocumentTemplateInput,
  DocumentTemplate,
  UpdateDocumentTemplateInput,
} from '../../domain/document-template.entity';

function toDomain(row: Selectable<DocumentTemplatesTable>): DocumentTemplate {
  return {
    id: row.id,
    documentType: row.document_type,
    name: row.name,
    content: row.content,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyDocumentTemplateRepository implements DocumentTemplateRepository {
  async list(db: Kysely<TenantDatabase>): Promise<DocumentTemplate[]> {
    const rows = await db.selectFrom('document_templates').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<DocumentTemplate | null> {
    const row = await db
      .selectFrom('document_templates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateDocumentTemplateInput,
  ): Promise<DocumentTemplate> {
    // Enforcing "at most one default per document_type" is left to the
    // partial unique index (migration 0004): a second is_default=true
    // insert for the same document_type throws a unique-violation, which
    // the application service (not this repository) turns into a
    // friendly error. Repositories stay thin — no business rules here.
    const row = await db
      .insertInto('document_templates')
      .values({
        id: randomUUID(),
        document_type: input.documentType,
        name: input.name,
        content: input.content ?? '',
        is_default: input.isDefault ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateDocumentTemplateInput,
  ): Promise<DocumentTemplate | null> {
    const row = await db
      .updateTable('document_templates')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('document_templates').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
