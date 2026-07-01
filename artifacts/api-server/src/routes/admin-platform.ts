import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  userProfilesTable,
  organisationsTable,
  projectsTable,
  customRolesTable,
  subscriptionPlansTable,
  tenantSubscriptionsTable,
  tenantInvitationsTable,
  dprsTable,
  platformSettingsTable,
} from "@workspace/db";
import { eq, sql, count, gte, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/access";

// ── In-memory p95 response-time tracker ────────────────────────────────────
const RESPONSE_TIME_WINDOW = 1000;
const responseTimes: number[] = [];

export function recordResponseTime(ms: number) {
  responseTimes.push(ms);
  if (responseTimes.length > RESPONSE_TIME_WINDOW) {
    responseTimes.shift();
  }
}

function computeP95(): number {
  if (responseTimes.length === 0) return 0;
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

const router: IRouter = Router();

async function assertSuperAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return false;
  }
  const [profile] = await db
    .select({ role: userProfilesTable.role })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  if (!isSuperAdmin(profile?.role ?? null)) {
    res.status(403).json({ error: "Super admin access required" });
    return false;
  }
  return true;
}

// ── Shared: build AdminTenant row ──────────────────────────────────────────

async function buildAdminTenants(where?: Parameters<typeof db.select>[0]) {
  const rows = await db
    .select({
      id: organisationsTable.id,
      name: organisationsTable.name,
      legalName: organisationsTable.legalName,
      city: organisationsTable.city,
      state: organisationsTable.state,
      logoUrl: organisationsTable.logoUrl,
      orgCreatedAt: organisationsTable.createdAt,
      subStatus: tenantSubscriptionsTable.status,
      subTrialEndsAt: tenantSubscriptionsTable.trialEndsAt,
      subCancelledAt: tenantSubscriptionsTable.cancelledAt,
      planId: subscriptionPlansTable.id,
      planName: subscriptionPlansTable.name,
      planSlug: subscriptionPlansTable.slug,
    })
    .from(organisationsTable)
    .leftJoin(
      tenantSubscriptionsTable,
      eq(tenantSubscriptionsTable.organisationId, organisationsTable.id),
    )
    .leftJoin(
      subscriptionPlansTable,
      eq(subscriptionPlansTable.id, tenantSubscriptionsTable.planId),
    );

  const orgIds = rows.map((r) => r.id);

  if (orgIds.length === 0) return [];

  const userCounts = await db
    .select({
      organisationId: userProfilesTable.organisationId,
      cnt: count(userProfilesTable.userId),
    })
    .from(userProfilesTable)
    .groupBy(userProfilesTable.organisationId);

  const projectCounts = await db
    .select({
      organisationId: projectsTable.organisationId,
      cnt: count(projectsTable.id),
    })
    .from(projectsTable)
    .groupBy(projectsTable.organisationId);

  const userMap = new Map(userCounts.map((r) => [r.organisationId, Number(r.cnt)]));
  const projMap = new Map(projectCounts.map((r) => [r.organisationId, Number(r.cnt)]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    legalName: r.legalName ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    logoUrl: r.logoUrl ?? null,
    subscriptionStatus: r.subStatus ?? "active",
    planId: r.planId ?? "",
    planName: r.planName ?? "Free",
    planSlug: r.planSlug ?? "free",
    userCount: userMap.get(r.id) ?? 0,
    projectCount: projMap.get(r.id) ?? 0,
    trialEndsAt: r.subTrialEndsAt?.toISOString() ?? null,
    cancelledAt: r.subCancelledAt?.toISOString() ?? null,
    createdAt: r.orgCreatedAt.toISOString(),
  }));
}

// ── GET /admin/tenants ─────────────────────────────────────────────────────

router.get("/admin/tenants", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const tenants = await buildAdminTenants();
  res.json(tenants);
});

// ── GET /admin/tenants/:orgId ──────────────────────────────────────────────

router.get("/admin/tenants/:orgId", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const { orgId } = req.params;
  const all = await buildAdminTenants();
  const tenant = all.find((t) => t.id === orgId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant);
});

// ── PATCH /admin/tenants/:orgId (status: active | suspended | deleted) ─────

router.patch("/admin/tenants/:orgId", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const { orgId } = req.params;
  const { status } = req.body as { status: string };
  const ALLOWED = ["active", "suspended", "deleted"];
  if (!status || !ALLOWED.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED.join(", ")}` });
    return;
  }

  const [sub] = await db
    .select({ id: tenantSubscriptionsTable.id })
    .from(tenantSubscriptionsTable)
    .where(eq(tenantSubscriptionsTable.organisationId, orgId))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "Tenant or subscription not found" });
    return;
  }

  // Map `deleted` to a cancelled-with-timestamp state for DB storage
  const dbStatus = status === "deleted" ? "cancelled" : status;
  const updateData: Record<string, unknown> = {
    status: dbStatus,
    updatedAt: new Date(),
  };
  if (status === "deleted") {
    updateData.cancelledAt = new Date();
  }

  await db
    .update(tenantSubscriptionsTable)
    .set(updateData as any)
    .where(eq(tenantSubscriptionsTable.id, sub.id));

  const all = await buildAdminTenants();
  const tenant = all.find((t) => t.id === orgId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found after update" });
    return;
  }
  res.json(tenant);
});

// ── GET /admin/tenants/:orgId/subscription ─────────────────────────────────

router.get(
  "/admin/tenants/:orgId/subscription",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!(await assertSuperAdmin(req, res))) return;
    const { orgId } = req.params;

    const [org] = await db
      .select({ id: organisationsTable.id, name: organisationsTable.name })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, orgId))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    const [sub] = await db
      .select()
      .from(tenantSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, tenantSubscriptionsTable.planId))
      .where(eq(tenantSubscriptionsTable.organisationId, orgId))
      .limit(1);

    const [userCount] = await db
      .select({ cnt: count(userProfilesTable.userId) })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.organisationId, orgId));

    const [projectCount] = await db
      .select({ cnt: count(projectsTable.id) })
      .from(projectsTable)
      .where(eq(projectsTable.organisationId, orgId));

    const allPlans = await db
      .select({ id: subscriptionPlansTable.id, slug: subscriptionPlansTable.slug, name: subscriptionPlansTable.name, priceMonthly: subscriptionPlansTable.priceMonthly })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder);

    const ts = sub?.tenant_subscriptions;
    const sp = sub?.subscription_plans;

    res.json({
      subscriptionId: ts?.id ?? null,
      organisationId: org.id,
      orgName: org.name,
      planId: ts?.planId ?? "",
      planName: sp?.name ?? "Free",
      planSlug: sp?.slug ?? "free",
      status: ts?.status ?? "active",
      priceMonthly: sp?.priceMonthly ?? "0",
      limits: sp?.limits ?? { maxProjects: 3, maxUsers: 5, maxStorageGb: 1 },
      limitsOverride: ts?.limitsOverride ?? null,
      features: sp?.features ?? {},
      trialEndsAt: ts?.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: ts?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: ts?.currentPeriodEnd?.toISOString() ?? null,
      cancelledAt: ts?.cancelledAt?.toISOString() ?? null,
      userCount: Number(userCount?.cnt ?? 0),
      projectCount: Number(projectCount?.cnt ?? 0),
      availablePlans: allPlans.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceMonthly: p.priceMonthly,
      })),
    });
  },
);

// ── PATCH /admin/tenants/:orgId/subscription ───────────────────────────────

router.patch(
  "/admin/tenants/:orgId/subscription",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!(await assertSuperAdmin(req, res))) return;
    const { orgId } = req.params;

    const [org] = await db
      .select({ id: organisationsTable.id })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, orgId))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }

    const body = req.body as {
      planId?: string;
      status?: string;
      trialEndsAt?: string | null;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      limitsOverride?: { maxProjects?: number | null; maxUsers?: number | null; maxStorageGb?: number | null } | null;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.planId !== undefined) updates.planId = body.planId;
    if (body.status !== undefined) updates.status = body.status;
    if (body.trialEndsAt !== undefined)
      updates.trialEndsAt = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
    if (body.currentPeriodStart !== undefined)
      updates.currentPeriodStart = body.currentPeriodStart ? new Date(body.currentPeriodStart) : null;
    if (body.currentPeriodEnd !== undefined)
      updates.currentPeriodEnd = body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null;
    if (body.limitsOverride !== undefined) updates.limitsOverride = body.limitsOverride;

    const [existing] = await db
      .select({ id: tenantSubscriptionsTable.id })
      .from(tenantSubscriptionsTable)
      .where(eq(tenantSubscriptionsTable.organisationId, orgId))
      .limit(1);

    if (existing) {
      await db
        .update(tenantSubscriptionsTable)
        .set(updates as any)
        .where(eq(tenantSubscriptionsTable.id, existing.id));
    } else {
      res.status(404).json({ error: "No subscription found for this tenant" });
      return;
    }

    // Return the updated detail via the GET handler logic (inline)
    const [sub] = await db
      .select()
      .from(tenantSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, tenantSubscriptionsTable.planId))
      .where(eq(tenantSubscriptionsTable.organisationId, orgId))
      .limit(1);

    const [orgFull] = await db
      .select({ name: organisationsTable.name })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, orgId))
      .limit(1);

    const [userCount] = await db
      .select({ cnt: count(userProfilesTable.userId) })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.organisationId, orgId));

    const [projectCount] = await db
      .select({ cnt: count(projectsTable.id) })
      .from(projectsTable)
      .where(eq(projectsTable.organisationId, orgId));

    const allPlans = await db
      .select({ id: subscriptionPlansTable.id, slug: subscriptionPlansTable.slug, name: subscriptionPlansTable.name, priceMonthly: subscriptionPlansTable.priceMonthly })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder);

    const ts = sub?.tenant_subscriptions;
    const sp = sub?.subscription_plans;

    res.json({
      subscriptionId: ts?.id ?? null,
      organisationId: orgId,
      orgName: orgFull?.name ?? "",
      planId: ts?.planId ?? "",
      planName: sp?.name ?? "Free",
      planSlug: sp?.slug ?? "free",
      status: ts?.status ?? "active",
      priceMonthly: sp?.priceMonthly ?? "0",
      limits: sp?.limits ?? {},
      limitsOverride: ts?.limitsOverride ?? null,
      features: sp?.features ?? {},
      trialEndsAt: ts?.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: ts?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: ts?.currentPeriodEnd?.toISOString() ?? null,
      cancelledAt: ts?.cancelledAt?.toISOString() ?? null,
      userCount: Number(userCount?.cnt ?? 0),
      projectCount: Number(projectCount?.cnt ?? 0),
      availablePlans: allPlans.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceMonthly: p.priceMonthly,
      })),
    });
  },
);

// ── GET /admin/invitations ─────────────────────────────────────────────────

router.get("/admin/invitations", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;

  const { status: filterStatus, orgId: filterOrgId } = req.query as {
    status?: string;
    orgId?: string;
  };

  const rows = await db
    .select({
      id: tenantInvitationsTable.id,
      organisationId: tenantInvitationsTable.organisationId,
      orgName: organisationsTable.name,
      email: tenantInvitationsTable.email,
      role: tenantInvitationsTable.role,
      acceptedAt: tenantInvitationsTable.acceptedAt,
      revokedAt: tenantInvitationsTable.revokedAt,
      expiresAt: tenantInvitationsTable.expiresAt,
      createdAt: tenantInvitationsTable.createdAt,
    })
    .from(tenantInvitationsTable)
    .leftJoin(organisationsTable, eq(organisationsTable.id, tenantInvitationsTable.organisationId))
    .orderBy(desc(tenantInvitationsTable.createdAt));

  const now = new Date();

  const mapped = rows
    .map((r) => {
      let computedStatus: string;
      if (r.revokedAt) computedStatus = "revoked";
      else if (r.acceptedAt) computedStatus = "accepted";
      else if (r.expiresAt < now) computedStatus = "expired";
      else computedStatus = "pending";

      return {
        id: r.id,
        organisationId: r.organisationId,
        orgName: r.orgName ?? "Unknown",
        email: r.email,
        role: r.role,
        status: computedStatus,
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      };
    })
    .filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterOrgId && r.organisationId !== filterOrgId) return false;
      return true;
    });

  res.json(mapped);
});

// ── DELETE /admin/invitations/:invId (revoke) ──────────────────────────────

router.delete("/admin/invitations/:invId", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const { invId } = req.params;

  const [inv] = await db
    .select({ id: tenantInvitationsTable.id, revokedAt: tenantInvitationsTable.revokedAt, acceptedAt: tenantInvitationsTable.acceptedAt })
    .from(tenantInvitationsTable)
    .where(eq(tenantInvitationsTable.id, invId))
    .limit(1);

  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (inv.acceptedAt) {
    res.status(400).json({ error: "Cannot revoke an already accepted invitation" });
    return;
  }
  if (inv.revokedAt) {
    res.status(400).json({ error: "Invitation is already revoked" });
    return;
  }

  await db
    .update(tenantInvitationsTable)
    .set({ revokedAt: new Date() } as any)
    .where(eq(tenantInvitationsTable.id, invId));

  res.json({ success: true });
});

// ── GET /admin/custom-roles ────────────────────────────────────────────────

router.get("/admin/custom-roles", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;

  const rows = await db
    .select({
      id: customRolesTable.id,
      organisationId: customRolesTable.organisationId,
      orgName: organisationsTable.name,
      name: customRolesTable.name,
      description: customRolesTable.description,
      permissions: customRolesTable.permissions,
      createdAt: customRolesTable.createdAt,
    })
    .from(customRolesTable)
    .leftJoin(organisationsTable, eq(organisationsTable.id, customRolesTable.organisationId))
    .orderBy(desc(customRolesTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      organisationId: r.organisationId,
      orgName: r.orgName ?? "Unknown",
      name: r.name,
      description: r.description ?? null,
      permissions: r.permissions ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// ── GET /admin/system-stats ────────────────────────────────────────────────

router.get("/admin/system-stats", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [[totalTenants], [activeTenants], [suspendedTenants], [trialingTenants], [totalUsers], [totalProjects], [dprsLast30], [newTenants]] =
    await Promise.all([
      db.select({ cnt: count(organisationsTable.id) }).from(organisationsTable),
      db
        .select({ cnt: count(tenantSubscriptionsTable.id) })
        .from(tenantSubscriptionsTable)
        .where(eq(tenantSubscriptionsTable.status, "active")),
      db
        .select({ cnt: count(tenantSubscriptionsTable.id) })
        .from(tenantSubscriptionsTable)
        .where(eq(tenantSubscriptionsTable.status, "suspended")),
      db
        .select({ cnt: count(tenantSubscriptionsTable.id) })
        .from(tenantSubscriptionsTable)
        .where(eq(tenantSubscriptionsTable.status, "trialing")),
      db.select({ cnt: count(usersTable.id) }).from(usersTable),
      db.select({ cnt: count(projectsTable.id) }).from(projectsTable),
      db
        .select({ cnt: count(dprsTable.id) })
        .from(dprsTable)
        .where(gte(dprsTable.createdAt, thirtyDaysAgo)),
      db
        .select({ cnt: count(organisationsTable.id) })
        .from(organisationsTable)
        .where(gte(organisationsTable.createdAt, thirtyDaysAgo)),
    ]);

  const signupsByDayRaw = await db
    .select({
      date: sql<string>`to_char(${organisationsTable.createdAt}, 'YYYY-MM-DD')`,
      count: count(organisationsTable.id),
    })
    .from(organisationsTable)
    .where(gte(organisationsTable.createdAt, thirtyDaysAgo))
    .groupBy(sql`to_char(${organisationsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${organisationsTable.createdAt}, 'YYYY-MM-DD')`);

  res.json({
    totalTenants: Number(totalTenants?.cnt ?? 0),
    activeTenants: Number(activeTenants?.cnt ?? 0),
    suspendedTenants: Number(suspendedTenants?.cnt ?? 0),
    trialingTenants: Number(trialingTenants?.cnt ?? 0),
    totalUsers: Number(totalUsers?.cnt ?? 0),
    totalProjects: Number(totalProjects?.cnt ?? 0),
    dprsLast30Days: Number(dprsLast30?.cnt ?? 0),
    newTenantsLast30Days: Number(newTenants?.cnt ?? 0),
    responseTimeP95Ms: computeP95(),
    signupsByDay: signupsByDayRaw.map((r) => ({
      date: r.date,
      count: Number(r.count),
    })),
  });
});

// ── GET /admin/platform-settings/payment-gateway ───────────────────────────
// Returns current payment gateway config. Secret is masked (never returned raw).

const GATEWAY_KEYS = ["razorpay_key_id", "razorpay_key_secret", "razorpay_enabled", "razorpay_mode"] as const;

router.get("/admin/platform-settings/payment-gateway", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const rows = await db
    .select()
    .from(platformSettingsTable)
    .where(inArray(platformSettingsTable.key, [...GATEWAY_KEYS]));
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  res.json({
    razorpay_enabled: s.razorpay_enabled ?? "false",
    razorpay_key_id: s.razorpay_key_id ?? "",
    razorpay_key_secret_set: !!s.razorpay_key_secret,
    razorpay_mode: s.razorpay_mode ?? "test",
  });
});

// ── PUT /admin/platform-settings/payment-gateway ────────────────────────────
// Upserts payment gateway config. Only updates secret if provided.

router.put("/admin/platform-settings/payment-gateway", requireAuth, async (req: Request, res: Response) => {
  if (!(await assertSuperAdmin(req, res))) return;
  const userId = req.user!.id;
  const { razorpay_enabled, razorpay_key_id, razorpay_key_secret, razorpay_mode } = req.body ?? {};

  const upserts: { key: string; value: string; updatedById: string }[] = [
    { key: "razorpay_enabled", value: razorpay_enabled === true ? "true" : "false", updatedById: userId },
    { key: "razorpay_key_id", value: String(razorpay_key_id ?? ""), updatedById: userId },
    { key: "razorpay_mode", value: razorpay_mode === "live" ? "live" : "test", updatedById: userId },
  ];
  if (razorpay_key_secret) {
    upserts.push({ key: "razorpay_key_secret", value: String(razorpay_key_secret), updatedById: userId });
  }

  for (const row of upserts) {
    await db
      .insert(platformSettingsTable)
      .values(row)
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: row.value, updatedById: userId, updatedAt: new Date() },
      });
  }

  res.json({ success: true });
});

export default router;
