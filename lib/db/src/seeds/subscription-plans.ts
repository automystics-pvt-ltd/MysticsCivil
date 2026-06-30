/**
 * Seed: default subscription plans + assign Mystics org to professional.
 * Safe to re-run — all operations use ON CONFLICT … DO UPDATE.
 * Run: npx tsx lib/db/src/seeds/subscription-plans.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { subscriptionPlansTable, tenantSubscriptionsTable, organisationsTable } from "../schema/ocms";
import { sql, eq } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const db = drizzle(pool);

const PLANS = [
  {
    slug: "free",
    name: "Free",
    priceMonthly: "0",
    limits: { maxProjects: 3, maxUsers: 5, maxStorageGb: 1 },
    features: {
      pre_award: false,
      custom_roles: false,
      api_access: false,
      advanced_reports: false,
      advanced_estimations: false,
    },
    sortOrder: 0,
  },
  {
    slug: "professional",
    name: "Professional",
    priceMonthly: "2999",
    limits: { maxProjects: 25, maxUsers: 25, maxStorageGb: 20 },
    features: {
      pre_award: true,
      custom_roles: true,
      api_access: false,
      advanced_reports: true,
      advanced_estimations: true,
    },
    sortOrder: 1,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    priceMonthly: "9999",
    limits: { maxProjects: null, maxUsers: null, maxStorageGb: null },
    features: {
      pre_award: true,
      custom_roles: true,
      api_access: true,
      advanced_reports: true,
      advanced_estimations: true,
    },
    sortOrder: 2,
  },
];

async function seed() {
  console.log("Seeding subscription plans…");
  for (const plan of PLANS) {
    await db
      .insert(subscriptionPlansTable)
      .values(plan as any)
      .onConflictDoUpdate({
        target: subscriptionPlansTable.slug,
        set: {
          name: sql`EXCLUDED.name`,
          priceMonthly: sql`EXCLUDED.price_monthly`,
          limits: sql`EXCLUDED.limits`,
          features: sql`EXCLUDED.features`,
          sortOrder: sql`EXCLUDED.sort_order`,
          updatedAt: new Date(),
        },
      });
    console.log(`  ✓ plan: ${plan.slug}`);
  }

  // Assign the "Mystics" org to the professional plan (idempotent upsert).
  console.log("\nAssigning Mystics org to professional plan…");
  const [mystics] = await db
    .select({ id: organisationsTable.id })
    .from(organisationsTable)
    .where(eq(organisationsTable.name, "Mystics"));

  if (mystics) {
    const [professional] = await db
      .select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.slug, "professional"));

    if (professional) {
      const now = new Date();
      await db
        .insert(tenantSubscriptionsTable)
        .values({
          organisationId: mystics.id,
          planId: professional.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        } as any)
        .onConflictDoUpdate({
          target: tenantSubscriptionsTable.organisationId,
          set: {
            planId: professional.id,
            status: "active",
            updatedAt: now,
          },
        });
      console.log(`  ✓ Mystics → professional`);
    }
  } else {
    console.log("  ⚠ Mystics org not found — skipping assignment");
  }

  console.log("\nDone.");
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
