// Loaded first, as a side effect, before any other import: this CLI
// reads process.env.DATABASE_URL directly. Explicit rather than
// relying on @prisma/client's incidental auto-loading of .env (which
// some sibling CLI scripts happen to get as a side effect of
// importing PrismaClient, and this one doesn't import at all).
import 'dotenv/config';
import { seedOwnerUser } from './owner-seed';

/**
 * Standalone CLI for seeding an Owner user into an ALREADY-provisioned
 * tenant schema — primarily for tenants provisioned before this module
 * existed (e.g. the local dev "test_tenant"), where provisionTenant()'s
 * own owner-seeding step never ran. New tenants should pass owner
 * details straight to `db:provision` instead (see provisioning.service.ts).
 */
if (require.main === module) {
  void (async () => {
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const [schemaName, email, password, fullName] = args;
    const databaseUrl = process.env.DATABASE_URL;

    if (!schemaName || !email || !password || !fullName) {
      console.error(
        'Usage: pnpm run db:seed-owner -- <schema_name> <email> <password> "<Full Name>"',
      );
      process.exit(1);
    }
    if (!databaseUrl) {
      console.error('[seed-owner] DATABASE_URL is not set.');
      process.exit(1);
    }

    try {
      const result = await seedOwnerUser(databaseUrl, { schemaName, email, password, fullName });
      console.log(`[seed-owner] created Owner user "${result.email}" (${result.id}) in "${schemaName}"`);
    } catch (err) {
      console.error('[seed-owner] fatal error:', err);
      process.exitCode = 1;
    }
  })();
}
