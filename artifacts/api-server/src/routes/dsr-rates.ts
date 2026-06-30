import { Router, type IRouter, type Request, type Response } from "express";
import { db, dsrRatesTable } from "@workspace/db";
import { eq, ilike, and, or } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { n, d, dReq } from "../lib/serialize";

const router: IRouter = Router();

function serializeDsrRate(r: any) {
  return {
    id: r.id,
    code: r.code,
    description: r.description,
    trade: r.trade,
    unit: r.unit,
    state: r.state,
    cityTier: r.cityTier,
    rate: n(r.rate),
    effectiveYear: r.effectiveYear ?? 2024,
    source: r.source ?? "DSR",
    createdById: r.createdById ?? null,
    createdAt: dReq(r.createdAt),
    updatedAt: dReq(r.updatedAt),
  };
}

router.get("/dsr-rates", requireAuth, async (req: Request, res: Response) => {
  const { q, trade, state, cityTier } = req.query as Record<string, string>;
  let query = db.select().from(dsrRatesTable);
  const conditions: any[] = [];
  if (q) conditions.push(or(ilike(dsrRatesTable.description, `%${q}%`), ilike(dsrRatesTable.code, `%${q}%`)));
  if (trade) conditions.push(eq(dsrRatesTable.trade, trade));
  if (state) conditions.push(eq(dsrRatesTable.state, state));
  if (cityTier) conditions.push(eq(dsrRatesTable.cityTier, cityTier));
  const rows = conditions.length
    ? await (query as any).where(and(...conditions))
    : await query;
  res.json(rows.map(serializeDsrRate));
});

router.post(
  "/dsr-rates",
  requireAuth,
  requireRole("qs", "admin", "owner"),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.code || !b.description || !b.trade || !b.unit || !b.state || !b.rate) {
      res.status(400).json({ error: "code, description, trade, unit, state, rate required" });
      return;
    }
    const [row] = await db.insert(dsrRatesTable).values({
      code: b.code,
      description: b.description,
      trade: b.trade,
      unit: b.unit,
      state: b.state,
      cityTier: b.cityTier ?? "T2",
      rate: String(n(b.rate)),
      effectiveYear: b.effectiveYear ?? 2024,
      source: b.source ?? "DSR",
      createdById: req.user!.id,
    }).returning();
    res.status(201).json(serializeDsrRate(row));
  },
);

router.patch(
  "/dsr-rates/:rateId",
  requireAuth,
  requireRole("qs", "admin", "owner"),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = {};
    for (const k of ["description", "trade", "unit", "state", "cityTier", "source"]) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if (b.rate !== undefined) update.rate = String(n(b.rate));
    if (b.effectiveYear !== undefined) update.effectiveYear = b.effectiveYear;
    const [row] = await db.update(dsrRatesTable).set(update as any).where(eq(dsrRatesTable.id, req.params.rateId)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeDsrRate(row));
  },
);

router.delete(
  "/dsr-rates/:rateId",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    await db.delete(dsrRatesTable).where(eq(dsrRatesTable.id, req.params.rateId));
    res.status(204).end();
  },
);

export default router;
