// Loaded first, as a side effect, before any other import: this CLI
// reads process.env.DATABASE_URL directly — same reasoning as
// seed-owner.command.ts's own comment.
import 'dotenv/config';
import { seedWalkInCustomer } from './walk-in-customer-seed';

/**
 * Standalone CLI for seeding the system-default Walk-in Customer (POS
 * feature Stage 2) into an ALREADY-provisioned tenant schema —
 * primarily for tenants provisioned before migration 0063 existed,
 * where provisionTenant()'s own seeding step never ran. New tenants get
 * one automatically via provisionTenant() (see provisioning.service.ts).
 */
if (require.main === module) {
  void (async () => {
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const [schemaName] = args;
    const databaseUrl = process.env.DATABASE_URL;

    if (!schemaName) {
      console.error('Usage: pnpm run db:seed-walk-in-customer -- <schema_name>');
      process.exit(1);
    }
    if (!databaseUrl) {
      console.error('[seed-walk-in-customer] DATABASE_URL is not set.');
      process.exit(1);
    }

    try {
      const result = await seedWalkInCustomer(databaseUrl, schemaName);
      console.log(`[seed-walk-in-customer] Walk-in customer ready: "${result.code}" (${result.id}) in "${schemaName}"`);
    } catch (err) {
      console.error('[seed-walk-in-customer] fatal error:', err);
      process.exitCode = 1;
    }
  })();
}
