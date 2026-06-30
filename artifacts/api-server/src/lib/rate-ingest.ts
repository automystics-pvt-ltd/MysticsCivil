import Papa from "papaparse";
import net from "node:net";
import dns from "node:dns/promises";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db, dsrRatesTable, rateSourcesTable, type RateSource } from "@workspace/db";
import { logger } from "./logger";

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface NormalizedRate {
  code: string;
  description: string;
  trade: string;
  unit: string;
  state: string;
  cityTier?: string;
  rate: number;
  effectiveYear?: number;
  source?: string;
}

/** Convert a Google Sheets share/edit URL to its CSV export URL. */
export function gsheetToCsvUrl(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return input;
  const id = m[1];
  const gidMatch = input.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

const FIELD_ALIASES: Record<string, string[]> = {
  code: ["code", "item code", "item_code", "sno", "sl no"],
  description: ["description", "desc", "item description", "particulars"],
  trade: ["trade", "category", "section"],
  unit: ["unit", "uom"],
  state: ["state"],
  cityTier: ["city tier", "city_tier", "tier", "zone"],
  rate: ["rate", "amount", "unit rate", "price"],
  effectiveYear: ["year", "effective year", "effective_year"],
  source: ["source", "book"],
};

function pickField(row: Record<string, any>, key: string): any {
  const aliases = FIELD_ALIASES[key] ?? [key];
  const lcRow: Record<string, any> = {};
  for (const k of Object.keys(row)) lcRow[k.toLowerCase().trim()] = row[k];
  for (const a of aliases) {
    const v = lcRow[a.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

export function normalizeRows(
  raw: any[],
  defaults: { state?: string | null; source?: string | null; effectiveYear?: number | null },
): { rows: NormalizedRate[]; skipped: number; errors: string[] } {
  const out: NormalizedRate[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== "object") { skipped++; continue; }
    const code = String(pickField(r, "code") ?? "").trim();
    const description = String(pickField(r, "description") ?? "").trim();
    const trade = String(pickField(r, "trade") ?? "").trim();
    const unit = String(pickField(r, "unit") ?? "").trim();
    const state = String(pickField(r, "state") ?? defaults.state ?? "").trim();
    const rateRaw = pickField(r, "rate");
    const rateNum = typeof rateRaw === "number" ? rateRaw : parseFloat(String(rateRaw ?? "").replace(/[,₹\s]/g, ""));
    if (!code || !description || !trade || !unit || !state || !Number.isFinite(rateNum) || rateNum <= 0) {
      skipped++;
      if (errors.length < 10) errors.push(`Row ${i + 2}: missing required field or invalid rate`);
      continue;
    }
    const yrRaw = pickField(r, "effectiveYear");
    const yr = yrRaw !== undefined ? parseInt(String(yrRaw), 10) : (defaults.effectiveYear ?? new Date().getFullYear());
    out.push({
      code,
      description,
      trade,
      unit,
      state,
      cityTier: String(pickField(r, "cityTier") ?? "T2").trim() || "T2",
      rate: Math.round(rateNum * 100) / 100,
      effectiveYear: Number.isFinite(yr) ? yr : new Date().getFullYear(),
      source: String(pickField(r, "source") ?? defaults.source ?? "DSR").trim() || "DSR",
    });
  }
  return { rows: out, skipped, errors };
}

/** Atomic upsert keyed on (code, state, effectiveYear). Returns counts. */
export async function upsertRates(rows: NormalizedRate[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const result = await db.insert(dsrRatesTable).values({
      code: r.code,
      description: r.description,
      trade: r.trade,
      unit: r.unit,
      state: r.state,
      cityTier: r.cityTier ?? "T2",
      rate: String(r.rate),
      effectiveYear: r.effectiveYear ?? new Date().getFullYear(),
      source: r.source ?? "DSR",
    }).onConflictDoUpdate({
      target: [dsrRatesTable.code, dsrRatesTable.state, dsrRatesTable.effectiveYear],
      set: {
        description: r.description,
        trade: r.trade,
        unit: r.unit,
        cityTier: r.cityTier ?? "T2",
        rate: String(r.rate),
        source: r.source ?? "DSR",
        updatedAt: new Date(),
      },
    }).returning({ id: dsrRatesTable.id, createdAt: dsrRatesTable.createdAt, updatedAt: dsrRatesTable.updatedAt });
    // Row is "inserted" when createdAt and updatedAt are equal (fresh row), otherwise "updated".
    const row = result[0];
    if (row && row.createdAt && row.updatedAt && row.createdAt.getTime() === row.updatedAt.getTime()) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

/** SSRF guard: only allow http/https to public hosts. Blocks loopback,
 *  private RFC1918, link-local, ULA, etc. */
async function assertSafeUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${u.protocol}`);
  }
  const host = u.hostname;
  // Resolve to IPs and check each
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`DNS resolution failed for ${host}`);
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new Error(`Blocked private/internal address ${a.address} for host ${host}`);
    }
  }
}

function isPrivateAddress(ip: string): boolean {
  if (!net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped — re-check as IPv4
    const v4 = lower.slice("::ffff:".length);
    return isPrivateAddress(v4);
  }
  return false;
}

async function fetchText(url: string): Promise<string> {
  await assertSafeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MysticsCivil-RateSync/1.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Parse + upsert from CSV/JSON/GSheet URL. */
export async function syncFromUrl(source: RateSource): Promise<SyncResult> {
  if (!source.url) throw new Error("Source has no URL");
  const url = source.type === "gsheet" ? gsheetToCsvUrl(source.url) : source.url;
  const text = await fetchText(url);
  let raw: any[];
  if (source.type === "json") {
    const parsed = JSON.parse(text);
    raw = Array.isArray(parsed) ? parsed : (parsed.rates ?? parsed.items ?? parsed.data ?? []);
  } else {
    // csv or gsheet
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    raw = result.data as any[];
  }
  const { rows, skipped, errors } = normalizeRows(raw, {
    state: source.defaultState,
    source: source.defaultSource,
    effectiveYear: source.defaultEffectiveYear,
  });
  const { inserted, updated } = await upsertRates(rows);
  return { inserted, updated, skipped, errors };
}

/** Apply an escalation rule: bump rates by pct, optionally re-stamp with toYear. */
export async function applyEscalation(opts: {
  pct: number;
  trade?: string | null;
  state?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
}): Promise<SyncResult> {
  const conditions: any[] = [];
  if (opts.trade) conditions.push(eq(dsrRatesTable.trade, opts.trade));
  if (opts.state) conditions.push(eq(dsrRatesTable.state, opts.state));
  if (opts.fromYear) conditions.push(eq(dsrRatesTable.effectiveYear, opts.fromYear));
  const where = conditions.length ? and(...conditions) : undefined;
  const existing = where
    ? await db.select().from(dsrRatesTable).where(where)
    : await db.select().from(dsrRatesTable);
  if (existing.length === 0) return { inserted: 0, updated: 0, skipped: 0, errors: ["No rates matched the escalation filter"] };
  const factor = 1 + opts.pct / 100;
  const targetYear = opts.toYear ?? new Date().getFullYear();
  let inserted = 0;
  let updated = 0;
  for (const r of existing) {
    const newRate = Math.round(parseFloat(r.rate) * factor * 100) / 100;
    if (opts.toYear && opts.toYear !== r.effectiveYear) {
      // Insert escalated copy under new year. Conflict target = composite unique key.
      // If a row already exists for that (code,state,toYear), update its rate.
      const ret = await db.insert(dsrRatesTable).values({
        code: r.code,
        description: r.description,
        trade: r.trade,
        unit: r.unit,
        state: r.state,
        cityTier: r.cityTier,
        rate: String(newRate),
        effectiveYear: targetYear,
        source: r.source,
      }).onConflictDoUpdate({
        target: [dsrRatesTable.code, dsrRatesTable.state, dsrRatesTable.effectiveYear],
        set: { rate: String(newRate), updatedAt: new Date() },
      }).returning({ createdAt: dsrRatesTable.createdAt, updatedAt: dsrRatesTable.updatedAt });
      const row = ret[0];
      if (row && row.createdAt && row.updatedAt && row.createdAt.getTime() === row.updatedAt.getTime()) inserted++;
      else updated++;
    } else {
      await db.update(dsrRatesTable).set({ rate: String(newRate) }).where(eq(dsrRatesTable.id, r.id));
      updated++;
    }
  }
  return { inserted, updated, skipped: 0, errors: [] };
}

/** Run a single source: dispatch on type, write back lastSync* fields. */
export async function runSourceSync(source: RateSource): Promise<SyncResult> {
  const t0 = Date.now();
  let result: SyncResult;
  try {
    if (source.type === "escalation") {
      result = await applyEscalation({
        pct: parseFloat(source.escalationPct ?? "0"),
        trade: source.escalationFilterTrade,
        state: source.escalationFilterState,
        fromYear: source.escalationFromYear,
        toYear: source.escalationToYear,
      });
    } else {
      result = await syncFromUrl(source);
    }
    const status = result.errors.length === 0 ? "success" : "partial";
    await db.update(rateSourcesTable).set({
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncRowsInserted: result.inserted,
      lastSyncRowsUpdated: result.updated,
      lastSyncRowsSkipped: result.skipped,
      lastSyncError: result.errors.length ? result.errors.slice(0, 5).join("\n") : null,
    }).where(eq(rateSourcesTable.id, source.id));
    logger.info({ sourceId: source.id, label: source.label, ms: Date.now() - t0, ...result }, "Rate source synced");
    return result;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await db.update(rateSourcesTable).set({
      lastSyncAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: msg.slice(0, 1000),
    }).where(eq(rateSourcesTable.id, source.id));
    logger.error({ sourceId: source.id, err: msg }, "Rate source sync failed");
    return { inserted: 0, updated: 0, skipped: 0, errors: [msg] };
  }
}

/** Loop all enabled sources. Used by the daily cron. */
export async function runAllEnabledSources(): Promise<{ sourceId: string; result: SyncResult }[]> {
  const sources = await db.select().from(rateSourcesTable).where(eq(rateSourcesTable.enabled, true));
  const out: { sourceId: string; result: SyncResult }[] = [];
  for (const src of sources) {
    out.push({ sourceId: src.id, result: await runSourceSync(src) });
  }
  return out;
}

/** Suppress unused import warning for isNull (kept for future filtering). */
void isNull; void sql;
