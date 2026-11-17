// Loaded first, as a side effect: this CLI reads DATABASE_URL directly (same as the sibling commands).
import "dotenv/config";
import { Pool } from "pg";
import { seedCorePlan } from "../public/seed-plans.command";
import { provisionTenant } from "../tenant/provisioning.service";
import { DemoApiClient } from "./demo-api-client";
import { runDemoSeed } from "./demo-seed";

/**
 * Builds a complete demo company for showing the product to a prospect: a candy & chocolate
 * distributor ("العمدة") with ~60 real market items, warehouses, branches, customers, suppliers
 * and about three months of posted activity, plus HR and payroll.
 *
 *   pnpm --filter api db:seed-demo -- [--schema alomda] [--name "العمدة"] [--email owner@alomda.demo]
 *                                     [--password Demo@2026] [--api http://localhost:4000]
 *
 * The API must be running: every record is created through it, and its outbox worker turns the
 * posted documents into journal entries. The tenant is provisioned first when it doesn't exist;
 * an existing tenant is never touched (pick another --schema).
 */
/** Whether the tenant already holds any item (an earlier demo run got past setup). */
async function hasItems(databaseUrl: string, schema: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const res = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM "${schema}".products) AS found`,
    );
    return Boolean(res.rows[0]?.found);
  } finally {
    await pool.end();
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

if (require.main === module) {
  void (async () => {
    const schema = arg("schema", "alomda");
    const name = arg("name", "العمدة");
    const email = arg("email", "owner@alomda.demo");
    const password = arg("password", "Demo@2026");
    const api = arg("api", `http://localhost:${process.env.PORT ?? 4000}`);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error("[demo-seed] DATABASE_URL is not set.");
      process.exit(1);
    }

    // The plan must grant every module the demo turns on (HR, POS…) — idempotent.
    await seedCorePlan();

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const existing = await prisma.tenant.findUnique({
        where: { schemaName: schema },
      });
      if (!existing) {
        await provisionTenant(prisma, databaseUrl, {
          name,
          schemaName: schema,
          owner: { email, password, fullName: "مدير النظام" },
        });
      } else if (await hasItems(databaseUrl, schema)) {
        console.error(
          `[demo-seed] tenant "${schema}" already has data — nothing was changed. Use another --schema.`,
        );
        process.exitCode = 1;
        return;
      } else {
        // An earlier run stopped right after provisioning: carry on in the same, still-empty tenant.
        console.log(
          `[demo-seed] tenant "${schema}" exists and is still empty — continuing in it.`,
        );
      }
    } finally {
      await prisma.$disconnect();
    }

    const client = new DemoApiClient(api, schema);
    try {
      await client.login(email, password);
    } catch (err) {
      console.error(
        `[demo-seed] could not reach/log in to the API at ${api} — is it running?`,
        err,
      );
      process.exit(1);
    }
    await runDemoSeed(client, {
      companyName: name,
      login: () => client.login(email, password),
    });
    console.log(
      `\n[demo-seed] done. Log in with tenant "${schema}", ${email} / ${password}`,
    );
  })().catch((err) => {
    console.error("[demo-seed] fatal error:", err);
    process.exit(1);
  });
}
