import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../../shared/storage/object-storage';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import type { TenantSettings } from '../../domain/tenant-settings.entity';
import { TenantSettingsService } from './tenant-settings.service';

export const COMPANY_LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const URL_EXPIRY_SECONDS = 12 * 60 * 60;
const URL_STABLE_SECONDS = 60 * 60;

export interface CompanyProfile extends TenantSettings {
  logoUrl: string | null;
}

/**
 * The company as it appears on screen and on every printed document: the
 * tenant settings plus a (stable, cacheable) logo URL. The logo lives in the
 * central object storage under the tenant's prefix.
 */
@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly settings: TenantSettingsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async get(db: Kysely<TenantDatabase>): Promise<CompanyProfile> {
    return this.withLogoUrl(await this.settings.get(db));
  }

  async withLogoUrl(settings: TenantSettings): Promise<CompanyProfile> {
    const logoUrl = settings.logoObjectKey
      ? await this.storage.presignedGetUrl(settings.logoObjectKey, {
          expirySeconds: URL_EXPIRY_SECONDS,
          stableForSeconds: URL_STABLE_SECONDS,
        })
      : null;
    return { ...settings, logoUrl };
  }

  async setLogo(
    db: Kysely<TenantDatabase>,
    schema: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<CompanyProfile> {
    const extension = LOGO_TYPES[file.mimetype];
    if (!extension) {
      throw new BusinessRuleError('The logo must be a PNG, JPEG or WebP image.', { code: 'COMPANY_LOGO.TYPE' });
    }
    if (file.size > COMPANY_LOGO_MAX_BYTES) {
      throw new BusinessRuleError('The logo must be 1 MB or smaller.', { code: 'COMPANY_LOGO.TOO_LARGE' });
    }
    const previous = (await this.settings.get(db)).logoObjectKey;
    const key = `${schema}/company/logo-${randomUUID()}.${extension}`;
    await this.storage.put({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const updated = await this.settings.update(db, { logoObjectKey: key });
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    return this.withLogoUrl(updated);
  }

  async removeLogo(db: Kysely<TenantDatabase>): Promise<CompanyProfile> {
    const previous = (await this.settings.get(db)).logoObjectKey;
    const updated = await this.settings.update(db, { logoObjectKey: null });
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    return this.withLogoUrl(updated);
  }
}
