import type { Kysely } from 'kysely';
import type { PaperSizeDto, PrintDocumentDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/** What a provider fills; the print service adds the company header. */
export type PrintDocumentBody = Omit<PrintDocumentDto, 'company' | 'documentType' | 'paperSizes'>;

/**
 * One printable document type. Each module registers providers for its own
 * documents with PrintRegistry (on module init) — the print service, the
 * endpoint and the layouts never need to change for a new document.
 */
export interface PrintProvider {
  documentType: string;
  /** Arabic name for Settings › print templates. */
  label: string;
  paperSizes: PaperSizeDto[];
  /** The user needs ANY of these to print it (the same as opening the document). */
  permissions: string[];
  build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody>;
}
