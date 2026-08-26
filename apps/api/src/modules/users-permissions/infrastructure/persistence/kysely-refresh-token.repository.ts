import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../../application/ports/refresh-token.repository';

export class KyselyRefreshTokenRepository implements RefreshTokenRepository {
  async create(db: Kysely<TenantDatabase>, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db
      .insertInto('refresh_tokens')
      .values({ id: randomUUID(), user_id: userId, token_hash: tokenHash, expires_at: expiresAt })
      .execute();
  }

  async findByHash(db: Kysely<TenantDatabase>, tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await db
      .selectFrom('refresh_tokens')
      .select(['id', 'user_id', 'expires_at', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return null;
    return { id: row.id, userId: row.user_id, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async revoke(db: Kysely<TenantDatabase>, tokenHash: string): Promise<void> {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .execute();
  }

  async revokeAllForUser(db: Kysely<TenantDatabase>, userId: string): Promise<void> {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
