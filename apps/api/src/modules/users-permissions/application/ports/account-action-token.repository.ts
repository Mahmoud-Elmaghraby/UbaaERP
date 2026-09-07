import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountActionToken, AccountActionTokenPurpose } from '../../domain/account-action-token.entity';

export interface AccountActionTokenRepository {
  create(
    db: Kysely<TenantDatabase>,
    userId: string,
    tokenHash: string,
    purpose: AccountActionTokenPurpose,
    expiresAt: Date,
  ): Promise<void>;
  /** Only returns a row that is unused AND unexpired for the given purpose — a caller never has to re-check those conditions itself. */
  findValidByHash(
    db: Kysely<TenantDatabase>,
    tokenHash: string,
    purpose: AccountActionTokenPurpose,
  ): Promise<AccountActionToken | null>;
  markUsed(db: Kysely<TenantDatabase>, id: string): Promise<void>;
}

export const ACCOUNT_ACTION_TOKEN_REPOSITORY = Symbol('ACCOUNT_ACTION_TOKEN_REPOSITORY');
