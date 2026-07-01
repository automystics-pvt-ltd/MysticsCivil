import { Router, type IRouter, type Request, type Response } from "express";
import { db, customersTable, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx } from "../lib/access";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();

// All customers endpoints require the pre_award plan feature.
router.use("/customers", requirePlanFeature("pre_award"));

router.get("/customers", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const { search } = req.query as Record<string, string>;
  const rows = await db.select().from(customersTable).where(org ? eq(customersTable.organisationId, org) : undefined).orderBy(desc(customersTable.updatedAt));
  const filtered = search ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || (r.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())) : rows;
  res.json(filtered);
});

router.get("/customers/stats", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const rows = await db.select({ clientType: customersTable.clientType }).from(customersTable).where(org ? eq(customersTable.organisationId, org) : undefined);
  const byType: Record<string, number> = {};
  for (const r of rows) {
    const t = r.clientType ?? "private";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  res.json({ byType, total: rows.length });
});

router.get("/customers/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [row] = await db.select().from(customersTable).where(and(eq(customersTable.id, req.params.id), org ? eq(customersTable.organisationId, org) : undefined));
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(row);
});

router.post("/customers", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  if (!org) { res.status(403).json({ error: "No organisation bound to your account" }); return; }
  const b = req.body ?? {};
  if (!b.name?.trim()) { res.status(400).json({ error: "Customer name required" }); return; }
  const [row] = await db.insert(customersTable).values({
    organisationId: org, leadId: b.leadId || null, name: String(b.name).trim(),
    contactPerson: b.contactPerson?.trim() || null, email: b.email?.trim() || null,
    phone: b.phone?.trim() || null, gstin: b.gstin?.trim() || null, pan: b.pan?.trim() || null,
    address: b.address?.trim() || null, country: b.country?.trim() || null,
    city: b.city?.trim() || null, state: b.state?.trim() || null,
    pincode: b.pincode?.trim() || null, clientType: b.clientType ?? "private",
    notes: b.notes?.trim() || null, createdById: ctx.userId ?? null,
  }).returning();
  await db.insert(statusHistoryTable).values({ entityType: "customer", entityId: row.id, fromStatus: null, toStatus: "created", changedById: ctx.userId, reason: "Created" });
  res.status(201).json(row);
});

router.patch("/customers/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: customersTable.id }).from(customersTable).where(and(eq(customersTable.id, req.params.id), org ? eq(customersTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
  const b = req.body ?? {};
  const updates: Partial<typeof customersTable.$inferInsert> = {};
  if (b.name !== undefined) updates.name = String(b.name).trim();
  if (b.leadId !== undefined) updates.leadId = b.leadId || null;
  if (b.contactPerson !== undefined) updates.contactPerson = b.contactPerson || null;
  if (b.email !== undefined) updates.email = b.email || null;
  if (b.phone !== undefined) updates.phone = b.phone || null;
  if (b.gstin !== undefined) updates.gstin = b.gstin || null;
  if (b.pan !== undefined) updates.pan = b.pan || null;
  if (b.address !== undefined) updates.address = b.address || null;
  if (b.country !== undefined) updates.country = b.country || null;
  if (b.city !== undefined) updates.city = b.city || null;
  if (b.state !== undefined) updates.state = b.state || null;
  if (b.pincode !== undefined) updates.pincode = b.pincode || null;
  if (b.clientType !== undefined) updates.clientType = b.clientType;
  if (b.notes !== undefined) updates.notes = b.notes || null;
  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(customersTable).set(updates).where(eq(customersTable.id, req.params.id)).returning();
  res.json(updated);
});

router.delete("/customers/:id", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const org = ctx.organisationId;
  const [existing] = await db.select({ id: customersTable.id }).from(customersTable).where(and(eq(customersTable.id, req.params.id), org ? eq(customersTable.organisationId, org) : undefined));
  if (!existing) { res.status(404).json({ error: "Customer not found" }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
