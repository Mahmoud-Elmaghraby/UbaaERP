import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BackupCodeRepository } from '../../application/ports/backup-code.repository';

export class KyselyBackupCodeRepository implements BackupCodeRepository {
  async replaceAll(db: Kysely<TenantDatabase>, userId: string, codeHashes: string[]): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('user_backup_codes').where('user_id', '=', userId).execute();
      if (codeHashes.length === 0) return;
      await trx
        .insertInto('user_backup_codes')
        .values(codeHashes.map((codeHash) => ({ id: randomUUID(), user_id: userId, code_hash: codeHash })))
        .execute();
    });
  }

  async consume(db: Kysely<TenantDatabase>, userId: string, codeHash: string): Promise<boolean> {
    const result = await db
      .updateTable('user_backup_codes')
      .set({ used_at: new Date() })
      .where('user_id', '=', userId)
      .where('code_hash', '=', codeHash)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async deleteAllForUser(db: Kysely<TenantDatabase>, userId: string): Promise<void> {
    await db.deleteFrom('user_backup_codes').where('user_id', '=', userId).execute();
  }
}
