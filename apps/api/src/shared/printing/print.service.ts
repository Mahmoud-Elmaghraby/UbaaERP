import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  printDocumentSchema,
  printTemplateConfigSchema,
  type PrintResponseDto,
  type PrintTemplateConfigDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { CompanyProfileService } from '../../modules/settings/application/services/company-profile.service';
import { PrintRegistry } from './print-registry';

/**
 * The central print service: resolves the document through its module's
 * provider, adds the company header and the tenant's template for that
 * document type (Settings › print templates, stored in document_templates).
 */
@Injectable()
export class PrintService {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly companyProfile: CompanyProfileService,
  ) {}

  async render(
    db: Kysely<TenantDatabase>,
    documentType: string,
    id: string,
    userPermissions: readonly string[],
    query: Record<string, string> = {},
  ): Promise<PrintResponseDto> {
    const provider = this.registry.get(documentType);
    if (!provider) throw new NotFoundException(`No printable document type "${documentType}".`);
    if (!provider.permissions.some((permission) => userPermissions.includes(permission))) {
      throw new ForbiddenException('You are not allowed to print this document.');
    }
    const [body, company, template] = await Promise.all([
      provider.build(db, id, { query }),
      this.companyProfile.get(db),
      this.template(db, documentType),
    ]);
    const paperSize = provider.paperSizes.includes(template.paperSize) ? template.paperSize : provider.paperSizes[0]!;
    return {
      document: printDocumentSchema.parse({
        ...body,
        documentType,
        paperSizes: provider.paperSizes,
        company: {
          name: company.companyName,
          address: company.address,
          taxRegistrationNumber: company.taxRegistrationNumber,
          commercialRegister: company.commercialRegister,
          phone: company.phone,
          email: company.email,
          website: company.website,
          logoUrl: company.logoUrl,
        },
      }),
      template: { ...template, paperSize },
    };
  }

  /** The default template of the type, or the built-in defaults. A malformed one falls back to defaults. */
  async template(db: Kysely<TenantDatabase>, documentType: string): Promise<PrintTemplateConfigDto> {
    const row = await db
      .selectFrom('document_templates')
      .select('content')
      .where('document_type', '=', documentType)
      .orderBy('is_default', 'desc')
      .orderBy('updated_at', 'desc')
      .executeTakeFirst();
    let stored: unknown = {};
    try {
      stored = row?.content ? JSON.parse(row.content) : {};
    } catch {
      stored = {};
    }
    const parsed = printTemplateConfigSchema.safeParse(stored);
    return parsed.success ? parsed.data : printTemplateConfigSchema.parse({});
  }
}
