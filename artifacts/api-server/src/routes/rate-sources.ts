import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, rateSourcesTable, RATE_SOURCE_TYPES } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { n, dReq, d } from "../lib/serialize";
import {
  runSourceSync,
  normalizeRows,
  upsertRates,
  applyEscalation,
} from "../lib/rate-ingest";

const router: IRouter = Router();

const ADMIN_RATES = ["admin", "owner", "qs"] as const;

function serializeSource(r: any) {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    url: r.url,
    defaultState: r.defaultState,
    defaultSource: r.defaultSource,
    defaultEffectiveYear: r.defaultEffectiveYear,
    enabled: r.enabled,
    escalationPct: r.escalationPct !== null ? n(r.escalationPct) : null,
    escalationFilterTrade: r.escalationFilterTrade,
    escalationFilterState: r.escalationFilterState,
    escalationFromYear: r.escalationFromYear,
    escalationToYear: r.escalationToYear,
    lastSyncAt: d(r.lastSyncAt),
    lastSyncStatus: r.lastSyncStatus,
    lastSyncRowsInserted: r.lastSyncRowsInserted,
    lastSyncRowsUpdated: r.lastSyncRowsUpdated,
    lastSyncRowsSkipped: r.lastSyncRowsSkipped,
    lastSyncError: r.lastSyncError,
    createdAt: dReq(r.createdAt),
    updatedAt: dReq(r.updatedAt),
  };
}

router.get(
  "/rate-sources",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (_req: Request, res: Response) => {
    const rows = await db.select().from(rateSourcesTable).orderBy(desc(rateSourcesTable.createdAt));
    res.json(rows.map(serializeSource));
  },
);

router.post(
  "/rate-sources",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.label || !b.type) {
      res.status(400).json({ error: "label and type are required" });
      return;
    }
    if (!RATE_SOURCE_TYPES.includes(b.type)) {
      res.status(400).json({ error: `type must be one of ${RATE_SOURCE_TYPES.join(", ")}` });
      return;
    }
    if (b.type !== "escalation" && !b.url) {
      res.status(400).json({ error: "url is required for csv/json/gsheet sources" });
      return;
    }
    const [row] = await db.insert(rateSourcesTable).values({
      label: String(b.label),
      type: b.type,
      url: b.url ?? null,
      defaultState: b.defaultState ?? null,
      defaultSource: b.defaultSource ?? "DSR",
      defaultEffectiveYear: b.defaultEffectiveYear ?? null,
      enabled: b.enabled ?? true,
      escalationPct: b.escalationPct !== undefined && b.escalationPct !== null ? String(b.escalationPct) : null,
      escalationFilterTrade: b.escalationFilterTrade ?? null,
      escalationFilterState: b.escalationFilterState ?? null,
      escalationFromYear: b.escalationFromYear ?? null,
      escalationToYear: b.escalationToYear ?? null,
      createdById: req.user!.id,
    }).returning();
    res.status(201).json(serializeSource(row));
  },
);

router.patch(
  "/rate-sources/:id",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (b.type !== undefined && !RATE_SOURCE_TYPES.includes(b.type)) {
      res.status(400).json({ error: `type must be one of ${RATE_SOURCE_TYPES.join(", ")}` });
      return;
    }
    // Load current state so we can validate URL requirement against effective type.
    const [current] = await db.select().from(rateSourcesTable).where(eq(rateSourcesTable.id, String(req.params.id)));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    const effectiveType = b.type ?? current.type;
    const effectiveUrl = b.url !== undefined ? b.url : current.url;
    if (effectiveType !== "escalation" && !effectiveUrl) {
      res.status(400).json({ error: "url is required for csv/json/gsheet sources" });
      return;
    }
    const update: Record<string, unknown> = {};
    for (const k of [
      "label", "type", "url", "defaultState", "defaultSource", "defaultEffectiveYear",
      "enabled", "escalationFilterTrade", "escalationFilterState",
      "escalationFromYear", "escalationToYear",
    ]) {
      if (b[k] !== undefined) update[k] = b[k];
    }
    if (b.escalationPct !== undefined) {
      update.escalationPct = b.escalationPct === null ? null : String(b.escalationPct);
    }
    const [row] = await db.update(rateSourcesTable).set(update as any).where(eq(rateSourcesTable.id, String(req.params.id))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeSource(row));
  },
);

router.delete(
  "/rate-sources/:id",
  requireAuth,
  requireRole("admin", "owner"),
  async (req: Request, res: Response) => {
    await db.delete(rateSourcesTable).where(eq(rateSourcesTable.id, String(req.params.id)));
    res.status(204).end();
  },
);

router.post(
  "/rate-sources/:id/sync",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (req: Request, res: Response) => {
    const [src] = await db.select().from(rateSourcesTable).where(eq(rateSourcesTable.id, String(req.params.id)));
    if (!src) { res.status(404).json({ error: "Source not found" }); return; }
    const result = await runSourceSync(src);
    res.json({
      sourceId: src.id,
      ...result,
    });
  },
);

// Bulk upsert from a parsed array (used by client-side CSV upload).
router.post(
  "/dsr-rates/bulk-upsert",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const rawRows = Array.isArray(b.rows) ? b.rows : Array.isArray(b) ? b : null;
    if (!rawRows) { res.status(400).json({ error: "Body must be { rows: [...] } or an array" }); return; }
    const { rows, skipped, errors } = normalizeRows(rawRows, {
      state: b.defaultState ?? null,
      source: b.defaultSource ?? "DSR",
      effectiveYear: b.defaultEffectiveYear ?? null,
    });
    const { inserted, updated } = await upsertRates(rows);
    res.json({ inserted, updated, skipped, errors });
  },
);

// One-off escalation invocation (not tied to a saved source).
router.post(
  "/dsr-rates/escalate",
  requireAuth,
  requireRole(...ADMIN_RATES),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const pct = parseFloat(String(b.pct ?? ""));
    if (!Number.isFinite(pct)) { res.status(400).json({ error: "pct is required (number)" }); return; }
    const result = await applyEscalation({
      pct,
      trade: b.trade ?? null,
      state: b.state ?? null,
      fromYear: b.fromYear ?? null,
      toYear: b.toYear ?? null,
    });
    res.json(result);
  },
);

void and;
export default router;
