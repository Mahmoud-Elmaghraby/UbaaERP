import { Injectable } from '@nestjs/common';
import type { DocumentShareLinkDto, PrintResponseDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { NotFoundError } from '../errors/domain-errors';
import {
  DEFAULT_SHARE_TTL_SECONDS,
  shareSigningKey,
  signDocumentShareToken,
  verifyDocumentShareToken,
  type ShareableDocumentType,
} from './document-share-token';
import { PrintService } from './print.service';

/**
 * Public share links for documents (WhatsApp share). The caller (a module's
 * authenticated, permission-guarded endpoint) checks the document exists and
 * may be shared; this service only signs and resolves the link.
 */
@Injectable()
export class DocumentShareService {
  constructor(
    private readonly print: PrintService,
    private readonly connections: TenantConnectionManager,
  ) {}

  createLink(schema: string, documentType: ShareableDocumentType, documentId: string, requestOrigin?: string): DocumentShareLinkDto {
    const exp = Math.floor(Date.now() / 1000) + DEFAULT_SHARE_TTL_SECONDS;
    const token = signDocumentShareToken({ schema, documentType, documentId, exp }, shareSigningKey());
    return {
      url: `${webBaseUrl(requestOrigin)}/share/${token}`,
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** The document's print data for a genuine, unexpired token. */
  async resolve(token: string): Promise<PrintResponseDto> {
    const payload = verifyDocumentShareToken(token, shareSigningKey());
    if (!payload) throw invalidLink();
    const db = this.connections.getClient(payload.schema);
    try {
      return await this.print.renderAuthorized(db, payload.documentType, payload.documentId);
    } catch {
      // Deleted document, dropped tenant… — same answer as a bad token, no detail leaked.
      throw invalidLink();
    }
  }
}

function invalidLink(): NotFoundError {
  return new NotFoundError('Invalid or expired share link.', { code: 'DOCUMENT_SHARE.INVALID_LINK' });
}

/**
 * Where the web app is served: WEB_PUBLIC_URL; otherwise the request's
 * Origin when it is allowed by CORS_ORIGIN (or CORS is open, dev);
 * otherwise the first CORS_ORIGIN entry; last resort localhost (dev).
 */
export function webBaseUrl(requestOrigin: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const trim = (url: string) => url.trim().replace(/\/+$/, '');
  if (env.WEB_PUBLIC_URL) return trim(env.WEB_PUBLIC_URL);
  const allowed = env.CORS_ORIGIN?.split(',').map(trim).filter(Boolean) ?? [];
  const origin = requestOrigin && /^https?:\/\/[^\s/]+$/.test(trim(requestOrigin)) ? trim(requestOrigin) : undefined;
  if (origin && (allowed.length === 0 || allowed.includes(origin))) return origin;
  return allowed[0] ?? 'http://localhost:5173';
}
