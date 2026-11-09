import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { TenantDatabase, UsersTable } from '../../../../database/tenant/kysely-client';
import type {
  CreateUserRecord,
  UserAuthRecord,
  UserRepository,
  UserTotpState,
} from '../../application/ports/user.repository';
import type { UpdateUserInput, User } from '../../domain/user.entity';

function toDomain(row: Selectable<UsersTable> & { last_login_at?: Date | string | null }): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleId: row.role_id,
    isActive: row.is_active,
    twoFactorEnabled: row.totp_enabled,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Users plus their last successful sign-in, taken from the audit log (no extra column to keep in sync). */
function selectUsers(db: Kysely<TenantDatabase>) {
  return db
    .selectFrom('users')
    .selectAll('users')
    .select((eb) =>
      eb
        .selectFrom('audit_logs')
        .select((sub) => sub.fn.max('audit_logs.created_at').as('m'))
        .whereRef('audit_logs.user_id', '=', 'users.id')
        .where('audit_logs.action', '=', 'auth.login')
        .as('last_login_at'),
    );
}

export class KyselyUserRepository implements UserRepository {
  async list(db: Kysely<TenantDatabase>): Promise<User[]> {
    const rows = await selectUsers(db).orderBy('users.full_name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<User | null> {
    const row = await selectUsers(db).where('users.id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async countActiveWithRole(db: Kysely<TenantDatabase>, roleId: string, excludeUserId?: string): Promise<number> {
    let query = db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('role_id', '=', roleId)
      .where('is_active', '=', true);
    if (excludeUserId) query = query.where('id', '!=', excludeUserId);
    const row = await query.executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async findByEmailForAuth(db: Kysely<TenantDatabase>, email: string): Promise<UserAuthRecord | null> {
    const row = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    if (!row) return null;
    return { ...toDomain(row), passwordHash: row.password_hash, totpEnabled: row.totp_enabled };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateUserRecord): Promise<User> {
    const row = await db
      .insertInto('users')
      .values({
        id: randomUUID(),
        email: input.email,
        password_hash: input.passwordHash,
        full_name: input.fullName,
        role_id: input.roleId,
        is_active: input.isActive,
        totp_enabled: false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateUserInput): Promise<User | null> {
    const row = await db
      .updateTable('users')
      .set({
        ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
        ...(input.roleId !== undefined ? { role_id: input.roleId } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returning('id')
      .executeTakeFirst();
    return row ? this.findById(db, row.id) : null;
  }

  async updatePasswordHash(db: Kysely<TenantDatabase>, id: string, passwordHash: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async getTotpState(db: Kysely<TenantDatabase>, userId: string): Promise<UserTotpState> {
    const row = await db
      .selectFrom('users')
      .select(['totp_enabled', 'totp_secret_encrypted'])
      .where('id', '=', userId)
      .executeTakeFirst();
    return { enabled: row?.totp_enabled ?? false, secretEncrypted: row?.totp_secret_encrypted ?? null };
  }

  async setPendingTotpSecret(db: Kysely<TenantDatabase>, userId: string, secretEncrypted: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ totp_secret_encrypted: secretEncrypted, totp_enabled: false, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
  }

  async enableTotp(db: Kysely<TenantDatabase>, userId: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ totp_enabled: true, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
  }

  async disableTotp(db: Kysely<TenantDatabase>, userId: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ totp_secret_encrypted: null, totp_enabled: false, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
  }
}
