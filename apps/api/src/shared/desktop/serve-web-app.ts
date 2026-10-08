import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LOCAL_FILES_ROUTE } from '../storage/local-object-storage';

/**
 * Desktop build only: the API process also serves the built web app
 * (apps/web/dist), so the Electron window — and, when the owner turns on
 * network access, a phone or another PC on the shop's LAN — loads
 * everything from one origin with no separate web server.
 *
 * API routes and SPA routes share paths without a prefix (e.g. `/print/...`
 * is a page, `/printing/...` an endpoint), so the fallback to index.html is
 * decided by *what the browser asked for*, not by path: a page navigation
 * sends `Accept: text/html`; the web app's fetch() calls never do.
 */
export function serveWebApp(app: NestExpressApplication, webDistPath: string): void {
  const root = resolve(webDistPath);
  const indexHtml = join(root, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`WEB_DIST_PATH "${root}" has no index.html — build apps/web first.`);
  }

  // Hashed bundle files can be cached forever; index.html never (it names them).
  const assetsDir = join(root, 'assets');
  app.useStaticAssets(root, {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader('Cache-Control', path.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !isServerOnlyPath(req.path) && isPageNavigation(req)) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
      return;
    }
    next();
  });
}

/**
 * Paths opened by navigation that the server itself must answer — a signed
 * file link opened in a new window (attachments) is a page navigation too.
 */
export function isServerOnlyPath(path: string): boolean {
  return path.startsWith(`/${LOCAL_FILES_ROUTE}/`);
}

export function isPageNavigation(req: Pick<Request, 'headers'>): boolean {
  if (req.headers['sec-fetch-mode'] === 'navigate') return true;
  return (req.headers.accept ?? '').includes('text/html');
}

/**
 * CSP hashes ('sha256-…') of the inline <script> blocks in the built
 * index.html (the pre-paint theme snippet) — so helmet's strict
 * `script-src 'self'` can allow exactly those and nothing else.
 */
export function inlineScriptHashes(webDistPath: string): string[] {
  const indexHtml = join(resolve(webDistPath), 'index.html');
  if (!existsSync(indexHtml)) return [];
  const html = readFileSync(indexHtml, 'utf8');
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  }
  return hashes;
}
