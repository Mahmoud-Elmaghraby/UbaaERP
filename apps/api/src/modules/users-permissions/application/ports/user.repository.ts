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
  /** Whether TOTP 2FA is currently enabled (confirmed, not just
   * pending) — read in the same query as the rest of this record so
   * AuthService.login() doesn't need a second round trip to decide
   * whether to issue tokens directly or an MFA challenge. */
  totpEnabled: boolean;
}

/** Current TOTP state for a user — used by TwoFactorService, which
 * needs to distinguish "no 2FA at all", "setup pending confirmation",
 * and "enabled" (see that service's own comment on the two-step flow). */
export interface UserTotpState {
  enabled: boolean;
  secretEncrypted: string | null;
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

  // --- TOTP two-factor authentication (TwoFactorService) --------------
  getTotpState(db: Kysely<TenantDatabase>, userId: string): Promise<UserTotpState>;
  /** Stores an encrypted secret without enabling 2FA — see
   * TwoFactorService's class comment on why setup is two steps. */
  setPendingTotpSecret(db: Kysely<TenantDatabase>, userId: string, secretEncrypted: string): Promise<void>;
  enableTotp(db: Kysely<TenantDatabase>, userId: string): Promise<void>;
  disableTotp(db: Kysely<TenantDatabase>, userId: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
