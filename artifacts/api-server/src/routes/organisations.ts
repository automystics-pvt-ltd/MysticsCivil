import { Router, type IRouter, type Request, type Response } from "express";
import { db, organisationsTable, tenantSubscriptionsTable, subscriptionPlansTable, projectsTable, userProfilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS, loadRole } from "../middlewares/requireAuth";
import { serializeOrg, serializeOrgPublic } from "../lib/serialize";
import { getAccessCtx, isSuperAdmin } from "../lib/access";

const router: IRouter = Router();

const ORG_FIELDS = ["name", "legalName", "gstin", "pan", "address", "city", "state", "pincode", "logoUrl"] as const;

function parseOrgBody(b: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ORG_FIELDS) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  return out;
}

async function isAdmin(req: Request): Promise<boolean> {
  const role = req.userRole ?? (await loadRole(req.user!.id));
  req.userRole = role ?? undefined;
  return role === "admin" || role === "super_admin";
}

router.get("/organisations", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(organisationsTable);
  const admin = await isAdmin(req);
  res.json(rows.map(admin ? serializeOrg : serializeOrgPublic));
});

router.post("/organisations", requireAuth, requireRole(...ROLE_GROUPS.ADMIN), async (req: Request, res: Response) => {
  // SECURITY: only super_admin may create new organisations. A regular admin is
  // bound to their own org and cannot spawn parallel orgs.
  const ctx = await getAccessCtx(req);
  if (!isSuperAdmin(ctx.role)) {
    res.status(403).json({ error: "Only Super Admin can create organisations." });
    return;
  }
  const b = req.body ?? {};
  if (!b.name || typeof b.name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [row] = await db
    .insert(organisationsTable)
    .values(parseOrgBody(b) as any)
    .returning();
  res.status(201).json(serializeOrg(row));
});

router.get("/organisations/:organisationId", requireAuth, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(organisationsTable)
    .where(eq(organisationsTable.id, req.params.organisationId));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const admin = await isAdmin(req);
  res.json((admin ? serializeOrg : serializeOrgPublic)(row));
});

router.patch(
  "/organisations/:organisationId",
  requireAuth,
  requireRole(...ROLE_GROUPS.ADMIN),
  async (req: Request, res: Response) => {
    // SECURITY: non-super admins may only edit their own organisation.
    const ctx = await getAccessCtx(req);
    if (!isSuperAdmin(ctx.role) && ctx.organisationId !== req.params.organisationId) {
      res.status(403).json({ error: "You can only edit your own organisation." });
      return;
    }
    const update = parseOrgBody(req.body ?? {});
    if (!Object.keys(update).length) {
      const [row] = await db
        .select()
        .from(organisationsTable)
        .where(eq(organisationsTable.id, req.params.organisationId));
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(serializeOrg(row));
      return;
    }
    const [row] = await db
      .update(organisationsTable)
      .set(update as any)
      .where(eq(organisationsTable.id, req.params.organisationId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(serializeOrg(row));
  },
);

/**
 * GET /organisations/:organisationId/subscription
 * Returns the current subscription plan details for the org including usage metrics.
 * Requires admin or owner role scoped to that org (or super_admin for any org).
 */
router.get(
  "/organisations/:organisationId/subscription",
  requireAuth,
  requireRole("super_admin", "admin", "owner"),
  async (req: Request, res: Response) => {
    const ctx = await getAccessCtx(req);
    const { organisationId } = req.params;

    if (!isSuperAdmin(ctx.role) && ctx.organisationId !== organisationId) {
      res.status(403).json({ error: "Forbidden — you can only view your own organisation's subscription." });
      return;
    }

    const [row] = await db
      .select({
        subId: tenantSubscriptionsTable.id,
        status: tenantSubscriptionsTable.status,
        trialEndsAt: tenantSubscriptionsTable.trialEndsAt,
        currentPeriodStart: tenantSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: tenantSubscriptionsTable.currentPeriodEnd,
        cancelledAt: tenantSubscriptionsTable.cancelledAt,
        limitsOverride: tenantSubscriptionsTable.limitsOverride,
        updatedAt: tenantSubscriptionsTable.updatedAt,
        planId: subscriptionPlansTable.id,
        planSlug: subscriptionPlansTable.slug,
        planName: subscriptionPlansTable.name,
        priceMonthly: subscriptionPlansTable.priceMonthly,
        planLimits: subscriptionPlansTable.limits,
        planFeatures: subscriptionPlansTable.features,
      })
      .from(tenantSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, tenantSubscriptionsTable.planId))
      .where(eq(tenantSubscriptionsTable.organisationId, organisationId));

    if (!row) {
      res.json({ plan: null, subscription: null, usage: null });
      return;
    }

    // Usage metrics — project count and member count for this org.
    const [[{ projectCount }], [{ userCount }]] = await Promise.all([
      db
        .select({ projectCount: sql<number>`count(*)::int` })
        .from(projectsTable)
        .where(eq(projectsTable.organisationId, organisationId)),
      db
        .select({ userCount: sql<number>`count(*)::int` })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.organisationId, organisationId)),
    ]);

    // Days remaining in current billing period.
    const daysRemaining =
      row.currentPeriodEnd
        ? Math.max(0, Math.ceil((row.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;

    const limitsOverride = (row.limitsOverride ?? {}) as Record<string, number | null>;
    const baseLimits = (row.planLimits ?? {}) as Record<string, number | null>;
    const effectiveLimits = {
      maxProjects: limitsOverride.maxProjects !== undefined ? limitsOverride.maxProjects : baseLimits.maxProjects ?? null,
      maxUsers: limitsOverride.maxUsers !== undefined ? limitsOverride.maxUsers : baseLimits.maxUsers ?? null,
      maxStorageGb: limitsOverride.maxStorageGb !== undefined ? limitsOverride.maxStorageGb : baseLimits.maxStorageGb ?? null,
    };

    res.json({
      subscription: {
        id: row.subId,
        status: row.status,
        trialEndsAt: row.trialEndsAt,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
        daysRemaining,
        cancelledAt: row.cancelledAt,
        limitsOverride: row.limitsOverride,
        updatedAt: row.updatedAt,
      },
      plan: {
        id: row.planId,
        slug: row.planSlug,
        name: row.planName,
        priceMonthly: row.priceMonthly,
        limits: row.planLimits,
        effectiveLimits,
        features: row.planFeatures,
      },
      usage: {
        projectCount: Number(projectCount),
        userCount: Number(userCount),
      },
    });
  },
);

/**
 * PATCH /organisations/:organisationId/subscription
 * Super admin can change a tenant's plan or override limits.
 * Body: { planSlug?: string, status?: string, limitsOverride?: {...} }
 */
router.patch(
  "/organisations/:organisationId/subscription",
  requireAuth,
  requireRole(...ROLE_GROUPS.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const { organisationId } = req.params;
    const body = req.body ?? {};
    const update: Record<string, unknown> = {};

    if (body.planSlug) {
      const [plan] = await db
        .select({ id: subscriptionPlansTable.id })
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.slug, String(body.planSlug)));
      if (!plan) {
        res.status(400).json({ error: `Unknown plan: ${body.planSlug}` });
        return;
      }
      update.planId = plan.id;
    }
    if (body.status) update.status = String(body.status);
    if (body.limitsOverride !== undefined) update.limitsOverride = body.limitsOverride;

    if (!Object.keys(update).length) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [existing] = await db
      .select({ id: tenantSubscriptionsTable.id })
      .from(tenantSubscriptionsTable)
      .where(eq(tenantSubscriptionsTable.organisationId, organisationId));

    if (!existing) {
      res.status(404).json({ error: "No subscription found for this organisation" });
      return;
    }

    const [updated] = await db
      .update(tenantSubscriptionsTable)
      .set(update as any)
      .where(eq(tenantSubscriptionsTable.organisationId, organisationId))
      .returning();

    res.json({ success: true, subscriptionId: updated.id });
  },
);

export default router;
