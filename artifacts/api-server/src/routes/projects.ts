import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  projectsTable,
  milestonesTable,
  organisationsTable,
  approvalsTable,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeProject } from "../lib/serialize";
import {
  getAccessCtx,
  getAccessibleProjectIds,
  PROJECT_ACCESS_BYPASS_ROLES,
  isSuperAdmin,
  userCanSeeProject,
} from "../lib/access";
import { loadTenantPlan, checkPlanLimit } from "../lib/subscription";

const router: IRouter = Router();

// Roles that auto-approve their own project creation (no approval row needed).
const AUTO_APPROVE_ROLES = new Set(["super_admin", "admin"]);

// State machine: from-status → { to-status → allowed-roles[] }.
// Approve / reject of `pending_approval` is intentionally NOT in this map —
// it must go through POST /approvals/:id/resolve so the approval ticket and
// the project status stay in lockstep and the admin-only gate is enforced in
// one place.
const TRANSITIONS: Record<string, Record<string, string[]>> = {
  pending_approval: {},
  not_started: {
    on_track: ROLE_GROUPS.OWNER_PM as unknown as string[],
    on_hold: ROLE_GROUPS.OWNER_PM as unknown as string[],
  },
  on_track: {
    at_risk: ROLE_GROUPS.OWNER_PM as unknown as string[],
    delayed: ROLE_GROUPS.OWNER_PM as unknown as string[],
    on_hold: ROLE_GROUPS.OWNER_PM as unknown as string[],
    completed: ROLE_GROUPS.ADMIN as unknown as string[],
  },
  at_risk: {
    on_track: ROLE_GROUPS.OWNER_PM as unknown as string[],
    delayed: ROLE_GROUPS.OWNER_PM as unknown as string[],
    on_hold: ROLE_GROUPS.OWNER_PM as unknown as string[],
    completed: ROLE_GROUPS.ADMIN as unknown as string[],
  },
  delayed: {
    on_track: ROLE_GROUPS.OWNER_PM as unknown as string[],
    at_risk: ROLE_GROUPS.OWNER_PM as unknown as string[],
    on_hold: ROLE_GROUPS.OWNER_PM as unknown as string[],
    completed: ROLE_GROUPS.ADMIN as unknown as string[],
  },
  on_hold: {
    on_track: ROLE_GROUPS.OWNER_PM as unknown as string[],
    pending_approval: ROLE_GROUPS.OWNER_PM as unknown as string[],
  },
  completed: {},
};

function parseProjectBody(b: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [
    "organisationId",
    "code",
    "name",
    "clientName",
    "description",
    "location",
    "reraNumber",
    "pmId",
    "coverImageUrl",
  ]) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  for (const k of ["latitude", "longitude", "contractValue"]) {
    if (b[k] !== undefined && b[k] !== null) out[k] = String(b[k]);
  }
  for (const k of ["startDate", "targetEndDate", "forecastEndDate"]) {
    if (b[k]) out[k] = new Date(b[k]);
  }
  return out;
}

router.get("/projects", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  if (isSuperAdmin(ctx.role)) {
    const rows = await db.select().from(projectsTable);
    res.json(rows.map(serializeProject));
    return;
  }
  if (ctx.role && PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role)) {
    const rows = ctx.organisationId
      ? await db.select().from(projectsTable).where(eq(projectsTable.organisationId, ctx.organisationId))
      : await db.select().from(projectsTable);
    res.json(rows.map(serializeProject));
    return;
  }
  const ids = await getAccessibleProjectIds(ctx);
  if (!ids.length) {
    res.json([]);
    return;
  }
  const rows = await db.select().from(projectsTable).where(inArray(projectsTable.id, ids));
  res.json(rows.map(serializeProject));
});

router.post(
  "/projects",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.organisationId || !b.code || !b.name) {
      res.status(400).json({ error: "organisationId, code, name required" });
      return;
    }
    const ctx = await getAccessCtx(req);
    if (!isSuperAdmin(ctx.role)) {
      if (!ctx.organisationId || String(b.organisationId) !== ctx.organisationId) {
        res.status(403).json({
          error: "You can only create projects within your own organisation.",
        });
        return;
      }
      const [org] = await db
        .select({ name: organisationsTable.name })
        .from(organisationsTable)
        .where(eq(organisationsTable.id, String(b.organisationId)));
      if (!org) {
        res.status(400).json({ error: "Organisation not found" });
        return;
      }
      // Enforce plan-level maxProjects limit (supersedes legacy org.maxProjects).
      const plan = await loadTenantPlan(req);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectsTable)
        .where(eq(projectsTable.organisationId, String(b.organisationId)));
      const limitCheck = checkPlanLimit(plan, "maxProjects", Number(count));
      if (!limitCheck.ok) {
        res.status(403).json({
          error: limitCheck.message,
          code: "PLAN_LIMIT_REACHED",
          limitKey: "maxProjects",
          currentPlan: plan.planSlug,
        });
        return;
      }
    }

    // Lifecycle: creator can hint a status but server decides defaults.
    // Admin/super_admin auto-approve their own creates; everyone else lands in pending_approval.
    const now = new Date();
    const creatorAutoApproves = AUTO_APPROVE_ROLES.has(ctx.role ?? "");
    const initialStatus: ProjectStatus = creatorAutoApproves ? "not_started" : "pending_approval";

    const base = parseProjectBody(b) as Record<string, unknown>;
    base.status = initialStatus;
    base.initiatedById = ctx.userId;
    base.initiatedAt = now;
    if (creatorAutoApproves) {
      base.approvedById = ctx.userId;
      base.approvedAt = now;
    }

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projectsTable)
        .values(base as any)
        .returning();
      if (Array.isArray(b.milestones) && b.milestones.length) {
        await tx.insert(milestonesTable).values(
          b.milestones
            .filter((m: any) => m && m.name && m.targetDate)
            .map((m: any, idx: number) => ({
              projectId: created.id,
              name: String(m.name),
              description: m.description ? String(m.description) : null,
              targetDate: new Date(m.targetDate),
              status: "pending",
              sortOrder: idx,
            })),
        );
      }
      // If not auto-approved, file an approval ticket for admin/super_admin to action.
      // `onConflictDoNothing` pairs with the partial unique index
      // `approvals_one_pending_per_entity_uq` so a double-create silently no-ops.
      if (!creatorAutoApproves) {
        await tx
          .insert(approvalsTable)
          .values({
            projectId: created.id,
            entityType: "project",
            entityId: created.id,
            title: `New project approval: ${created.name}`,
            requestedById: ctx.userId,
            assignedToRole: "admin",
            status: "pending",
          } as any)
          .onConflictDoNothing();
      }
      return created;
    });
    res.status(201).json(serializeProject(row));
  },
);

router.get("/projects/:projectId", requireAuth, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, String(req.params["projectId"] ?? "")));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeProject(row));
});

router.patch(
  "/projects/:projectId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    // Status changes must go through the transition endpoint (state machine).
    // Strip any incoming status field from PATCH so role/state gates stay honest.
    const body = { ...(req.body ?? {}) };
    delete body.status;
    const update = parseProjectBody(body);
    const [row] = await db
      .update(projectsTable)
      .set(update as any)
      .where(eq(projectsTable.id, String(req.params["projectId"] ?? "")))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(serializeProject(row));
  },
);

// State-machine guarded status change. Body: { to: ProjectStatus, note?: string }.
// Approval/reject of `pending_approval` goes through POST /approvals/:id/resolve
// — this endpoint handles every other lifecycle move (start, hold, resume, complete, resubmit).
router.post(
  "/projects/:projectId/transition",
  requireAuth,
  async (req: Request, res: Response) => {
    const projectId = String(req.params["projectId"] ?? "");
    const to = String((req.body ?? {}).to ?? "");
    const note = (req.body ?? {}).note ? String((req.body ?? {}).note) : null;
    if (!(PROJECT_STATUSES as readonly string[]).includes(to)) {
      res.status(400).json({ error: `Invalid target status: ${to}` });
      return;
    }
    const ctx = await getAccessCtx(req);
    if (!ctx.role) {
      res.status(403).json({ error: "No role assigned" });
      return;
    }
    // Org/project scope check.
    const [proj] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!proj) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    // Project-level access: bypass roles (admin/owner/super_admin) see all
    // projects in their org; non-bypass roles must have a project_access row.
    // userCanSeeProject covers both cases and super_admin global override.
    const allowed = await userCanSeeProject(ctx, projectId);
    if (!allowed) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    const from = proj.status;
    const allowedFrom = TRANSITIONS[from] ?? {};
    const allowedRoles = allowedFrom[to];
    if (!allowedRoles) {
      res.status(409).json({
        error: `Cannot transition from ${from} to ${to}.`,
      });
      return;
    }
    if (!allowedRoles.includes(ctx.role)) {
      res.status(403).json({
        error: `Your role (${ctx.role}) cannot perform ${from} → ${to}.`,
      });
      return;
    }
    const now = new Date();
    const patch: Record<string, unknown> = {
      status: to,
      lastTransitionNote: note,
    };
    if (to === "completed") patch.completedAt = now;
    if (to === "not_started" && from === "pending_approval") {
      patch.approvedById = ctx.userId;
      patch.approvedAt = now;
    }
    // Resubmit clears the previous approval stamp and opens a fresh ticket.
    if (to === "pending_approval") {
      patch.approvedById = null;
      patch.approvedAt = null;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(projectsTable)
        .set(patch as any)
        .where(eq(projectsTable.id, projectId));
      // Close any open project-approval ticket if the project moves out of pending_approval.
      if (from === "pending_approval" && to !== "pending_approval") {
        await tx
          .update(approvalsTable)
          .set({
            status: to === "not_started" ? "approved" : "rejected",
            resolvedAt: now,
          })
          .where(
            and(
              eq(approvalsTable.entityType, "project"),
              eq(approvalsTable.entityId, projectId),
              eq(approvalsTable.status, "pending"),
            ),
          );
      }
      // Open a fresh approval ticket on resubmit — but only if there isn't
      // already an open one for this project. Guard against concurrent
      // resubmit clicks creating duplicate inbox rows.
      if (to === "pending_approval") {
        const [existingOpen] = await tx
          .select({ id: approvalsTable.id })
          .from(approvalsTable)
          .where(
            and(
              eq(approvalsTable.entityType, "project"),
              eq(approvalsTable.entityId, projectId),
              eq(approvalsTable.status, "pending"),
            ),
          );
        if (!existingOpen) {
          // App-level guard above + DB-level partial unique index
          // (`approvals_one_pending_per_entity_uq`) make this safe under
          // concurrent resubmits; `onConflictDoNothing` keeps the txn alive
          // if the race-loser hits the index.
          await tx
            .insert(approvalsTable)
            .values({
              projectId,
              entityType: "project",
              entityId: projectId,
              title: `Resubmitted project: ${proj.name}`,
              requestedById: ctx.userId,
              assignedToRole: "admin",
              status: "pending",
            } as any)
            .onConflictDoNothing();
        }
      }
    });
    const [updated] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    res.json(serializeProject(updated));
  },
);

router.delete(
  "/projects/:projectId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    await db
      .delete(projectsTable)
      .where(eq(projectsTable.id, String(req.params["projectId"] ?? "")));
    res.status(204).end();
  },
);

export default router;
