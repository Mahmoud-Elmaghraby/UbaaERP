import { createHmac } from 'node:crypto';
import {
  shareSigningKey,
  signDocumentShareToken,
  verifyDocumentShareToken,
  type DocumentSharePayload,
} from './document-share-token';

const key = Buffer.from('test-secret-at-least-16-chars');
const now = 1_800_000_000;
const payload: DocumentSharePayload = {
  schema: 'tenant_acme',
  documentType: 'sales_invoice',
  documentId: '0b5c1f3e-9a8d-4e2f-8b1a-1234567890ab',
  exp: now + 3600,
};

function tamper(token: string, change: (p: Record<string, unknown>) => void): string {
  const [encoded, sig] = token.split('.') as [string, string];
  const p = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
  change(p);
  return `${Buffer.from(JSON.stringify(p)).toString('base64url')}.${sig}`;
}

describe('document share tokens', () => {
  it('round-trips a valid token', () => {
    const token = signDocumentShareToken(payload, key);
    expect(verifyDocumentShareToken(token, key, now)).toEqual(payload);
  });

  it('rejects an expired token', () => {
    const token = signDocumentShareToken(payload, key);
    expect(verifyDocumentShareToken(token, key, payload.exp)).toBeNull();
  });

  it('rejects a token signed with another key', () => {
    const token = signDocumentShareToken(payload, Buffer.from('another-secret-of-16+'));
    expect(verifyDocumentShareToken(token, key, now)).toBeNull();
  });

  it('rejects a payload moved to another tenant, document or expiry', () => {
    const token = signDocumentShareToken(payload, key);
    expect(verifyDocumentShareToken(tamper(token, (p) => (p.schema = 'tenant_other')), key, now)).toBeNull();
    expect(verifyDocumentShareToken(tamper(token, (p) => (p.documentId = '11111111-1111-4111-8111-111111111111')), key, now)).toBeNull();
    expect(verifyDocumentShareToken(tamper(token, (p) => (p.exp = now + 999_999)), key, now)).toBeNull();
  });

  it('rejects document types that are not shareable, even when correctly signed', () => {
    const encoded = Buffer.from(JSON.stringify({ ...payload, documentType: 'journal_entry' })).toString('base64url');
    const sig = createHmac('sha256', key).update(`erp.document-share.v1.${encoded}`).digest('base64url');
    expect(verifyDocumentShareToken(`${encoded}.${sig}`, key, now)).toBeNull();
    expect(() => signDocumentShareToken({ ...payload, documentType: 'journal_entry' as never }, key)).toThrow();
  });

  it('rejects malformed tokens without throwing', () => {
    for (const bad of ['', 'abc', 'a.b.c', '.', 'x'.repeat(2000), `${'e30'}.${'z'.repeat(43)}`]) {
      expect(verifyDocumentShareToken(bad, key, now)).toBeNull();
    }
  });

  it('derives a key from the JWT secret unless a dedicated secret is set', () => {
    const derived = shareSigningKey({ JWT_ACCESS_SECRET: 'jwt-secret-0123456789' });
    expect(derived.equals(Buffer.from('jwt-secret-0123456789'))).toBe(false);
    expect(shareSigningKey({ DOCUMENT_SHARE_SECRET: 'dedicated-secret-1234', JWT_ACCESS_SECRET: 'x' }).toString()).toBe('dedicated-secret-1234');
    expect(() => shareSigningKey({})).toThrow();
  });
});
