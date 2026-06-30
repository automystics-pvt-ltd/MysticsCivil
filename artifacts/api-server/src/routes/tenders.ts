import { Router, type IRouter, type Request, type Response } from "express";
import { db, tendersTable, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx } from "../lib/access";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();

// All tenders endpoints require the pre_award plan feature.
router.use("/tenders", requirePlanFeature("pre_award"));

async function writeHistory(entityId: string, fromStatus: string | null, toStatus: string, changedById: string | null, reason?: string) {
  await db.insert(statusHistoryTable).values({ entityType: "tender", entityId, fromStatus, toStatus, changedById, reason: reason ?? null });
}

router.get("/tenders", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const { status } = req.query as Record<string, string>;
  const rows = await db.select().from(tendersTable).where(
    and(org ? eq(tendersTable.organisationId, org) : undefined, status ? eq(tendersTable.status, status) : undefined)
  ).orderBy(desc(tendersTable.updatedAt));
  res.json(rows);
});

router.get("/tenders/stats", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const rows = await db.select({ status: tendersTable.status, estimatedValue: tendersTable.estimatedValue, ourBidAmount: tendersTable.ourBidAmount, l1Amount: tendersTable.l1Amount }).from(tendersTable).where(org ? eq(tendersTable.organisationId, org) : undefined);
  const byStatus: Record<string, { count: number; value: number }> = {};
  let totalBidValue = 0, wonValue = 0;
  const submitted = rows.filter(r => ["submitted","under_evaluation","won","lost"].includes(r.status ?? "")).length;
  const won = rows.filter(r => r.status === "won").length;
  for (const r of rows) {
    const s = r.status ?? "upcoming";
    if (!byStatus[s]) byStatus[s] = { count: 0, value: 0 };
    byStatus[s].count++;
    byStatus[s].value += Number(r.estimatedValue ?? 0);
    if (r.ourBidAmount) totalBidValue += Number(r.ourBidAmount);
    if (s === "won") wonValue += Number(r.estimatedValue ?? 0);
  }
  const successRate = submitted > 0 ? Math.round((won / submitted) * 100) : 0;
  res.json({ byStatus, totalBidValue, wonValue, successRate, total: rows.length });
});

router.get("/tenders/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [row] = await db.select().from(tendersTable).where(and(eq(tendersTable.id, req.params.id), org ? eq(tendersTable.organisationId, org) : undefined));
  if (!row) { res.status(404).json({ error: "Tender not found" }); return; }
  res.json(row);
});

router.post("/tenders", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  if (!org) { res.status(403).json({ error: "No organisation bound to your account" }); return; }
  const b = req.body ?? {};
  if (!b.title?.trim()) { res.status(400).json({ error: "Tender title required" }); return; }
  const [row] = await db.insert(tendersTable).values({
    organisationId: org, leadId: b.leadId || null, quotationId: b.quotationId || null,
    nitNumber: b.nitNumber?.trim() || null, title: String(b.title).trim(),
    tenderingAuthority: b.tenderingAuthority?.trim() || null, tenderType: b.tenderType ?? "open",
    workType: b.workType?.trim() || null, location: b.location?.trim() || null,
    estimatedValue: b.estimatedValue ? String(b.estimatedValue) : null,
    emdAmount: b.emdAmount ? String(b.emdAmount) : null,
    documentFee: b.documentFee ? String(b.documentFee) : null,
    documentFeeMode: b.documentFeeMode || null,
    bidSubmissionDate: b.bidSubmissionDate ? new Date(b.bidSubmissionDate) : null,
    openingDate: b.openingDate ? new Date(b.openingDate) : null,
    status: b.status ?? "upcoming", notes: b.notes?.trim() || null,
    assignedToId: b.assignedToId || null, createdById: ctx.userId ?? null,
  }).returning();
  await writeHistory(row.id, null, row.status ?? "upcoming", ctx.userId, "Created");
  res.status(201).json(row);
});

router.patch("/tenders/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select().from(tendersTable).where(and(eq(tendersTable.id, req.params.id), org ? eq(tendersTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Tender not found" }); return; }
  const b = req.body ?? {};
  const updates: Partial<typeof tendersTable.$inferInsert> = {};
  if (b.title !== undefined) updates.title = String(b.title).trim();
  if (b.nitNumber !== undefined) updates.nitNumber = b.nitNumber || null;
  if (b.tenderingAuthority !== undefined) updates.tenderingAuthority = b.tenderingAuthority || null;
  if (b.tenderType !== undefined) updates.tenderType = b.tenderType;
  if (b.workType !== undefined) updates.workType = b.workType || null;
  if (b.location !== undefined) updates.location = b.location || null;
  if (b.estimatedValue !== undefined) updates.estimatedValue = b.estimatedValue ? String(b.estimatedValue) : null;
  if (b.emdAmount !== undefined) updates.emdAmount = b.emdAmount ? String(b.emdAmount) : null;
  if (b.documentFee !== undefined) updates.documentFee = b.documentFee ? String(b.documentFee) : null;
  if (b.documentFeeMode !== undefined) updates.documentFeeMode = b.documentFeeMode || null;
  if (b.bidSubmissionDate !== undefined) updates.bidSubmissionDate = b.bidSubmissionDate ? new Date(b.bidSubmissionDate) : null;
  if (b.openingDate !== undefined) updates.openingDate = b.openingDate ? new Date(b.openingDate) : null;
  if (b.status !== undefined) updates.status = b.status;
  if (b.ourBidAmount !== undefined) updates.ourBidAmount = b.ourBidAmount ? String(b.ourBidAmount) : null;
  if (b.l1Amount !== undefined) updates.l1Amount = b.l1Amount ? String(b.l1Amount) : null;
  if (b.loaDate !== undefined) updates.loaDate = b.loaDate ? new Date(b.loaDate) : null;
  if (b.loaReference !== undefined) updates.loaReference = b.loaReference || null;
  if (b.emdRefunded !== undefined) updates.emdRefunded = Boolean(b.emdRefunded);
  if (b.lostReason !== undefined) updates.lostReason = b.lostReason || null;
  if (b.notes !== undefined) updates.notes = b.notes || null;
  if (b.leadId !== undefined) updates.leadId = b.leadId || null;
  if (b.quotationId !== undefined) updates.quotationId = b.quotationId || null;
  if (b.convertedToProjectId !== undefined) updates.convertedToProjectId = b.convertedToProjectId || null;
  if (b.assignedToId !== undefined) updates.assignedToId = b.assignedToId || null;
  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(tendersTable).set(updates).where(eq(tendersTable.id, req.params.id)).returning();
  if (b.status !== undefined && b.status !== existing.status) {
    await writeHistory(req.params.id, existing.status, b.status, ctx.userId, b.reason || null);
  }
  res.json(updated);
});

router.delete("/tenders/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: tendersTable.id }).from(tendersTable).where(and(eq(tendersTable.id, req.params.id), org ? eq(tendersTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Tender not found" }); return; }
  await db.delete(tendersTable).where(eq(tendersTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
