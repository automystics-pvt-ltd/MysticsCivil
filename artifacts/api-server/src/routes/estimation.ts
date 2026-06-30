import { Router, type IRouter, type Request, type Response } from "express";
import ExcelJS from "exceljs";
import multer from "multer";
import {
  db,
  estimatesTable,
  estimateCostHeadsTable,
  boqItemsTable,
  rateAnalysisComponentsTable,
  dsrRatesTable,
  wbsActivitiesTable,
  workOrderEstimatesTable,
  workOrderEstimateItemsTable,
  variationOrdersTable,
} from "@workspace/db";
import { eq, asc, and, sql } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { n, nOrNull, d, dReq } from "../lib/serialize";
import { requirePlanFeature } from "../lib/subscription";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Feature gate: all estimation-specific paths require the advanced_estimations plan feature.
const planGate = requirePlanFeature("advanced_estimations");
router.use("/projects/:projectId/estimates", planGate);
router.use("/projects/:projectId/boq-vs-actual", planGate);
router.use("/projects/:projectId/work-orders", planGate);
router.use("/estimates", planGate);
router.use("/boq-items", planGate);
router.use("/work-orders", planGate);

const DEFAULT_L1_HEADS = [
  { code: "CIV", name: "Civil Works", pct: 35, sort: 0 },
  { code: "FIN", name: "Finishing", pct: 18, sort: 1 },
  { code: "MEP", name: "MEP Services", pct: 15, sort: 2 },
  { code: "EXT", name: "External Development", pct: 5, sort: 3 },
  { code: "PRE", name: "Preliminaries", pct: 7, sort: 4 },
  { code: "FEE", name: "Professional Fees", pct: 4, sort: 5 },
  { code: "STA", name: "Statutory Charges", pct: 3, sort: 6 },
  { code: "IDC", name: "Interest During Construction", pct: 4, sort: 7 },
  { code: "CON", name: "Contingency", pct: 5, sort: 8 },
  { code: "GST", name: "GST", pct: 4, sort: 9 },
];

function serializeEstimate(e: any) {
  return {
    id: e.id,
    projectId: e.projectId,
    level: e.level,
    name: e.name,
    status: e.status,
    totalAmount: n(e.totalAmount),
    notes: e.notes ?? null,
    metadata: e.metadata ?? null,
    createdById: e.createdById ?? null,
    approvedById: e.approvedById ?? null,
    approvedAt: d(e.approvedAt),
    createdAt: dReq(e.createdAt),
    updatedAt: dReq(e.updatedAt),
  };
}

function serializeCostHead(h: any) {
  return {
    id: h.id,
    estimateId: h.estimateId,
    headCode: h.headCode,
    headName: h.headName,
    percentage: n(h.percentage),
    amount: n(h.amount),
    sortOrder: h.sortOrder ?? 0,
  };
}

function serializeBoqItem(i: any) {
  return {
    id: i.id,
    estimateId: i.estimateId,
    projectId: i.projectId,
    wbsActivityId: i.wbsActivityId ?? null,
    dsrRateId: i.dsrRateId ?? null,
    levelType: i.levelType,
    trade: i.trade,
    itemCode: i.itemCode ?? null,
    description: i.description,
    unit: i.unit,
    quantity: n(i.quantity),
    rate: n(i.rate),
    amount: n(i.amount),
    actualQuantity: n(i.actualQuantity),
    actualAmount: n(i.actualAmount),
    hsnCode: i.hsnCode ?? null,
    gstRate: n(i.gstRate),
    locked: !!i.locked,
    sortOrder: i.sortOrder ?? 0,
    createdAt: dReq(i.createdAt),
  };
}

function serializeRaComponent(c: any) {
  return {
    id: c.id,
    boqItemId: c.boqItemId,
    componentType: c.componentType,
    description: c.description,
    unit: c.unit,
    quantity: n(c.quantity),
    marketRate: n(c.marketRate),
    dsrRate: n(c.dsrRate),
    amount: n(c.amount),
    sortOrder: c.sortOrder ?? 0,
  };
}

function serializeWorkOrder(w: any) {
  return {
    id: w.id,
    projectId: w.projectId,
    l3EstimateId: w.l3EstimateId ?? null,
    subcontractor: w.subcontractor,
    workPackage: w.workPackage,
    status: w.status,
    totalBoqAmount: n(w.totalBoqAmount),
    totalNegotiatedAmount: n(w.totalNegotiatedAmount),
    notes: w.notes ?? null,
    createdById: w.createdById ?? null,
    createdAt: dReq(w.createdAt),
    updatedAt: dReq(w.updatedAt),
  };
}

function serializeWorkOrderItem(i: any) {
  return {
    id: i.id,
    workOrderEstimateId: i.workOrderEstimateId,
    boqItemId: i.boqItemId ?? null,
    description: i.description,
    unit: i.unit,
    quantity: n(i.quantity),
    boqRate: n(i.boqRate),
    negotiatedRate: n(i.negotiatedRate),
    negotiatedAmount: n(i.negotiatedAmount),
    sortOrder: i.sortOrder ?? 0,
  };
}

// ── Estimates ──────────────────────────────────────────────────

router.get(
  "/projects/:projectId/estimates",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(estimatesTable)
      .where(eq(estimatesTable.projectId, req.params.projectId))
      .orderBy(asc(estimatesTable.createdAt));
    res.json(rows.map(serializeEstimate));
  },
);

router.post(
  "/projects/:projectId/estimates",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.level || !b.name) {
      res.status(400).json({ error: "level and name required" });
      return;
    }
    const [est] = await db
      .insert(estimatesTable)
      .values({
        projectId: req.params.projectId,
        level: b.level,
        name: b.name,
        notes: b.notes ?? null,
        metadata: b.metadata ?? null,
        totalAmount: b.totalAmount !== undefined ? String(b.totalAmount) : "0",
        createdById: req.user!.id,
      })
      .returning();

    if (b.level === "L1" && !b.skipDefaultHeads) {
      const total = n(est.totalAmount);
      await db.insert(estimateCostHeadsTable).values(
        DEFAULT_L1_HEADS.map((h) => ({
          estimateId: est.id,
          headCode: h.code,
          headName: h.name,
          percentage: String(h.pct),
          amount: String((total * h.pct) / 100),
          sortOrder: h.sort,
        })),
      );
    }
    res.status(201).json(serializeEstimate(est));
  },
);

router.get(
  "/estimates/:estimateId",
  requireAuth,
  async (req: Request, res: Response) => {
    const [est] = await db
      .select()
      .from(estimatesTable)
      .where(eq(estimatesTable.id, req.params.estimateId));
    if (!est) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeEstimate(est));
  },
);

router.patch(
  "/estimates/:estimateId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (b.name !== undefined) update.name = b.name;
    if (b.notes !== undefined) update.notes = b.notes;
    if (b.status !== undefined) update.status = b.status;
    if (b.totalAmount !== undefined) update.totalAmount = String(b.totalAmount);
    if (b.metadata !== undefined) update.metadata = b.metadata;
    if (b.status === "approved") {
      update.approvedById = req.user!.id;
      update.approvedAt = new Date();
    }
    const [current] = await db
      .select({ status: estimatesTable.status })
      .from(estimatesTable)
      .where(eq(estimatesTable.id, req.params.estimateId));

    // VO-gated unlock: moving a locked estimate out of "locked" requires an approved VO
    if (b.status !== undefined && b.status !== "locked" && current?.status === "locked") {
      const [approvedVO] = await db
        .select({ id: variationOrdersTable.id })
        .from(variationOrdersTable)
        .where(and(
          eq(variationOrdersTable.estimateId, req.params.estimateId),
          eq(variationOrdersTable.status, "approved"),
        ));
      if (!approvedVO) {
        res.status(409).json({
          error: "Cannot unlock a locked estimate without an approved Variation Order linked to this estimate. Raise a VO, get it approved, then unlock.",
        });
        return;
      }
    }

    const [est] = await db
      .update(estimatesTable)
      .set(update as any)
      .where(eq(estimatesTable.id, req.params.estimateId))
      .returning();
    if (!est) { res.status(404).json({ error: "Not found" }); return; }
    // Auto-lock all BOQ items when estimate is locked; auto-unlock when moving out of locked
    if (b.status === "locked") {
      await db.update(boqItemsTable).set({ locked: true }).where(eq(boqItemsTable.estimateId, req.params.estimateId));
    } else if (b.status !== undefined && b.status !== "locked" && current?.status === "locked") {
      await db.update(boqItemsTable).set({ locked: false }).where(eq(boqItemsTable.estimateId, req.params.estimateId));
    }
    res.json(serializeEstimate(est));
  },
);

router.delete(
  "/estimates/:estimateId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    await db.delete(estimatesTable).where(eq(estimatesTable.id, req.params.estimateId));
    res.status(204).end();
  },
);

// ── Cost Heads (L1) ────────────────────────────────────────────

router.get(
  "/estimates/:estimateId/cost-heads",
  requireAuth,
  async (req: Request, res: Response) => {
    const heads = await db
      .select()
      .from(estimateCostHeadsTable)
      .where(eq(estimateCostHeadsTable.estimateId, req.params.estimateId))
      .orderBy(asc(estimateCostHeadsTable.sortOrder));
    res.json(heads.map(serializeCostHead));
  },
);

router.put(
  "/estimates/:estimateId/cost-heads",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const heads: any[] = Array.isArray(req.body) ? req.body : [];
    await db.transaction(async (tx) => {
      await tx.delete(estimateCostHeadsTable).where(eq(estimateCostHeadsTable.estimateId, req.params.estimateId));
      if (heads.length) {
        await tx.insert(estimateCostHeadsTable).values(
          heads.map((h, i) => ({
            estimateId: req.params.estimateId,
            headCode: h.headCode,
            headName: h.headName,
            percentage: String(h.percentage ?? 0),
            amount: String(h.amount ?? 0),
            sortOrder: i,
          })),
        );
      }
      const total = heads.reduce((s, h) => s + n(h.amount), 0);
      await tx
        .update(estimatesTable)
        .set({ totalAmount: String(total) })
        .where(eq(estimatesTable.id, req.params.estimateId));
    });
    const result = await db
      .select()
      .from(estimateCostHeadsTable)
      .where(eq(estimateCostHeadsTable.estimateId, req.params.estimateId))
      .orderBy(asc(estimateCostHeadsTable.sortOrder));
    res.json(result.map(serializeCostHead));
  },
);

// ── BOQ Items (L2 / L3) ────────────────────────────────────────

router.get(
  "/estimates/:estimateId/boq-items",
  requireAuth,
  async (req: Request, res: Response) => {
    const items = await db
      .select()
      .from(boqItemsTable)
      .where(eq(boqItemsTable.estimateId, req.params.estimateId))
      .orderBy(asc(boqItemsTable.sortOrder));
    res.json(items.map(serializeBoqItem));
  },
);

// BOQ Excel Export ── GET /estimates/:estimateId/boq-items/export
router.get(
  "/estimates/:estimateId/boq-items/export",
  requireAuth,
  async (req: Request, res: Response) => {
    const [est] = await db.select({ name: estimatesTable.name, level: estimatesTable.level })
      .from(estimatesTable).where(eq(estimatesTable.id, req.params.estimateId));
    const items = await db
      .select()
      .from(boqItemsTable)
      .where(eq(boqItemsTable.estimateId, req.params.estimateId))
      .orderBy(asc(boqItemsTable.trade), asc(boqItemsTable.sortOrder));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOQ");
    ws.columns = [
      { header: "#", width: 4 },
      { header: "Trade", width: 18 },
      { header: "Item Code", width: 10 },
      { header: "Description", width: 55 },
      { header: "Unit", width: 8 },
      { header: "Quantity", width: 12 },
      { header: "Rate (INR)", width: 14 },
      { header: "Amount (INR)", width: 16 },
      { header: "GST %", width: 7 },
      { header: "HSN Code", width: 12 },
      { header: "Locked", width: 7 },
    ];
    items.forEach((item, idx) => {
      ws.addRow([
        idx + 1,
        item.trade ?? "",
        item.itemCode ?? "",
        item.description ?? "",
        item.unit ?? "",
        n(item.quantity),
        n(item.rate),
        n(item.amount),
        n(item.gstRate),
        item.hsnCode ?? "",
        item.locked ? "Yes" : "No",
      ]);
    });
    const buf = await wb.xlsx.writeBuffer();
    const filename = `BOQ_${est?.level ?? "L3"}_${req.params.estimateId.slice(0, 8)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  },
);

// BOQ Abstract Generator ── POST /estimates/:estimateId/boq-items/generate-abstract
router.post(
  "/estimates/:estimateId/boq-items/generate-abstract",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const builtUpArea = n(b.builtUpArea ?? 0);
    if (builtUpArea <= 0) {
      res.status(400).json({ error: "builtUpArea must be > 0 (sqm)" }); return;
    }
    const cityTier = b.cityTier ?? "T1";
    const state = b.state ?? "Maharashtra";

    const [est] = await db.select({ projectId: estimatesTable.projectId, status: estimatesTable.status })
      .from(estimatesTable).where(eq(estimatesTable.id, req.params.estimateId));
    if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
    if (est.status === "locked") { res.status(409).json({ error: "Estimate is locked" }); return; }

    // Fetch DSR rates for the given state/cityTier
    const rates = await db.select().from(dsrRatesTable)
      .where(and(eq(dsrRatesTable.cityTier, cityTier), eq(dsrRatesTable.state, state)));

    // Group by trade: first item's description+unit as representative, average rate
    const byTrade = new Map<string, { description: string; unit: string; avgRate: number; dsrRateId: string; count: number }>();
    for (const r of rates) {
      const ex = byTrade.get(r.trade);
      if (!ex) {
        byTrade.set(r.trade, { description: r.description, unit: r.unit, avgRate: Number(r.rate), dsrRateId: r.id, count: 1 });
      } else {
        byTrade.set(r.trade, { ...ex, avgRate: (ex.avgRate * ex.count + Number(r.rate)) / (ex.count + 1), count: ex.count + 1 });
      }
    }
    if (byTrade.size === 0) {
      res.status(404).json({ error: `No DSR rates found for state="${state}", cityTier="${cityTier}" — seed DSR rates first` }); return;
    }

    // Clear existing BOQ items for this estimate (fresh abstract regeneration)
    await db.delete(boqItemsTable).where(eq(boqItemsTable.estimateId, req.params.estimateId));

    // Create one abstract row per trade
    const created: ReturnType<typeof serializeBoqItem>[] = [];
    let i = 0;
    for (const [trade, data] of byTrade) {
      const rate = Math.round(data.avgRate);
      const qty = builtUpArea;
      const [item] = await db.insert(boqItemsTable).values({
        estimateId: req.params.estimateId,
        projectId: est.projectId,
        dsrRateId: data.dsrRateId,
        levelType: "L2",
        trade,
        description: `${trade} — abstract at DSR benchmark (${state}, ${cityTier})`,
        unit: "sqm",
        quantity: String(qty),
        rate: String(rate),
        amount: String(qty * rate),
        actualQuantity: "0",
        actualAmount: "0",
        gstRate: "18",
        sortOrder: i++,
      }).returning();
      created.push(serializeBoqItem(item));
    }

    // Recompute estimate totalAmount
    const total = created.reduce((s, item) => s + item.amount, 0);
    await db.update(estimatesTable)
      .set({ totalAmount: String(total) })
      .where(eq(estimatesTable.id, req.params.estimateId));

    res.json(created);
  },
);

// BOQ Excel Import ── POST /estimates/:estimateId/boq-items/import
router.post(
  "/estimates/:estimateId/boq-items/import",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
    if (!file) { res.status(400).json({ error: "No file uploaded — send multipart/form-data with field 'file'" }); return; }
    const [est] = await db
      .select({ projectId: estimatesTable.projectId, status: estimatesTable.status })
      .from(estimatesTable).where(eq(estimatesTable.id, req.params.estimateId));
    if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
    if (est.status === "locked") {
      res.status(409).json({ error: "Estimate is locked — unlock it before importing BOQ items" });
      return;
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer);
    const ws = wb.worksheets[0];
    const raw: any[][] = [];
    ws.eachRow((row) => { raw.push(row.values as any[]); });
    // ExcelJS row.values is 1-indexed (index 0 is null); normalise to 0-indexed
    const normalised = raw.map((r) => (r[0] === null || r[0] === undefined ? r.slice(1) : r));
    // Skip header row (row 0); skip rows missing a description (col index 3)
    const dataRows = normalised.slice(1).filter((r) => r.length > 3 && r[3]);
    const created: ReturnType<typeof serializeBoqItem>[] = [];
    for (const [i, row] of dataRows.entries()) {
      // Columns: #(0), Trade(1), Item Code(2), Description(3), Unit(4),
      //          Quantity(5), Rate INR(6), Amount INR(7), GST %(8), HSN(9)
      const trade = String(row[1] ?? "General");
      const itemCode = row[2] ? String(row[2]) : null;
      const description = String(row[3] ?? "");
      const unit = String(row[4] ?? "LS");
      const qty = n(row[5] ?? 0);
      const rate = n(row[6] ?? 0);
      const gstRate = n(row[8] ?? 18);
      const hsnCode = row[9] ? String(row[9]) : null;
      const [item] = await db.insert(boqItemsTable).values({
        estimateId: req.params.estimateId,
        projectId: est.projectId,
        levelType: "L3",
        trade,
        itemCode,
        description,
        unit,
        quantity: String(qty),
        rate: String(rate),
        amount: String(qty * rate),
        actualQuantity: "0",
        actualAmount: "0",
        hsnCode,
        gstRate: String(gstRate),
        sortOrder: i,
      }).returning();
      created.push(serializeBoqItem(item));
    }
    res.status(201).json(created);
  },
);

router.post(
  "/estimates/:estimateId/boq-items",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.description || !b.unit || !b.trade) {
      res.status(400).json({ error: "description, unit, trade required" });
      return;
    }
    const [est] = await db.select({ projectId: estimatesTable.projectId, locked: estimatesTable.status })
      .from(estimatesTable).where(eq(estimatesTable.id, req.params.estimateId));
    if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
    if (est.locked === "locked") { res.status(409).json({ error: "Estimate is locked" }); return; }
    const qty = n(b.quantity ?? 0);
    const rate = n(b.rate ?? 0);
    const [item] = await db.insert(boqItemsTable).values({
      estimateId: req.params.estimateId,
      projectId: est.projectId,
      wbsActivityId: b.wbsActivityId ?? null,
      dsrRateId: b.dsrRateId ?? null,
      levelType: b.levelType ?? "L3",
      trade: b.trade,
      itemCode: b.itemCode ?? null,
      description: b.description,
      unit: b.unit,
      quantity: String(qty),
      rate: String(rate),
      amount: String(qty * rate),
      actualQuantity: String(n(b.actualQuantity ?? 0)),
      actualAmount: String(n(b.actualAmount ?? 0)),
      hsnCode: b.hsnCode ?? null,
      gstRate: String(n(b.gstRate ?? 18)),
      sortOrder: b.sortOrder ?? 0,
    }).returning();
    res.status(201).json(serializeBoqItem(item));
  },
);

router.patch(
  "/boq-items/:itemId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const [existing] = await db.select().from(boqItemsTable).where(eq(boqItemsTable.id, req.params.itemId));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // Locked items: only actual progress fields (actualQuantity / actualAmount) may be updated.
    // All scope changes (qty, rate, description, trade) require a VO to unlock the estimate first.
    if (existing.locked) {
      const scopeFields = ["quantity", "rate", "description", "trade", "unit", "itemCode", "levelType"];
      const hasScopeChange = scopeFields.some(k => b[k] !== undefined);
      if (hasScopeChange) {
        res.status(409).json({
          error: "BOQ item is locked — raise a Variation Order and lock the estimate back to modify scope fields. Only actualQuantity and actualAmount may be updated on locked items.",
        });
        return;
      }
    }

    const update: Record<string, unknown> = {};
    // Scope fields — only allowed on unlocked items (checked above)
    for (const k of ["description", "unit", "trade", "itemCode", "hsnCode", "levelType", "wbsActivityId", "dsrRateId"]) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if ((b.quantity !== undefined || b.rate !== undefined) && !existing.locked) {
      const qty = n(b.quantity ?? existing.quantity);
      const rate = n(b.rate ?? existing.rate);
      update.quantity = String(qty);
      update.rate = String(rate);
      update.amount = String(qty * rate);
    }
    if (b.gstRate !== undefined && !existing.locked) update.gstRate = String(n(b.gstRate));
    // Progress fields — always allowed (record actual site progress regardless of lock)
    if (b.actualQuantity !== undefined || b.actualAmount !== undefined) {
      update.actualQuantity = String(n(b.actualQuantity ?? existing.actualQuantity));
      update.actualAmount = String(n(b.actualAmount ?? existing.actualAmount));
    }
    // locked is system-controlled (via estimate status) — never accept from client

    const [item] = await db.update(boqItemsTable).set(update as any).where(eq(boqItemsTable.id, req.params.itemId)).returning();
    res.json(serializeBoqItem(item));
  },
);

router.delete(
  "/boq-items/:itemId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const [item] = await db.select({ locked: boqItemsTable.locked }).from(boqItemsTable).where(eq(boqItemsTable.id, req.params.itemId));
    if (item?.locked) { res.status(409).json({ error: "Cannot delete locked BOQ item" }); return; }
    await db.delete(boqItemsTable).where(eq(boqItemsTable.id, req.params.itemId));
    res.status(204).end();
  },
);

// ── BOQ vs Actual comparison ───────────────────────────────────

router.get(
  "/projects/:projectId/boq-vs-actual",
  requireAuth,
  async (req: Request, res: Response) => {
    const items = await db
      .select()
      .from(boqItemsTable)
      .where(and(eq(boqItemsTable.projectId, req.params.projectId), eq(boqItemsTable.levelType, "L3")))
      .orderBy(asc(boqItemsTable.trade), asc(boqItemsTable.sortOrder));

    const result = items.map((i) => {
      const boqRate = n(i.rate);
      const actualRate = n(i.actualQuantity) > 0 ? n(i.actualAmount) / n(i.actualQuantity) : 0;
      const variancePct = boqRate > 0 ? ((actualRate - boqRate) / boqRate) * 100 : 0;
      const alert = Math.abs(variancePct) > 10 ? "red" : Math.abs(variancePct) > 5 ? "amber" : "green";
      return {
        ...serializeBoqItem(i),
        actualRate,
        variancePct: parseFloat(variancePct.toFixed(2)),
        alert,
      };
    });
    const counts = { green: 0, amber: 0, red: 0 };
    for (const r of result) counts[r.alert as keyof typeof counts]++;
    res.json({ items: result, counts });
  },
);

// ── Rate Analysis (L4) ─────────────────────────────────────────

router.get(
  "/boq-items/:itemId/rate-analysis",
  requireAuth,
  async (req: Request, res: Response) => {
    const components = await db
      .select()
      .from(rateAnalysisComponentsTable)
      .where(eq(rateAnalysisComponentsTable.boqItemId, req.params.itemId))
      .orderBy(asc(rateAnalysisComponentsTable.sortOrder));
    res.json(components.map(serializeRaComponent));
  },
);

router.put(
  "/boq-items/:itemId/rate-analysis",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const components: any[] = Array.isArray(req.body) ? req.body : [];
    await db.transaction(async (tx) => {
      await tx.delete(rateAnalysisComponentsTable).where(eq(rateAnalysisComponentsTable.boqItemId, req.params.itemId));
      if (components.length) {
        await tx.insert(rateAnalysisComponentsTable).values(
          components.map((c, i) => ({
            boqItemId: req.params.itemId,
            componentType: c.componentType,
            description: c.description,
            unit: c.unit,
            quantity: String(n(c.quantity)),
            marketRate: String(n(c.marketRate)),
            dsrRate: String(n(c.dsrRate)),
            amount: String(n(c.quantity) * n(c.marketRate)),
            sortOrder: i,
          })),
        );
      }
    });
    const result = await db
      .select()
      .from(rateAnalysisComponentsTable)
      .where(eq(rateAnalysisComponentsTable.boqItemId, req.params.itemId))
      .orderBy(asc(rateAnalysisComponentsTable.sortOrder));
    res.json(result.map(serializeRaComponent));
  },
);

// ── Work Order Estimates (L5) ──────────────────────────────────

router.get(
  "/projects/:projectId/work-orders",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(workOrderEstimatesTable)
      .where(eq(workOrderEstimatesTable.projectId, req.params.projectId))
      .orderBy(asc(workOrderEstimatesTable.createdAt));
    res.json(rows.map(serializeWorkOrder));
  },
);

router.post(
  "/projects/:projectId/work-orders",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.subcontractor || !b.workPackage) {
      res.status(400).json({ error: "subcontractor and workPackage required" });
      return;
    }
    const [wo] = await db.insert(workOrderEstimatesTable).values({
      projectId: req.params.projectId,
      l3EstimateId: b.l3EstimateId ?? null,
      subcontractor: b.subcontractor,
      workPackage: b.workPackage,
      status: "draft",
      notes: b.notes ?? null,
      createdById: req.user!.id,
    }).returning();
    res.status(201).json(serializeWorkOrder(wo));
  },
);

router.get(
  "/work-orders/:woId",
  requireAuth,
  async (req: Request, res: Response) => {
    const [wo] = await db.select().from(workOrderEstimatesTable).where(eq(workOrderEstimatesTable.id, req.params.woId));
    if (!wo) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeWorkOrder(wo));
  },
);

router.patch(
  "/work-orders/:woId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = {};
    for (const k of ["subcontractor", "workPackage", "status", "notes", "l3EstimateId"]) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    const [wo] = await db.update(workOrderEstimatesTable).set(update as any).where(eq(workOrderEstimatesTable.id, req.params.woId)).returning();
    if (!wo) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeWorkOrder(wo));
  },
);

router.get(
  "/work-orders/:woId/items",
  requireAuth,
  async (req: Request, res: Response) => {
    const items = await db
      .select()
      .from(workOrderEstimateItemsTable)
      .where(eq(workOrderEstimateItemsTable.workOrderEstimateId, req.params.woId))
      .orderBy(asc(workOrderEstimateItemsTable.sortOrder));
    res.json(items.map(serializeWorkOrderItem));
  },
);

router.put(
  "/work-orders/:woId/items",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const items: any[] = Array.isArray(req.body) ? req.body : [];
    await db.transaction(async (tx) => {
      await tx.delete(workOrderEstimateItemsTable).where(eq(workOrderEstimateItemsTable.workOrderEstimateId, req.params.woId));
      if (items.length) {
        await tx.insert(workOrderEstimateItemsTable).values(
          items.map((item, i) => ({
            workOrderEstimateId: req.params.woId,
            boqItemId: item.boqItemId ?? null,
            description: item.description,
            unit: item.unit,
            quantity: String(n(item.quantity)),
            boqRate: String(n(item.boqRate)),
            negotiatedRate: String(n(item.negotiatedRate)),
            negotiatedAmount: String(n(item.quantity) * n(item.negotiatedRate)),
            sortOrder: i,
          })),
        );
      }
      const totalBoq = items.reduce((s, i) => s + n(i.quantity) * n(i.boqRate), 0);
      const totalNeg = items.reduce((s, i) => s + n(i.quantity) * n(i.negotiatedRate), 0);
      await tx.update(workOrderEstimatesTable).set({
        totalBoqAmount: String(totalBoq),
        totalNegotiatedAmount: String(totalNeg),
      }).where(eq(workOrderEstimatesTable.id, req.params.woId));
    });
    const result = await db
      .select()
      .from(workOrderEstimateItemsTable)
      .where(eq(workOrderEstimateItemsTable.workOrderEstimateId, req.params.woId))
      .orderBy(asc(workOrderEstimateItemsTable.sortOrder));
    res.json(result.map(serializeWorkOrderItem));
  },
);

export default router;
