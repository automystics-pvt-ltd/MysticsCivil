import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  approvalsTable,
  projectsTable,
  usersTable,
  dprsTable,
  variationOrdersTable,
} from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { dReq, d } from "../lib/serialize";
import { getAccessCtx, getAccessibleProjectIds, PROJECT_ACCESS_BYPASS_ROLES } from "../lib/access";

const router: IRouter = Router();

function serializeApproval(a: any, projectName: string | null, requesterName: string | null) {
  const createdAt = a.createdAt ? new Date(a.createdAt) : new Date();
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  );
  return {
    id: a.id,
    projectId: a.projectId ?? null,
    projectName,
    entityType: a.entityType,
    entityId: a.entityId,
    title: a.title,
    requestedById: a.requestedById ?? null,
    requestedByName: requesterName,
    assignedToRole: a.assignedToRole,
    status: a.status,
    createdAt: dReq(a.createdAt),
    resolvedAt: d(a.resolvedAt),
    ageDays,
  };
}

router.get("/approvals", requireAuth, async (req: Request, res: Response) => {
  // Scope:
  //   - admin/owner: every pending approval in projects they can see.
  //   - other roles: only pending approvals targeting their role, in projects they're assigned to.
  // This makes /approvals a per-user inbox safe to poll from the header bell.
  const ctx = await getAccessCtx(req);
  const accessibleIds = await getAccessibleProjectIds(ctx);
  const isBypass = !!ctx.role && PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role);

  // Empty access set → return empty list immediately (avoids inArray with no values).
  if (accessibleIds.length === 0) {
    res.json([]);
    return;
  }

  const whereParts = [
    eq(approvalsTable.status, "pending"),
    inArray(approvalsTable.projectId, accessibleIds),
  ];
  if (!isBypass && ctx.role) {
    whereParts.push(eq(approvalsTable.assignedToRole, ctx.role));
  }

  const rows = await db
    .select({
      a: approvalsTable,
      projectName: projectsTable.name,
      requesterFirst: usersTable.firstName,
      requesterLast: usersTable.lastName,
      requesterEmail: usersTable.email,
    })
    .from(approvalsTable)
    .leftJoin(projectsTable, eq(approvalsTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(approvalsTable.requestedById, usersTable.id))
    .where(and(...whereParts))
    .orderBy(desc(approvalsTable.createdAt));
  res.json(
    rows.map((r) =>
      serializeApproval(
        r.a,
        r.projectName ?? null,
        [r.requesterFirst, r.requesterLast].filter(Boolean).join(" ") ||
          r.requesterEmail ||
          null,
      ),
    ),
  );
});

router.post(
  "/approvals/:approvalId/resolve",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_FINANCE),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (b.decision !== "approved" && b.decision !== "rejected") {
      res.status(400).json({ error: "decision must be approved|rejected" });
      return;
    }

    // Resolve the approval row AND propagate the decision to the source entity
    // (DPR / VO status). Wrapped in a transaction so both commit together —
    // otherwise the approval inbox and entity status drift out of sync.
    const ctx = await getAccessCtx(req);
    const canBypassScope = ctx.role
      ? PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role)
      : false;
    const accessibleProjectIds = canBypassScope
      ? null
      : new Set(await getAccessibleProjectIds(ctx));

    const approvalId = String(req.params["approvalId"] ?? "");
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.id, approvalId));
      if (!existing) return { notFound: true as const };
      // Project-scope check: a privileged role (e.g. QS) is allowed to resolve,
      // but only for projects they're actually assigned to. Mirrors the scoping
      // already enforced on GET /approvals so the inbox and the resolve verb
      // agree on what the caller can touch.
      if (
        accessibleProjectIds &&
        existing.projectId &&
        !accessibleProjectIds.has(existing.projectId)
      ) {
        return { forbidden: true as const };
      }
      if (existing.status !== "pending") {
        return { conflict: `Approval already ${existing.status}` as const };
      }

      // Role-gate by the approval's `assignedToRole`. super_admin/admin always
      // override; otherwise the caller must hold the exact assigned role.
      // Project-lifecycle approvals are admin-only by policy regardless of any
      // (mis)assignment on the row.
      const callerRole = ctx.role ?? "";
      const isAdminOverride =
        callerRole === "super_admin" || callerRole === "admin";
      if (existing.entityType === "project" && !isAdminOverride) {
        return { forbidden: true as const };
      }
      if (!isAdminOverride && callerRole !== existing.assignedToRole) {
        return { forbidden: true as const };
      }

      const [row] = await tx
        .update(approvalsTable)
        .set({ status: b.decision, resolvedAt: new Date() })
        .where(eq(approvalsTable.id, approvalId))
        .returning();

      // Entity-specific status propagation. Keep this dispatch small and
      // explicit; other entity types (indents, POs, bills) own their own
      // status transitions today and intentionally aren't routed through here.
      if (existing.entityId) {
        const userId = req.user!.id;
        if (existing.entityType === "dpr") {
          await tx
            .update(dprsTable)
            .set({
              status: b.decision,
              approvedById: userId,
              approvedAt: new Date(),
              rejectionReason:
                b.decision === "rejected" ? (b.reason ?? null) : null,
            })
            .where(eq(dprsTable.id, existing.entityId));
        } else if (existing.entityType === "variation_order") {
          await tx
            .update(variationOrdersTable)
            .set({
              status: b.decision,
              approvedById: userId,
              approvedAt: new Date(),
            })
            .where(eq(variationOrdersTable.id, existing.entityId));
        } else if (existing.entityType === "project") {
          // Approving moves the project into active work; rejecting parks it
          // on_hold so the requester can edit and POST /transition to
          // pending_approval again. Either way we stamp the lifecycle audit
          // columns so the project page shows who actioned it and when.
          const nextStatus = b.decision === "approved" ? "not_started" : "on_hold";
          const now = new Date();
          await tx
            .update(projectsTable)
            .set({
              status: nextStatus,
              approvedById: b.decision === "approved" ? userId : null,
              approvedAt: b.decision === "approved" ? now : null,
              lastTransitionNote:
                b.reason ? String(b.reason) : (b.decision === "rejected" ? "Rejected at approval" : null),
            } as any)
            .where(eq(projectsTable.id, existing.entityId));
        }
      }

      return { row };
    });

    if ("notFound" in result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if ("forbidden" in result) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }
    if ("conflict" in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }
    const row = result.row;
    let projectName: string | null = null;
    if (row.projectId) {
      const [p] = await db
        .select({ name: projectsTable.name })
        .from(projectsTable)
        .where(eq(projectsTable.id, row.projectId));
      projectName = p?.name ?? null;
    }
    res.json(serializeApproval(row, projectName, null));
  },
);

export default router;
