import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inlineScriptHashes, isPageNavigation, isServerOnlyPath } from './serve-web-app';

describe('serveWebApp helpers (desktop)', () => {
  it('treats browser page loads as navigations and fetch() calls as API calls', () => {
    expect(isPageNavigation({ headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })).toBe(true);
    expect(isPageNavigation({ headers: { 'sec-fetch-mode': 'navigate' } })).toBe(true);
    expect(isPageNavigation({ headers: { accept: '*/*' } })).toBe(false);
    expect(isPageNavigation({ headers: { accept: 'application/json' } })).toBe(false);
    expect(isPageNavigation({ headers: {} })).toBe(false);
  });

  it('never answers a signed file link with the web app', () => {
    expect(isServerOnlyPath('/files/company/logo.png')).toBe(true);
    expect(isServerOnlyPath('/sales/invoices')).toBe(false);
    expect(isServerOnlyPath('/print/sales_invoice/1')).toBe(false);
  });

  it('hashes exactly the inline scripts of index.html for the CSP', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erp-web-'));
    const inline = "\n  try { document.documentElement.classList.add('dark'); } catch (e) {}\n";
    writeFileSync(
      join(dir, 'index.html'),
      `<html><head><script>${inline}</script><script type="module" crossorigin src="/assets/x.js"></script></head></html>`,
    );
    const expected = `'sha256-${createHash('sha256').update(inline).digest('base64')}'`;
    expect(inlineScriptHashes(dir)).toEqual([expected]);
    expect(inlineScriptHashes(join(dir, 'missing'))).toEqual([]);
  });
});
