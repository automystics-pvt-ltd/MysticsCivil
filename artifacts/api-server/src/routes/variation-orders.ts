import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  variationOrdersTable,
  approvalsTable,
  projectsTable,
  estimatesTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { n, d, dReq } from "../lib/serialize";

const router: IRouter = Router();

// One-way status machine: terminal states cannot change
const VO_TRANSITIONS: Record<string, string[]> = {
  draft:     ["submitted"],
  submitted: ["approved", "rejected"],
  approved:  [],   // terminal
  rejected:  [],   // terminal
};

function serializeVo(v: any) {
  return {
    id: v.id,
    projectId: v.projectId,
    estimateId: v.estimateId ?? null,
    voNumber: v.voNumber,
    title: v.title,
    description: v.description ?? null,
    scopeChange: v.scopeChange ?? null,
    costImpact: n(v.costImpact),
    programmeImpactDays: v.programmeImpactDays ?? 0,
    status: v.status,
    raisedById: v.raisedById ?? null,
    approvedById: v.approvedById ?? null,
    createdAt: dReq(v.createdAt),
    approvedAt: d(v.approvedAt),
  };
}

router.get(
  "/projects/:projectId/variation-orders",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(variationOrdersTable)
      .where(eq(variationOrdersTable.projectId, req.params.projectId))
      .orderBy(desc(variationOrdersTable.createdAt));
    res.json(rows.map(serializeVo));
  },
);

router.post(
  "/projects/:projectId/variation-orders",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.title) {
      res.status(400).json({ error: "title required" });
      return;
    }
    const count = await db
      .select({ count: variationOrdersTable.id })
      .from(variationOrdersTable)
      .where(eq(variationOrdersTable.projectId, req.params.projectId));
    const voNumber = `VO-${String(count.length + 1).padStart(3, "0")}`;
    // Validate estimateId belongs to this project (prevent cross-project linkage)
    if (b.estimateId) {
      const [est] = await db
        .select({ projectId: estimatesTable.projectId })
        .from(estimatesTable)
        .where(eq(estimatesTable.id, b.estimateId));
      if (!est || est.projectId !== req.params.projectId) {
        res.status(400).json({ error: "estimateId does not belong to this project" });
        return;
      }
    }

    const [vo] = await db.insert(variationOrdersTable).values({
      projectId: req.params.projectId,
      estimateId: b.estimateId ?? null,
      voNumber,
      title: b.title,
      description: b.description ?? null,
      scopeChange: b.scopeChange ?? null,
      costImpact: String(n(b.costImpact ?? 0)),
      programmeImpactDays: b.programmeImpactDays ?? 0,
      status: "draft",
      raisedById: req.user!.id,
    }).returning();

    await db.insert(approvalsTable).values({
      projectId: req.params.projectId,
      entityType: "variation_order",
      entityId: vo.id,
      title: `${voNumber}: ${b.title}`,
      assignedToRole: "owner",
      status: "pending",
      requestedById: req.user!.id,
    });

    res.status(201).json(serializeVo(vo));
  },
);

router.get(
  "/variation-orders/:voId",
  requireAuth,
  async (req: Request, res: Response) => {
    const [vo] = await db.select().from(variationOrdersTable).where(eq(variationOrdersTable.id, req.params.voId));
    if (!vo) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeVo(vo));
  },
);

router.patch(
  "/variation-orders/:voId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};

    // Only Owner / PM / Admin may approve or reject — QS may edit metadata only
    if (b.status === "approved" || b.status === "rejected") {
      if (!req.user || !ROLE_GROUPS.OWNER_PM.includes(req.user.role as any)) {
        res.status(403).json({ error: "Only Owner or PM can approve or reject variation orders" });
        return;
      }
    }

    const [existing] = await db.select().from(variationOrdersTable).where(eq(variationOrdersTable.id, req.params.voId));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // Enforce state machine: validate status transition before any mutation
    if (b.status !== undefined) {
      const allowed = VO_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(b.status)) {
        res.status(409).json({
          error: `Invalid VO status transition: "${existing.status}" → "${b.status}". ` +
            (allowed.length ? `Allowed: ${allowed.join(", ")}.` : `"${existing.status}" is a terminal state.`),
        });
        return;
      }
    }

    // Terminal-state guard: disallow metadata edits on approved/rejected VOs
    const isTerminal = existing.status === "approved" || existing.status === "rejected";
    if (isTerminal && Object.keys(b).some(k => k !== "status")) {
      res.status(409).json({ error: `Variation order is ${existing.status} (terminal) — no further edits allowed.` });
      return;
    }

    // Validate estimateId linkage: if updating estimateId, must belong to VO's project
    if (b.estimateId && b.estimateId !== existing.estimateId) {
      const [est] = await db
        .select({ projectId: estimatesTable.projectId })
        .from(estimatesTable)
        .where(eq(estimatesTable.id, b.estimateId));
      if (!est || est.projectId !== existing.projectId) {
        res.status(400).json({ error: "estimateId does not belong to this variation order's project" });
        return;
      }
    }

    const update: Record<string, unknown> = {};
    for (const k of ["title", "description", "scopeChange", "estimateId"]) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if (b.costImpact !== undefined) update.costImpact = String(n(b.costImpact));
    if (b.programmeImpactDays !== undefined) update.programmeImpactDays = b.programmeImpactDays;
    if (b.status !== undefined) {
      update.status = b.status;
      if (b.status === "approved") {
        update.approvedById = req.user!.id;
        update.approvedAt = new Date();
        await db.update(approvalsTable)
          .set({ status: "approved", resolvedAt: new Date() })
          .where(and(eq(approvalsTable.entityId, req.params.voId), eq(approvalsTable.entityType, "variation_order")));
      } else if (b.status === "rejected") {
        await db.update(approvalsTable)
          .set({ status: "rejected", resolvedAt: new Date() })
          .where(and(eq(approvalsTable.entityId, req.params.voId), eq(approvalsTable.entityType, "variation_order")));
      }
    }

    // Execute VO update + financial side-effects atomically in a transaction
    let vo: typeof existing | null = null;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(variationOrdersTable)
        .set(update as any)
        .where(eq(variationOrdersTable.id, req.params.voId))
        .returning();
      if (!updated) return;
      vo = updated as any;

      // Approval side-effects — only when transitioning to approved (terminal gate above ensures once-only)
      if (b.status === "approved") {
        const impact = n(updated.costImpact);
        if (impact !== 0) {
          // Verify project ownership before touching financial records
          await tx.update(projectsTable)
            .set({ contractValue: sql`contract_value + ${String(impact)}` })
            .where(eq(projectsTable.id, updated.projectId));

          if (updated.estimateId) {
            // Confirm the estimate belongs to the same project before mutating
            const [est] = await tx
              .select({ projectId: estimatesTable.projectId })
              .from(estimatesTable)
              .where(and(
                eq(estimatesTable.id, updated.estimateId),
                eq(estimatesTable.projectId, updated.projectId),
              ));
            if (est) {
              await tx.update(estimatesTable)
                .set({ totalAmount: sql`total_amount + ${String(impact)}` })
                .where(eq(estimatesTable.id, updated.estimateId));
            }
          }
        }
      }
    });
    if (!vo) { res.status(404).json({ error: "Not found" }); return; }

    res.json(serializeVo(vo));
  },
);

export default router;
