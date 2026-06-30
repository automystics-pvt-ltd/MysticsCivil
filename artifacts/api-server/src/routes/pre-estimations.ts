import { Router, type IRouter, type Request, type Response } from "express";
import { db, preEstimationsTable, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx } from "../lib/access";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();

// All pre-estimations endpoints require the pre_award plan feature.
router.use("/pre-estimations", requirePlanFeature("pre_award"));

router.get("/pre-estimations", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const { status, customerId } = req.query as Record<string, string>;
  const rows = await db.select().from(preEstimationsTable).where(
    and(
      org ? eq(preEstimationsTable.organisationId, org) : undefined,
      status ? eq(preEstimationsTable.status, status) : undefined,
      customerId ? eq(preEstimationsTable.customerId, customerId) : undefined,
    )
  ).orderBy(desc(preEstimationsTable.updatedAt));
  res.json(rows);
});

router.get("/pre-estimations/stats", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const rows = await db.select({ status: preEstimationsTable.status, preliminaryValue: preEstimationsTable.preliminaryValue }).from(preEstimationsTable).where(org ? eq(preEstimationsTable.organisationId, org) : undefined);
  const byStatus: Record<string, { count: number; value: number }> = {};
  let totalValue = 0;
  for (const r of rows) {
    const s = r.status ?? "draft";
    if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 };
    byStatus[s].count++;
    const v = Number(r.preliminaryValue ?? 0);
    byStatus[s].value += v;
    totalValue += v;
  }
  res.json({ byStatus, totalValue, total: rows.length });
});

router.get("/pre-estimations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [row] = await db.select().from(preEstimationsTable).where(and(eq(preEstimationsTable.id, req.params.id), org ? eq(preEstimationsTable.organisationId, org) : undefined));
  if (!row) { res.status(404).json({ error: "Pre-Estimation not found" }); return; }
  res.json(row);
});

router.post("/pre-estimations", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  if (!org) { res.status(403).json({ error: "No organisation bound to your account" }); return; }
  const b = req.body ?? {};
  if (!b.title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  const [row] = await db.insert(preEstimationsTable).values({
    organisationId: org, customerId: b.customerId || null, leadId: b.leadId || null,
    title: String(b.title).trim(), workType: b.workType?.trim() || null,
    location: b.location?.trim() || null, scopeDescription: b.scopeDescription?.trim() || null,
    preliminaryValue: b.preliminaryValue ? String(b.preliminaryValue) : null,
    estimationMethod: b.estimationMethod ?? "parametric",
    status: "draft", notes: b.notes?.trim() || null, createdById: ctx.userId ?? null,
  }).returning();
  await db.insert(statusHistoryTable).values({ entityType: "pre_estimation", entityId: row.id, fromStatus: null, toStatus: "draft", changedById: ctx.userId, reason: "Created" });
  res.status(201).json(row);
});

router.patch("/pre-estimations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select().from(preEstimationsTable).where(and(eq(preEstimationsTable.id, req.params.id), org ? eq(preEstimationsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Pre-Estimation not found" }); return; }
  const b = req.body ?? {};
  const updates: Partial<typeof preEstimationsTable.$inferInsert> = {};
  if (b.title !== undefined) updates.title = String(b.title).trim();
  if (b.customerId !== undefined) updates.customerId = b.customerId || null;
  if (b.leadId !== undefined) updates.leadId = b.leadId || null;
  if (b.workType !== undefined) updates.workType = b.workType || null;
  if (b.location !== undefined) updates.location = b.location || null;
  if (b.scopeDescription !== undefined) updates.scopeDescription = b.scopeDescription || null;
  if (b.preliminaryValue !== undefined) updates.preliminaryValue = b.preliminaryValue ? String(b.preliminaryValue) : null;
  if (b.estimationMethod !== undefined) updates.estimationMethod = b.estimationMethod;
  if (b.notes !== undefined) updates.notes = b.notes || null;
  if (b.status !== undefined) {
    updates.status = b.status;
    if (b.status === "approved") {
      updates.approvedById = ctx.userId ?? null;
      updates.approvedAt = new Date();
    }
  }
  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(preEstimationsTable).set(updates).where(eq(preEstimationsTable.id, req.params.id)).returning();
  if (b.status !== undefined && b.status !== existing.status) {
    await db.insert(statusHistoryTable).values({ entityType: "pre_estimation", entityId: req.params.id, fromStatus: existing.status, toStatus: b.status, changedById: ctx.userId, reason: b.reason || null });
  }
  res.json(updated);
});

router.delete("/pre-estimations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: preEstimationsTable.id }).from(preEstimationsTable).where(and(eq(preEstimationsTable.id, req.params.id), org ? eq(preEstimationsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Pre-Estimation not found" }); return; }
  await db.delete(preEstimationsTable).where(eq(preEstimationsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
