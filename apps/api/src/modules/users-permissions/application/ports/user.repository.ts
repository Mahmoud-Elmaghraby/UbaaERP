import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UpdateUserInput, User } from '../../domain/user.entity';

/** Infra-facing create shape — already-hashed password, never plaintext. */
export interface CreateUserRecord {
  email: string;
  passwordHash: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
}

export interface UserAuthRecord extends User {
  passwordHash: string;
}

export interface UserRepository {
  list(db: Kysely<TenantDatabase>): Promise<User[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<User | null>;
  /** The only read path that returns passwordHash — used solely by
   * AuthService (login) and UsersService (own-password change). Every
   * other read goes through findById/list, which never expose the hash. */
  findByEmailForAuth(db: Kysely<TenantDatabase>, email: string): Promise<UserAuthRecord | null>;
  create(db: Kysely<TenantDatabase>, input: CreateUserRecord): Promise<User>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateUserInput): Promise<User | null>;
  updatePasswordHash(db: Kysely<TenantDatabase>, id: string, passwordHash: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
