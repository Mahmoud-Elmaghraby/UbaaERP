import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalObjectStorage } from './local-object-storage';

function parse(url: string) {
  const parsed = new URL(url, 'http://local');
  const key = parsed.pathname.replace(/^\/files\//, '').split('/').map(decodeURIComponent).join('/');
  return { key, expires: Number(parsed.searchParams.get('expires')), signature: parsed.searchParams.get('signature') ?? '' };
}

describe('LocalObjectStorage (desktop replacement for MinIO)', () => {
  const root = mkdtempSync(join(tmpdir(), 'erp-local-storage-'));
  const storage = new LocalObjectStorage({ rootDir: root, signingSecret: 'test-signing-secret-123456' });

  beforeAll(() => storage.onModuleInit());

  it('stores the object with its content type and serves it through a signed link', async () => {
    await storage.put({ key: 'tenant/logo one.png', body: Buffer.from('PNGDATA'), contentType: 'image/png' });
    const url = await storage.presignedGetUrl('tenant/logo one.png', { expirySeconds: 60 });
    expect(url.startsWith('/files/tenant/logo%20one.png?expires=')).toBe(true);

    const { key, expires, signature } = parse(url);
    const file = await storage.open(key, expires, signature);
    expect(file).not.toBeNull();
    expect(file!.meta.contentType).toBe('image/png');
    expect(readFileSync(file!.path, 'utf8')).toBe('PNGDATA');
  });

  it('rejects a tampered signature, another key, and an expired link', async () => {
    await storage.put({ key: 'a/doc.pdf', body: Buffer.from('x'), contentType: 'application/pdf' });
    const { key, expires, signature } = parse(await storage.presignedGetUrl('a/doc.pdf'));
    expect(await storage.open(key, expires, signature.replace(/.$/, (c) => (c === '0' ? '1' : '0')))).toBeNull();
    expect(await storage.open('a/other.pdf', expires, signature)).toBeNull();
    expect(await storage.open(key, expires + 1, signature)).toBeNull();
    expect(await storage.open(key, Math.floor(Date.now() / 1000) - 1, signature)).toBeNull();
  });

  it('keeps the URL stable within the requested window (browser caching)', async () => {
    const a = await storage.presignedGetUrl('tenant/logo one.png', { expirySeconds: 600, stableForSeconds: 3600 });
    const b = await storage.presignedGetUrl('tenant/logo one.png', { expirySeconds: 600, stableForSeconds: 3600 });
    expect(a).toBe(b);
  });

  it('refuses keys that escape the storage folder or hit metadata files', async () => {
    await expect(storage.put({ key: '../escape.txt', body: Buffer.from('x'), contentType: 'text/plain' })).rejects.toThrow();
    await expect(storage.presignedGetUrl('a/../../etc/passwd')).rejects.toThrow();
    await expect(storage.presignedGetUrl('a/doc.pdf.meta.json')).rejects.toThrow();
    expect(await storage.open('../../etc/passwd', 9_999_999_999, 'x')).toBeNull();
  });

  it('deletes the object and its metadata', async () => {
    await storage.put({ key: 'tmp/x.txt', body: Buffer.from('x'), contentType: 'text/plain' });
    const link = parse(await storage.presignedGetUrl('tmp/x.txt'));
    await storage.delete('tmp/x.txt');
    expect(await storage.open(link.key, link.expires, link.signature)).toBeNull();
  });

  it('prefixes links with a public base URL when configured', async () => {
    const withBase = new LocalObjectStorage({ rootDir: root, signingSecret: 's'.repeat(20), publicBaseUrl: 'http://pc:4000/' });
    expect(await withBase.presignedGetUrl('a/doc.pdf')).toMatch(/^http:\/\/pc:4000\/files\/a\/doc\.pdf\?/);
  });
});
