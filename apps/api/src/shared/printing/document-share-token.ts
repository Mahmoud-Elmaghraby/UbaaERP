import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed links to view/print one document without logging in
 * (WhatsApp share). Token = base64url(JSON payload) "." base64url(HMAC-SHA256).
 *
 * The payload carries the tenant schema, so a token only ever opens a
 * document of the tenant that issued it and cannot be edited to point at
 * another tenant or document (the signature covers it). Only the types in
 * SHAREABLE_DOCUMENT_TYPES are accepted when issuing AND when verifying.
 * The payload is readable (not encrypted): it reveals the schema name and
 * the document id, nothing else.
 */

export const SHAREABLE_DOCUMENT_TYPES = ['sales_invoice', 'payment_received'] as const;
export type ShareableDocumentType = (typeof SHAREABLE_DOCUMENT_TYPES)[number];

export const DEFAULT_SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface DocumentSharePayload {
  schema: string;
  documentType: ShareableDocumentType;
  documentId: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

/** Domain separation: this key/purpose signs nothing but share links. */
const PURPOSE = 'erp.document-share.v1';
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signing key: DOCUMENT_SHARE_SECRET when set, otherwise derived from
 * the JWT secret (HMAC with a fixed label), so the raw JWT key itself never
 * signs share links.
 */
export function shareSigningKey(env: { DOCUMENT_SHARE_SECRET?: string; JWT_ACCESS_SECRET?: string } = process.env): Buffer {
  const dedicated = env.DOCUMENT_SHARE_SECRET;
  if (dedicated) return Buffer.from(dedicated, 'utf8');
  const jwt = env.JWT_ACCESS_SECRET;
  if (!jwt) throw new Error('DOCUMENT_SHARE_SECRET (or JWT_ACCESS_SECRET) is required to sign document share links.');
  return createHmac('sha256', jwt).update(PURPOSE).digest();
}

function signature(key: Buffer, encodedPayload: string): string {
  return createHmac('sha256', key).update(`${PURPOSE}.${encodedPayload}`).digest('base64url');
}

export function isShareableDocumentType(value: string): value is ShareableDocumentType {
  return (SHAREABLE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function signDocumentShareToken(payload: DocumentSharePayload, key: Buffer): string {
  if (!isShareableDocumentType(payload.documentType)) throw new Error(`Document type "${payload.documentType}" cannot be shared.`);
  if (!SCHEMA_NAME.test(payload.schema) || !UUID.test(payload.documentId)) throw new Error('Invalid share payload.');
  const encoded = Buffer.from(
    JSON.stringify({ schema: payload.schema, documentType: payload.documentType, documentId: payload.documentId, exp: payload.exp }),
    'utf8',
  ).toString('base64url');
  return `${encoded}.${signature(key, encoded)}`;
}

/** The payload of a genuine, unexpired token — null for anything else (never throws). */
export function verifyDocumentShareToken(token: string, key: Buffer, nowSeconds = Math.floor(Date.now() / 1000)): DocumentSharePayload | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, given] = parts as [string, string];
  const expected = Buffer.from(signature(key, encoded));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { schema, documentType, documentId, exp } = payload as Record<string, unknown>;
  if (typeof schema !== 'string' || !SCHEMA_NAME.test(schema)) return null;
  if (typeof documentType !== 'string' || !isShareableDocumentType(documentType)) return null;
  if (typeof documentId !== 'string' || !UUID.test(documentId)) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= nowSeconds) return null;
  return { schema, documentType, documentId, exp };
}
