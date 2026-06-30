import { Router, type IRouter, type Request, type Response } from "express";
import { db, quotationsTable, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx } from "../lib/access";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();

// All quotations endpoints require the pre_award plan feature.
router.use("/quotations", requirePlanFeature("pre_award"));

router.get("/quotations", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const { status, customerId } = req.query as Record<string, string>;
  const rows = await db.select().from(quotationsTable).where(
    and(
      org ? eq(quotationsTable.organisationId, org) : undefined,
      status ? eq(quotationsTable.status, status) : undefined,
      customerId ? eq(quotationsTable.customerId, customerId) : undefined,
    )
  ).orderBy(desc(quotationsTable.updatedAt));
  res.json(rows);
});

router.get("/quotations/stats", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const rows = await db.select({ status: quotationsTable.status, totalValue: quotationsTable.totalValue }).from(quotationsTable).where(org ? eq(quotationsTable.organisationId, org) : undefined);
  const byStatus: Record<string, { count: number; value: number }> = {};
  let totalValue = 0;
  const sent = rows.filter(r => ["sent","accepted","rejected","expired"].includes(r.status ?? "")).length;
  const accepted = rows.filter(r => r.status === "accepted").length;
  for (const r of rows) {
    const s = r.status ?? "draft";
    if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 };
    byStatus[s].count++;
    const v = Number(r.totalValue ?? 0);
    byStatus[s].value += v;
    if (s === "accepted") totalValue += v;
  }
  const acceptanceRate = sent > 0 ? Math.round((accepted / sent) * 100) : 0;
  res.json({ byStatus, totalValue, acceptanceRate, total: rows.length });
});

router.get("/quotations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [row] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, req.params.id), org ? eq(quotationsTable.organisationId, org) : undefined));
  if (!row) { res.status(404).json({ error: "Quotation not found" }); return; }
  res.json(row);
});

router.post("/quotations", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  if (!org) { res.status(403).json({ error: "No organisation bound to your account" }); return; }
  const b = req.body ?? {};
  if (!b.title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  const [row] = await db.insert(quotationsTable).values({
    organisationId: org, preEstimationId: b.preEstimationId || null,
    customerId: b.customerId || null, leadId: b.leadId || null,
    quotationNumber: b.quotationNumber?.trim() || null, title: String(b.title).trim(),
    totalValue: b.totalValue ? String(b.totalValue) : null,
    validUntil: b.validUntil ? new Date(b.validUntil) : null,
    status: "draft", notes: b.notes?.trim() || null, createdById: ctx.userId ?? null,
  }).returning();
  await db.insert(statusHistoryTable).values({ entityType: "quotation", entityId: row.id, fromStatus: null, toStatus: "draft", changedById: ctx.userId, reason: "Created" });
  res.status(201).json(row);
});

router.patch("/quotations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, req.params.id), org ? eq(quotationsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }
  const b = req.body ?? {};
  const updates: Partial<typeof quotationsTable.$inferInsert> = {};
  if (b.title !== undefined) updates.title = String(b.title).trim();
  if (b.quotationNumber !== undefined) updates.quotationNumber = b.quotationNumber || null;
  if (b.preEstimationId !== undefined) updates.preEstimationId = b.preEstimationId || null;
  if (b.customerId !== undefined) updates.customerId = b.customerId || null;
  if (b.leadId !== undefined) updates.leadId = b.leadId || null;
  if (b.totalValue !== undefined) updates.totalValue = b.totalValue ? String(b.totalValue) : null;
  if (b.validUntil !== undefined) updates.validUntil = b.validUntil ? new Date(b.validUntil) : null;
  if (b.notes !== undefined) updates.notes = b.notes || null;
  if (b.rejectedReason !== undefined) updates.rejectedReason = b.rejectedReason || null;
  if (b.status !== undefined) {
    updates.status = b.status;
    if (b.status === "sent") updates.submittedAt = new Date();
    if (b.status === "accepted") updates.acceptedAt = new Date();
  }
  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(quotationsTable).set(updates).where(eq(quotationsTable.id, req.params.id)).returning();
  if (b.status !== undefined && b.status !== existing.status) {
    await db.insert(statusHistoryTable).values({ entityType: "quotation", entityId: req.params.id, fromStatus: existing.status, toStatus: b.status, changedById: ctx.userId, reason: b.reason || null });
  }
  res.json(updated);
});

router.delete("/quotations/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: quotationsTable.id }).from(quotationsTable).where(and(eq(quotationsTable.id, req.params.id), org ? eq(quotationsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Quotation not found" }); return; }
  await db.delete(quotationsTable).where(eq(quotationsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
