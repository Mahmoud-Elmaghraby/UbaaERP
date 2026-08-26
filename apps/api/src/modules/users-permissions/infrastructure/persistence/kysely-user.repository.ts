import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { TenantDatabase, UsersTable } from '../../../../database/tenant/kysely-client';
import type {
  CreateUserRecord,
  UserAuthRecord,
  UserRepository,
} from '../../application/ports/user.repository';
import type { UpdateUserInput, User } from '../../domain/user.entity';

function toDomain(row: Selectable<UsersTable>): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleId: row.role_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyUserRepository implements UserRepository {
  async list(db: Kysely<TenantDatabase>): Promise<User[]> {
    const rows = await db.selectFrom('users').selectAll().orderBy('full_name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<User | null> {
    const row = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByEmailForAuth(db: Kysely<TenantDatabase>, email: string): Promise<UserAuthRecord | null> {
    const row = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    if (!row) return null;
    return { ...toDomain(row), passwordHash: row.password_hash };
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
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updatePasswordHash(db: Kysely<TenantDatabase>, id: string, passwordHash: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}
