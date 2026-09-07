import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface BackupCodeRepository {
  /** Deletes every existing backup code for the user and inserts the
   * given set — used only by TwoFactorService.confirmSetup(), the sole
   * place backup codes are (re)generated. */
  replaceAll(db: Kysely<TenantDatabase>, userId: string, codeHashes: string[]): Promise<void>;
  /** Marks one matching, unused code as used and returns true — or
   * returns false if no such unused code exists. Single-use by design. */
  consume(db: Kysely<TenantDatabase>, userId: string, codeHash: string): Promise<boolean>;
  deleteAllForUser(db: Kysely<TenantDatabase>, userId: string): Promise<void>;
}

export const BACKUP_CODE_REPOSITORY = Symbol('BACKUP_CODE_REPOSITORY');
