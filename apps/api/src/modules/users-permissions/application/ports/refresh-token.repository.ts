import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRepository {
  create(db: Kysely<TenantDatabase>, userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findByHash(db: Kysely<TenantDatabase>, tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(db: Kysely<TenantDatabase>, tokenHash: string): Promise<void>;
  revokeAllForUser(db: Kysely<TenantDatabase>, userId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
