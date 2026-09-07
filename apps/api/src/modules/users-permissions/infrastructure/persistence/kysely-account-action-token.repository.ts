import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { AccountActionTokensTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountActionTokenRepository } from '../../application/ports/account-action-token.repository';
import type { AccountActionToken, AccountActionTokenPurpose } from '../../domain/account-action-token.entity';

function toDomain(row: Selectable<AccountActionTokensTable>): AccountActionToken {
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose as AccountActionTokenPurpose,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export class KyselyAccountActionTokenRepository implements AccountActionTokenRepository {
  async create(
    db: Kysely<TenantDatabase>,
    userId: string,
    tokenHash: string,
    purpose: AccountActionTokenPurpose,
    expiresAt: Date,
  ): Promise<void> {
    await db
      .insertInto('account_action_tokens')
      .values({ id: randomUUID(), user_id: userId, token_hash: tokenHash, purpose, expires_at: expiresAt })
      .execute();
  }

  async findValidByHash(
    db: Kysely<TenantDatabase>,
    tokenHash: string,
    purpose: AccountActionTokenPurpose,
  ): Promise<AccountActionToken | null> {
    const row = await db
      .selectFrom('account_action_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) return null;
    return toDomain(row);
  }

  async markUsed(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db
      .updateTable('account_action_tokens')
      .set({ used_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}
