// Loaded first, as a side effect, before any other import — same reason
// as every other standalone db:* CLI in this codebase (see
// seed-owner.command.ts's own comment): reads process.env.DATABASE_URL
// (via PrismaClient's own .env auto-load) before anything else runs.
import 'dotenv/config';

/**
 * Standalone CLI that seeds the default "core" Plan — every feature key
 * currently known (ALL_FEATURE_KEYS), so existing behavior (nothing was
 * gated before PlanFeatureGuard) doesn't change for any tenant that gets
 * assigned it. Idempotent: safe to re-run after adding a new feature key
 * to the catalog — upserts the Plan row, then upserts each grant.
 *
 * Run once per environment before provisioning tenants (provisionTenant()
 * looks this plan up by CORE_PLAN_KEY and assigns it to every new
 * tenant — see that file's own comment). Existing tenants provisioned
 * before this pass keep planId = null until an admin assigns one
 * explicitly; PlanResolverService treats that as full access in the
 * meantime (fail-open — see its own comment), so this is safe to run,
 * or skip, without breaking anything already running.
 */
export async function seedCorePlan(): Promise<{ id: string; key: string; featureCount: number }> {
  const { PrismaClient } = await import('@prisma/client');
  const { ALL_FEATURE_KEYS, CORE_PLAN_KEY } = await import('../../shared/plans/feature-catalog');

  const prisma = new PrismaClient();
  try {
    const plan = await prisma.plan.upsert({
      where: { key: CORE_PLAN_KEY },
      update: { name: 'Core' },
      create: { key: CORE_PLAN_KEY, name: 'Core' },
    });

    for (const featureKey of ALL_FEATURE_KEYS) {
      await prisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey } },
        update: {},
        create: { planId: plan.id, featureKey },
      });
    }

    return { id: plan.id, key: plan.key, featureCount: ALL_FEATURE_KEYS.length };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void (async () => {
    try {
      const result = await seedCorePlan();
      console.log(`[seed-plans] "${result.key}" plan ready (${result.id}) — ${result.featureCount} feature(s) granted`);
    } catch (err) {
      console.error('[seed-plans] fatal error:', err);
      process.exitCode = 1;
    }
  })();
}
