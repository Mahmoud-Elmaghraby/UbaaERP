import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import { createTenantKyselyClient, type TenantDatabase } from './kysely-client';
import { OWNER_ROLE_ID } from './well-known-ids';

const BCRYPT_ROUNDS = 12;

export interface SeedOwnerInput {
  schemaName: string;
  email: string;
  password: string;
  fullName: string;
}

export interface SeedOwnerResult {
  id: string;
  email: string;
}

/**
 * Creates the first user in a tenant schema, on the seeded "Owner" system
 * role (see 0008_create_roles.ts / well-known-ids.ts) — without this,
 * a freshly provisioned tenant has the Users & Permissions tables but no
 * way for anyone to log in. Used both by provisionTenant() (new tenants)
 * and by the standalone seed-owner CLI (for a tenant that was already
 * provisioned before this module existed, e.g. the dev "test_tenant").
 *
 * Not idempotent by design: calling this twice for the same schema fails
 * on the users.email unique constraint, same as the Users API would.
 */
export async function seedOwnerUser(databaseUrl: string, input: SeedOwnerInput): Promise<SeedOwnerResult> {
  const db = createTenantKyselyClient(databaseUrl, input.schemaName);
  try {
    return await insertOwnerUser(db, input);
  } finally {
    await db.destroy();
  }
}

/**
 * The insert itself, on a caller-supplied connection/transaction — shared by
 * seedOwnerUser (CLI/provisioning, own short-lived client) and the desktop
 * first-run setup (DesktopSetupService, inside its own locked transaction).
 */
export async function insertOwnerUser(
  db: Kysely<TenantDatabase>,
  input: Omit<SeedOwnerInput, 'schemaName'>,
): Promise<SeedOwnerResult> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const row = await db
    .insertInto('users')
    .values({
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      password_hash: passwordHash,
      full_name: input.fullName,
      role_id: OWNER_ROLE_ID,
      is_active: true,
      totp_enabled: false,
    })
    .returning(['id', 'email'])
    .executeTakeFirstOrThrow();
  return { id: row.id, email: row.email };
}
