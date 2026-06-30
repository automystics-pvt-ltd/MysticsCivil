import { Router, type IRouter, type Request, type Response } from "express";
import { db, leadsTable, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx } from "../lib/access";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();

// All leads endpoints require the pre_award plan feature.
router.use("/leads", requirePlanFeature("pre_award"));

async function writeHistory(entityId: string, fromStatus: string | null, toStatus: string, changedById: string | null, reason?: string) {
  await db.insert(statusHistoryTable).values({ entityType: "lead", entityId, fromStatus, toStatus, changedById, reason: reason ?? null });
}

router.get("/leads", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const { stage, search } = req.query as Record<string, string>;
  const rows = await db.select().from(leadsTable).where(
    and(org ? eq(leadsTable.organisationId, org) : undefined, stage ? eq(leadsTable.stage, stage) : undefined)
  ).orderBy(desc(leadsTable.updatedAt));
  const filtered = search ? rows.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || r.clientName.toLowerCase().includes(search.toLowerCase())) : rows;
  res.json(filtered);
});

router.get("/leads/stats", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const rows = await db.select({ stage: leadsTable.stage, estimatedValue: leadsTable.estimatedValue }).from(leadsTable).where(org ? eq(leadsTable.organisationId, org) : undefined);
  const byStage: Record<string, { count: number; value: number }> = {};
  let pipelineValue = 0, wonValue = 0;
  for (const r of rows) {
    const s = r.stage ?? "prospect";
    if (!byStage[s]) byStage[s] = { count: 0, value: 0 };
    byStage[s].count++;
    const v = Number(r.estimatedValue ?? 0);
    byStage[s].value += v;
    if (s !== "lost" && s !== "won") pipelineValue += v;
    if (s === "won") wonValue += v;
  }
  res.json({ byStage, pipelineValue, wonValue, total: rows.length });
});

router.get("/leads/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [row] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, req.params.id), org ? eq(leadsTable.organisationId, org) : undefined));
  if (!row) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(row);
});

router.post("/leads", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  if (!org) { res.status(403).json({ error: "No organisation bound to your account" }); return; }
  const b = req.body ?? {};
  if (!b.title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  if (!b.clientName?.trim()) { res.status(400).json({ error: "Client name required" }); return; }
  const [row] = await db.insert(leadsTable).values({
    organisationId: org, title: String(b.title).trim(), clientName: String(b.clientName).trim(),
    clientContact: b.clientContact?.trim() || null, email: b.email?.trim() || null, phone: b.phone?.trim() || null,
    location: b.location?.trim() || null, workType: b.workType?.trim() || null,
    estimatedValue: b.estimatedValue ? String(b.estimatedValue) : null,
    stage: b.stage ?? "prospect", source: b.source ?? "direct", probability: Number(b.probability ?? 20),
    expectedCloseDate: b.expectedCloseDate ? new Date(b.expectedCloseDate) : null,
    notes: b.notes?.trim() || null, assignedToId: b.assignedToId || null, createdById: ctx.userId ?? null,
  }).returning();
  await writeHistory(row.id, null, row.stage ?? "prospect", ctx.userId, "Created");
  res.status(201).json(row);
});

router.patch("/leads/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, req.params.id), org ? eq(leadsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  const b = req.body ?? {};
  const updates: Partial<typeof leadsTable.$inferInsert> = {};
  if (b.title !== undefined) updates.title = String(b.title).trim();
  if (b.clientName !== undefined) updates.clientName = String(b.clientName).trim();
  if (b.clientContact !== undefined) updates.clientContact = b.clientContact || null;
  if (b.email !== undefined) updates.email = b.email || null;
  if (b.phone !== undefined) updates.phone = b.phone || null;
  if (b.location !== undefined) updates.location = b.location || null;
  if (b.workType !== undefined) updates.workType = b.workType || null;
  if (b.estimatedValue !== undefined) updates.estimatedValue = b.estimatedValue ? String(b.estimatedValue) : null;
  if (b.stage !== undefined) updates.stage = b.stage;
  if (b.source !== undefined) updates.source = b.source;
  if (b.probability !== undefined) updates.probability = Number(b.probability);
  if (b.expectedCloseDate !== undefined) updates.expectedCloseDate = b.expectedCloseDate ? new Date(b.expectedCloseDate) : null;
  if (b.notes !== undefined) updates.notes = b.notes || null;
  if (b.lostReason !== undefined) updates.lostReason = b.lostReason || null;
  if (b.assignedToId !== undefined) updates.assignedToId = b.assignedToId || null;
  if (b.convertedToProjectId !== undefined) updates.convertedToProjectId = b.convertedToProjectId || null;
  if (b.customerId !== undefined) updates.customerId = b.customerId || null;
  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, req.params.id)).returning();
  if (b.stage !== undefined && b.stage !== existing.stage) {
    await writeHistory(req.params.id, existing.stage, b.stage, ctx.userId, b.stageReason || null);
  }
  res.json(updated);
});

router.delete("/leads/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(eq(leadsTable.id, req.params.id), org ? eq(leadsTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  await db.delete(leadsTable).where(eq(leadsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
