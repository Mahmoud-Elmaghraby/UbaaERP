import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { ObjectStorage, PutObjectInput } from './object-storage';

/** URL path the signed links point at (served by LocalFilesController). */
export const LOCAL_FILES_ROUTE = 'files';

export interface StoredObjectMeta {
  contentType: string;
  cacheControl?: string;
}

export interface LocalObjectStorageOptions {
  rootDir: string;
  signingSecret: string;
  /** Prefix for generated links; empty → same-origin relative URLs. */
  publicBaseUrl?: string;
}

/**
 * ObjectStorage on the local filesystem — the desktop build's replacement
 * for MinIO (no object-storage server ships with the installer). Same
 * contract as MinioObjectStorage, so no consumer (attachments, product
 * images, company logo) knows or cares which one is behind OBJECT_STORAGE.
 *
 * "Presigned" URLs keep their meaning: an HMAC-signed, expiring link to
 * `/files/<key>`, verified by LocalFilesController — the files are never
 * reachable without one, exactly like a private MinIO bucket.
 */
export class LocalObjectStorage implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(LocalObjectStorage.name);
  private readonly root: string;

  constructor(private readonly options: LocalObjectStorageOptions) {
    this.root = resolve(options.rootDir);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    this.logger.log(`Local object storage at "${this.root}".`);
  }

  async put(input: PutObjectInput): Promise<void> {
    const path = this.pathFor(input.key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, input.body);
    const meta: StoredObjectMeta = { contentType: input.contentType, cacheControl: input.cacheControl };
    await fs.writeFile(`${path}.meta.json`, JSON.stringify(meta));
  }

  async presignedGetUrl(
    key: string,
    options: { expirySeconds?: number; stableForSeconds?: number } = {},
  ): Promise<string> {
    this.pathFor(key); // validates the key
    const expiry = options.expirySeconds ?? 300;
    const stable = options.stableForSeconds ?? 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Same idea as MinioObjectStorage: when the caller wants a URL that stays
    // byte-identical for a while (so the browser can cache the image), anchor
    // the signing time to the start of the current window.
    const anchor = stable > 0 ? nowSeconds - (nowSeconds % stable) : nowSeconds;
    const expires = anchor + expiry;
    const signature = this.sign(key, expires);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const base = (this.options.publicBaseUrl ?? '').replace(/\/$/, '');
    return `${base}/${LOCAL_FILES_ROUTE}/${encodedKey}?expires=${expires}&signature=${signature}`;
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await fs.rm(path, { force: true });
    await fs.rm(`${path}.meta.json`, { force: true });
  }

  /** Verifies a link produced by presignedGetUrl; returns the file to stream or null. */
  async open(
    key: string,
    expires: number,
    signature: string,
  ): Promise<{ path: string; meta: StoredObjectMeta } | null> {
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
    let path: string;
    try {
      path = this.pathFor(key);
    } catch {
      return null;
    }
    const expected = Buffer.from(this.sign(key, expires));
    const given = Buffer.from(signature ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      await fs.access(path);
    } catch {
      return null;
    }
    let meta: StoredObjectMeta = { contentType: 'application/octet-stream' };
    try {
      meta = JSON.parse(await fs.readFile(`${path}.meta.json`, 'utf8')) as StoredObjectMeta;
    } catch {
      // A missing sidecar only loses the content type — the file is still served.
    }
    return { path, meta };
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.options.signingSecret).update(`${key}\n${expires}`).digest('hex');
  }

  /** Maps an object key to a path strictly inside the root (no traversal). */
  private pathFor(key: string): string {
    if (!key || key.includes('\0') || key.endsWith('.meta.json')) {
      throw new Error(`Invalid object key "${key}".`);
    }
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Invalid object key "${key}".`);
    }
    return path;
  }
}
