import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  workersTable, workerDocumentsTable, attendanceRecordsTable,
  payrollPeriodsTable, payrollLinesTable, wageSlipsTable,
  wageSlipDeliveriesTable,
  epfEntriesTable, esiEntriesTable,
  itpsTable, itpItemsTable, inspectionRequestsTable, inspectionChecklistsTable,
  ncrsTable, ncrActionsTable,
  safetyPermitsTable, hiraEntriesTable, jsaEntriesTable,
  ppeIssuesTable, incidentsTable, incidentActionsTable,
  qualityTestsTable, labourContractorBillsTable,
  paymentVouchersTable, billDeductionsTable, advanceLedgerTable,
  projectsTable, userProfilesTable, organisationsTable,
} from "@workspace/db";
import { buildTablePdf, buildWageSlipPdf, buildMultiWageSlipPdf, type WageSlipData } from "../lib/payrollPdf";
import { mailerConfigured, sendMail } from "../lib/mailer";
import { notifyJsaApproved, notifyQualityTestFinalised, getProjectRecipients } from "../lib/notifications";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";

const router: IRouter = Router();

const n = (v: any): number => {
  const x = parseFloat(String(v ?? 0));
  return isNaN(x) ? 0 : x;
};
const d = (v: any) => (v ? new Date(v).toISOString() : null);

// ─── Access guard ─────────────────────────────────────────────────────────────
async function denyIfNoProjectAccess(req: Request, res: Response, projectId: string): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return true; }
  if (req.userRole === "admin") return false;
  const [profile] = await db.select({ organisationId: userProfilesTable.organisationId })
    .from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  if (!profile?.organisationId) { res.status(403).json({ error: "Forbidden" }); return true; }
  const [project] = await db.select({ organisationId: projectsTable.organisationId })
    .from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return true; }
  if (project.organisationId !== profile.organisationId) { res.status(403).json({ error: "Forbidden" }); return true; }
  return false;
}

router.use("/projects/:projectId/workers", requireAuth, async (req, res, next) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  next();
});

// ─── WORKERS ──────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/workers", requireAuth, async (req: Request, res: Response) => {
  const { contractorId, status, trade } = req.query as Record<string, string>;
  let cond: any = eq(workersTable.projectId, req.params.projectId);
  if (contractorId) cond = and(cond, eq(workersTable.contractorId, contractorId));
  if (status) cond = and(cond, eq(workersTable.status, status));
  if (trade) cond = and(cond, eq(workersTable.trade, trade));
  const rows = await db.select().from(workersTable).where(cond).orderBy(workersTable.name);
  res.json(rows);
});

function normStatutory(b: any): { aadhaar: string | null; pf: string | null; uan: string | null; esi: string | null; error?: string } {
  const aadhaar = b.aadhaarNumber ? String(b.aadhaarNumber).replace(/\s+/g, "") : null;
  const pf = b.pfNumber ? String(b.pfNumber).trim().toUpperCase() : null;
  const uan = b.uan ? String(b.uan).replace(/\s+/g, "") : null;
  const esi = b.esiNumber ? String(b.esiNumber).replace(/\s+/g, "") : null;
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) return { aadhaar, pf, uan, esi, error: "Aadhaar must be 12 digits" };
  if (uan && !/^\d{12}$/.test(uan)) return { aadhaar, pf, uan, esi, error: "UAN must be 12 digits" };
  if (esi && !/^\d{10,17}$/.test(esi)) return { aadhaar, pf, uan, esi, error: "ESI number must be 10–17 digits" };
  return { aadhaar, pf, uan, esi };
}

async function resolveOrgId(projectId: string): Promise<string | null> {
  const [p] = await db.select({ organisationId: projectsTable.organisationId })
    .from(projectsTable).where(eq(projectsTable.id, projectId));
  return p?.organisationId ?? null;
}

async function checkDuplicates(orgId: string | null, v: { aadhaar: string | null; pf: string | null; uan: string | null; esi: string | null }, excludeWorkerId?: string): Promise<string | null> {
  if (!orgId) return null; // can't scope safely; rely on DB unique index as fallback
  const checks: Array<{ col: any; value: string; label: string }> = [];
  if (v.aadhaar) checks.push({ col: workersTable.aadhaarNumber, value: v.aadhaar, label: "Aadhaar" });
  if (v.pf) checks.push({ col: workersTable.pfNumber, value: v.pf, label: "PF number" });
  if (v.uan) checks.push({ col: workersTable.uan, value: v.uan, label: "UAN" });
  if (v.esi) checks.push({ col: workersTable.esiNumber, value: v.esi, label: "ESI number" });
  for (const c of checks) {
    const rows = await db.select({ id: workersTable.id, name: workersTable.name, code: workersTable.workerCode })
      .from(workersTable)
      .where(and(eq(workersTable.organisationId, orgId), eq(c.col, c.value)));
    const dup = rows.find(r => r.id !== excludeWorkerId);
    if (dup) return `${c.label} ${c.value} already belongs to ${dup.name} (${dup.code}) in this organisation`;
  }
  return null;
}

router.post("/projects/:projectId/workers", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.name || !b.trade) { res.status(400).json({ error: "name, trade required" }); return; }
  const v = normStatutory(b);
  if (v.error) { res.status(400).json({ error: v.error }); return; }
  const orgId = await resolveOrgId(req.params.projectId);
  if (!orgId) { res.status(400).json({ error: "Project is not linked to an organisation" }); return; }
  const dupErr = await checkDuplicates(orgId, v);
  if (dupErr) { res.status(409).json({ error: dupErr }); return; }
  const count = await db.select({ c: sql`count(*)` }).from(workersTable)
    .where(eq(workersTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  try {
    const [row] = await db.insert(workersTable).values({
      projectId: req.params.projectId,
      organisationId: orgId,
      workerCode: b.workerCode ?? `WRK-${String(seq).padStart(4, "0")}`,
      name: b.name, trade: b.trade ?? "helper",
      skillLevel: b.skillLevel ?? "unskilled",
      dailyRate: String(n(b.dailyRate)), otRate: String(n(b.otRate)),
      aadhaarNumber: v.aadhaar, phone: b.phone ?? null,
      email: b.email ? String(b.email).trim().toLowerCase() : null,
      gender: b.gender ?? null, state: b.state ?? null,
      bocwRegNumber: b.bocwRegNumber ?? null,
      pfNumber: v.pf, uan: v.uan, esiNumber: v.esi,
      bankName: b.bankName ?? null, accountNumber: b.accountNumber ?? null,
      ifscCode: b.ifscCode ?? null, contractorId: b.contractorId ?? null,
      registeredById: req.user?.id ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (String(e?.code) === "23505") { res.status(409).json({ error: "Aadhaar / PF / UAN / ESI already exists for another worker" }); return; }
    throw e;
  }
});

router.get("/workers/:workerId", requireAuth, async (req: Request, res: Response) => {
  const [w] = await db.select().from(workersTable).where(eq(workersTable.id, req.params.workerId));
  if (!w) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, w.projectId)) return;
  const docs = await db.select().from(workerDocumentsTable).where(eq(workerDocumentsTable.workerId, w.id));
  res.json({ ...w, documents: docs });
});

router.patch("/workers/:workerId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [w] = await db.select().from(workersTable).where(eq(workersTable.id, req.params.workerId));
  if (!w) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, w.projectId)) return;
  const fields = ["name","trade","skillLevel","phone","gender","state","bocwRegNumber","bankName","accountNumber","ifscCode","status","contractorId"];
  const patch: Record<string, any> = {};
  for (const f of fields) if (b[f] !== undefined) patch[f] = b[f];
  if (b.dailyRate !== undefined) patch.dailyRate = String(n(b.dailyRate));
  if (b.otRate !== undefined) patch.otRate = String(n(b.otRate));
  if (b.email !== undefined) {
    const e = String(b.email ?? "").trim().toLowerCase();
    patch.email = e || null;
  }
  if (b.aadhaarNumber !== undefined || b.pfNumber !== undefined || b.uan !== undefined || b.esiNumber !== undefined) {
    const merged = {
      aadhaarNumber: b.aadhaarNumber !== undefined ? b.aadhaarNumber : w.aadhaarNumber,
      pfNumber: b.pfNumber !== undefined ? b.pfNumber : w.pfNumber,
      uan: b.uan !== undefined ? b.uan : (w as any).uan,
      esiNumber: b.esiNumber !== undefined ? b.esiNumber : w.esiNumber,
    };
    const v = normStatutory(merged);
    if (v.error) { res.status(400).json({ error: v.error }); return; }
    let orgId = (w as any).organisationId as string | null;
    if (!orgId) {
      orgId = await resolveOrgId(w.projectId);
      if (orgId) patch.organisationId = orgId; // heal legacy rows under uniqueness scope
    }
    const dupErr = await checkDuplicates(orgId, v, w.id);
    if (dupErr) { res.status(409).json({ error: dupErr }); return; }
    if (b.aadhaarNumber !== undefined) patch.aadhaarNumber = v.aadhaar;
    if (b.pfNumber !== undefined) patch.pfNumber = v.pf;
    if (b.uan !== undefined) patch.uan = v.uan;
    if (b.esiNumber !== undefined) patch.esiNumber = v.esi;
  }
  try {
    const [updated] = await db.update(workersTable).set(patch).where(eq(workersTable.id, w.id)).returning();
    res.json(updated);
  } catch (e: any) {
    if (String(e?.code) === "23505") { res.status(409).json({ error: "Aadhaar / PF / UAN / ESI already exists for another worker" }); return; }
    throw e;
  }
});

// ─── ATTENDANCE ────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/attendance", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { workerId, date } = req.query as Record<string, string>;
  let cond: any = eq(attendanceRecordsTable.projectId, req.params.projectId);
  if (workerId) cond = and(cond, eq(attendanceRecordsTable.workerId, workerId));
  const rows = await db.select().from(attendanceRecordsTable).where(cond)
    .orderBy(desc(attendanceRecordsTable.attendanceDate));
  res.json(rows);
});

// Geofence: server-authoritative. Default radius 200m around project site.
const GEOFENCE_RADIUS_METRES = 200;
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function computeWithinGeofence(projectId: string, gpsLat: any, gpsLng: any): Promise<boolean> {
  if (gpsLat == null || gpsLng == null) return false;
  const [proj] = await db.select({ lat: projectsTable.latitude, lng: projectsTable.longitude })
    .from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!proj?.lat || !proj?.lng) return false;
  const dist = haversineMetres(Number(proj.lat), Number(proj.lng), Number(gpsLat), Number(gpsLng));
  return dist <= GEOFENCE_RADIUS_METRES;
}

router.post("/projects/:projectId/attendance", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.workerId || !b.attendanceDate) { res.status(400).json({ error: "workerId, attendanceDate required" }); return; }
  const markIn = b.markInTime ? new Date(b.markInTime) : null;
  const markOut = b.markOutTime ? new Date(b.markOutTime) : null;
  let hoursWorked = 0;
  let overtimeHours = 0;
  if (markIn && markOut) {
    const totalHours = (markOut.getTime() - markIn.getTime()) / 3600000;
    hoursWorked = Math.min(totalHours, 9);
    overtimeHours = Math.max(0, totalHours - 9);
  }
  // Server-authoritative geofence; client-supplied withinGeofence is ignored.
  const withinGeofence = await computeWithinGeofence(req.params.projectId, b.gpsLat, b.gpsLng);
  const [row] = await db.insert(attendanceRecordsTable).values({
    projectId: req.params.projectId, workerId: b.workerId,
    attendanceDate: new Date(b.attendanceDate),
    markInTime: markIn, markOutTime: markOut,
    gpsLat: b.gpsLat ? String(b.gpsLat) : null,
    gpsLng: b.gpsLng ? String(b.gpsLng) : null,
    withinGeofence,
    hoursWorked: String(Math.round(hoursWorked * 100) / 100),
    overtimeHours: String(Math.round(overtimeHours * 100) / 100),
    remarks: b.remarks ?? null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/attendance/:recordId/approve-ot", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [rec] = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, req.params.recordId));
  if (!rec) { res.status(404).json({ error: "Not found" }); return; }
  // Enforce project/org scope — critical authz check
  if (await denyIfNoProjectAccess(req, res, rec.projectId)) return;
  const [updated] = await db.update(attendanceRecordsTable)
    .set({ otApproved: true, otApprovedById: req.user?.id ?? null })
    .where(eq(attendanceRecordsTable.id, rec.id)).returning();
  res.json(updated);
});

// Bulk attendance entry (site engineer submits daily muster roll)
router.post("/projects/:projectId/attendance/bulk", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { entries } = req.body ?? {};
  if (!Array.isArray(entries) || entries.length === 0) { res.status(400).json({ error: "entries array required" }); return; }
  const inserted = [];
  for (const b of entries) {
    if (!b.workerId || !b.attendanceDate) continue;
    const markIn = b.markInTime ? new Date(b.markInTime) : null;
    const markOut = b.markOutTime ? new Date(b.markOutTime) : null;
    let hoursWorked = 0;
    let overtimeHours = 0;
    if (markIn && markOut) {
      const totalHours = (markOut.getTime() - markIn.getTime()) / 3600000;
      hoursWorked = Math.min(totalHours, 9);
      overtimeHours = Math.max(0, totalHours - 9);
    }
    const withinGeofence = await computeWithinGeofence(req.params.projectId, b.gpsLat, b.gpsLng);
    const [row] = await db.insert(attendanceRecordsTable).values({
      projectId: req.params.projectId, workerId: b.workerId,
      attendanceDate: new Date(b.attendanceDate),
      markInTime: markIn, markOutTime: markOut,
      gpsLat: b.gpsLat ? String(b.gpsLat) : null,
      gpsLng: b.gpsLng ? String(b.gpsLng) : null,
      withinGeofence,
      hoursWorked: String(Math.round(hoursWorked * 100) / 100),
      overtimeHours: String(Math.round(overtimeHours * 100) / 100),
      remarks: b.remarks ?? null,
    }).returning();
    inserted.push(row);
  }
  res.status(201).json({ inserted: inserted.length, records: inserted });
});

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/payroll-periods", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const rows = await db.select().from(payrollPeriodsTable)
    .where(eq(payrollPeriodsTable.projectId, req.params.projectId))
    .orderBy(desc(payrollPeriodsTable.fromDate));
  res.json(rows);
});

router.post("/projects/:projectId/payroll-periods", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.periodName || !b.fromDate || !b.toDate) { res.status(400).json({ error: "periodName, fromDate, toDate required" }); return; }
  const [row] = await db.insert(payrollPeriodsTable).values({
    projectId: req.params.projectId, periodName: b.periodName,
    periodType: b.periodType ?? "monthly",
    fromDate: new Date(b.fromDate), toDate: new Date(b.toDate),
  }).returning();
  res.status(201).json(row);
});

// Compute payroll: auto-calc EPF/ESI/PT from attendance data
router.post("/payroll-periods/:periodId/compute", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period || period.status !== "draft") { res.status(409).json({ error: "Only draft periods can be computed" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;

  // Fetch all workers for this project
  const workers = await db.select().from(workersTable)
    .where(and(eq(workersTable.projectId, period.projectId), eq(workersTable.status, "active")));

  // Fetch attendance in period
  const attendances = await db.select().from(attendanceRecordsTable)
    .where(and(
      eq(attendanceRecordsTable.projectId, period.projectId),
      sql`attendance_date >= ${period.fromDate.toISOString()} AND attendance_date <= ${period.toDate.toISOString()}`
    ));

  // Delete existing lines
  await db.delete(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));

  let totalGross = 0, totalDeductions = 0, totalNet = 0;
  for (const w of workers) {
    const wAtt = attendances.filter(a => a.workerId === w.id);
    const presentDays = wAtt.filter(a => n(a.hoursWorked) >= 4).length;
    const approvedOt = wAtt.filter(a => a.otApproved).reduce((s, a) => s + n(a.overtimeHours), 0);
    const dailyRate = n(w.dailyRate);
    const otRate = n(w.otRate) || dailyRate * 1.5 / 9;
    const basicWages = Math.round(presentDays * dailyRate * 100) / 100;
    const otAmount = Math.round(approvedOt * otRate * 100) / 100;
    const grossWages = basicWages + otAmount;
    // EPF: employee 12%, employer 12% of basic (capped at ₹15000)
    const epfWage = Math.min(basicWages, 15000);
    const epfEmployee = Math.round(epfWage * 0.12 * 100) / 100;
    const epfEmployer = Math.round(epfWage * 0.12 * 100) / 100;
    // ESI: employee 0.75%, employer 3.25% (capped at ₹21000/month)
    const esiWage = Math.min(grossWages, 21000);
    const esiEmployee = Math.round(esiWage * 0.0075 * 100) / 100;
    const esiEmployer = Math.round(esiWage * 0.0325 * 100) / 100;
    // PT: state-wise simplified (₹200 if salary > 15000)
    const pt = grossWages > 15000 ? 200 : grossWages > 10000 ? 150 : 0;
    const lwf = 10; // simplified fixed LWF contribution
    const totalDed = epfEmployee + esiEmployee + pt + lwf;
    const netWages = Math.max(0, grossWages - totalDed);

    await db.insert(payrollLinesTable).values({
      periodId: period.id, workerId: w.id,
      presentDays: String(presentDays), otHours: String(Math.round(approvedOt * 100) / 100),
      basicWages: String(basicWages), otAmount: String(otAmount), grossWages: String(grossWages),
      epfEmployee: String(epfEmployee), epfEmployer: String(epfEmployer),
      esiEmployee: String(esiEmployee), esiEmployer: String(esiEmployer),
      pt: String(pt), lwf: String(lwf),
      totalDeductions: String(totalDed), netWages: String(netWages),
    });

    totalGross += grossWages;
    totalDeductions += totalDed;
    totalNet += netWages;
  }

  const [updated] = await db.update(payrollPeriodsTable).set({
    totalGross: String(Math.round(totalGross * 100) / 100),
    totalDeductions: String(Math.round(totalDeductions * 100) / 100),
    totalNet: String(Math.round(totalNet * 100) / 100),
    status: "computed",
    processedById: req.user?.id ?? null, processedAt: new Date(),
  }).where(eq(payrollPeriodsTable.id, period.id)).returning();
  res.json(updated);
});

router.get("/payroll-periods/:periodId/lines", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const lines = await db.select().from(payrollLinesTable)
    .where(eq(payrollLinesTable.periodId, period.id));
  res.json(lines);
});

router.post("/payroll-periods/:periodId/approve", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period || period.status !== "computed") { res.status(409).json({ error: "Period must be in computed state" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const [updated] = await db.update(payrollPeriodsTable).set({ status: "approved" })
    .where(eq(payrollPeriodsTable.id, period.id)).returning();
  // Fire-and-forget: build slips + dispatch emails. Logged to wage_slip_deliveries.
  const triggeredById = req.user?.id ?? null;
  dispatchWageSlipEmails(period.id, triggeredById).catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[wage-slip-email] dispatch failed", e);
  });
  res.json({ ...updated, emailDispatch: mailerConfigured() ? "queued" : "skipped (SMTP not configured)" });
});

// ─── Wage-slip email delivery ────────────────────────────────────────────────
async function dispatchWageSlipEmails(periodId: string, triggeredById: string | null): Promise<void> {
  // Build slips so wage_slips rows exist + we have render-ready data per worker.
  const { data } = await buildWageSlipsForPeriod(periodId);
  if (data.length === 0) return;
  // Map slip data by slipNumber for lookup; we iterate slip rows (workerId-authoritative).
  const slipDataByNumber = new Map(data.map(d => [d.slipNumber, d]));
  const slips = await db.select().from(wageSlipsTable).where(eq(wageSlipsTable.periodId, periodId));
  if (slips.length === 0) return;
  const workers = await db.select().from(workersTable)
    .where(inArray(workersTable.id, slips.map(s => s.workerId)));
  const wmap = Object.fromEntries(workers.map(w => [w.id, w]));
  for (const slipRow of slips) {
    const slipData = slipDataByNumber.get(slipRow.slipNumber);
    if (!slipData) continue; // payroll line missing for this slip; skip
    await deliverOneWageSlip({
      periodId, workerId: slipRow.workerId, slipRowId: slipRow.id,
      worker: wmap[slipRow.workerId], slip: slipData, triggeredById,
    });
  }
}

async function deliverOneWageSlip(args: {
  periodId: string; workerId: string; slipRowId: string;
  worker: any; slip: WageSlipData; triggeredById: string | null;
}): Promise<typeof wageSlipDeliveriesTable.$inferSelect> {
  const { periodId, workerId, slipRowId, worker, slip, triggeredById } = args;
  const email = (worker?.email ?? "").trim();
  // count prior attempts (for resend)
  const prior = await db.select({ c: sql<number>`count(*)` }).from(wageSlipDeliveriesTable)
    .where(and(eq(wageSlipDeliveriesTable.periodId, periodId), eq(wageSlipDeliveriesTable.workerId, workerId)));
  const attempts = Number(prior[0]?.c ?? 0) + 1;
  if (!email) {
    const [row] = await db.insert(wageSlipDeliveriesTable).values({
      periodId, workerId, slipId: slipRowId, channel: "email",
      recipient: null, status: "skipped", errorMessage: "Worker has no email on file",
      attempts, triggeredById,
    }).returning();
    return row;
  }
  if (!mailerConfigured()) {
    const [row] = await db.insert(wageSlipDeliveriesTable).values({
      periodId, workerId, slipId: slipRowId, channel: "email",
      recipient: email, status: "skipped",
      errorMessage: "SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_FROM)",
      attempts, triggeredById,
    }).returning();
    return row;
  }
  let pdfBuf: Buffer;
  try {
    const bytes = await buildWageSlipPdf(slip);
    pdfBuf = Buffer.from(bytes);
  } catch (e: any) {
    const [row] = await db.insert(wageSlipDeliveriesTable).values({
      periodId, workerId, slipId: slipRowId, channel: "email",
      recipient: email, status: "error",
      errorMessage: `PDF render failed: ${e?.message ?? String(e)}`,
      attempts, triggeredById,
    }).returning();
    return row;
  }
  const subject = `Wage slip ${slip.slipNumber} — ${slip.periodName}`;
  const text = `Dear ${slip.worker.name},\n\nPlease find attached your wage slip ${slip.slipNumber} for the period ${slip.fromDate} to ${slip.toDate}.\n\nNet payable: ₹${slip.netPayable.toFixed(2)}\n\nIssued by ${slip.organisationName} on project ${slip.projectName}.`;
  const html = `<p>Dear ${slip.worker.name},</p><p>Please find attached your wage slip <b>${slip.slipNumber}</b> for the period <b>${slip.fromDate}</b> to <b>${slip.toDate}</b>.</p><p>Net payable: <b>₹${slip.netPayable.toFixed(2)}</b></p><p>Issued by ${slip.organisationName} on project ${slip.projectName}.</p>`;
  const result = await sendMail({
    to: email, subject, text, html,
    attachments: [{ filename: `wage-slip-${slip.slipNumber}.pdf`, content: pdfBuf, contentType: "application/pdf" }],
  });
  if (result.ok) {
    const [row] = await db.insert(wageSlipDeliveriesTable).values({
      periodId, workerId, slipId: slipRowId, channel: "email",
      recipient: email, status: "sent",
      messageId: result.messageId, sentAt: new Date(),
      attempts, triggeredById,
    }).returning();
    return row;
  }
  const [row] = await db.insert(wageSlipDeliveriesTable).values({
    periodId, workerId, slipId: slipRowId, channel: "email",
    recipient: email, status: result.bounced ? "bounced" : "error",
    errorMessage: result.error, attempts, triggeredById,
  }).returning();
  return row;
}

// List delivery log for a period
router.get("/payroll-periods/:periodId/wage-slip-deliveries", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const rows = await db.select().from(wageSlipDeliveriesTable)
    .where(eq(wageSlipDeliveriesTable.periodId, period.id))
    .orderBy(desc(wageSlipDeliveriesTable.createdAt));
  res.json({ mailerConfigured: mailerConfigured(), deliveries: rows });
});

// Re-send a single wage slip to one worker
router.post("/payroll-periods/:periodId/wage-slips/:workerId/resend", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Period not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const { data } = await buildWageSlipsForPeriod(period.id, req.params.workerId);
  if (data.length === 0) { res.status(404).json({ error: "No payroll line for that worker" }); return; }
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, req.params.workerId));
  if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
  const [slipRow] = await db.select().from(wageSlipsTable)
    .where(and(eq(wageSlipsTable.periodId, period.id), eq(wageSlipsTable.workerId, worker.id)));
  if (!slipRow) { res.status(404).json({ error: "Wage slip not issued" }); return; }
  const row = await deliverOneWageSlip({
    periodId: period.id, workerId: worker.id, slipRowId: slipRow.id,
    worker, slip: data[0], triggeredById: req.user?.id ?? null,
  });
  res.json(row);
});

// ─── ITP ──────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/itps", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const rows = await db.select().from(itpsTable)
    .where(eq(itpsTable.projectId, req.params.projectId))
    .orderBy(desc(itpsTable.createdAt));
  res.json(rows);
});

router.post("/projects/:projectId/itps", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(itpsTable).values({
    projectId: req.params.projectId, title: b.title,
    wbsActivityId: b.wbsActivityId ?? null, revision: b.revision ?? "0",
    createdById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(row);
});

router.get("/itps/:itpId", requireAuth, async (req: Request, res: Response) => {
  const [itp] = await db.select().from(itpsTable).where(eq(itpsTable.id, req.params.itpId));
  if (!itp) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, itp.projectId)) return;
  const items = await db.select().from(itpItemsTable).where(eq(itpItemsTable.itpId, itp.id))
    .orderBy(itpItemsTable.sequenceNo);
  res.json({ ...itp, items });
});

router.post("/itps/:itpId/items", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [itp] = await db.select().from(itpsTable).where(eq(itpsTable.id, req.params.itpId));
  if (!itp) { res.status(404).json({ error: "ITP not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, itp.projectId)) return;
  if (!b.activityDescription) { res.status(400).json({ error: "activityDescription required" }); return; }
  const [row] = await db.insert(itpItemsTable).values({
    itpId: itp.id, activityDescription: b.activityDescription,
    checkPointType: b.checkPointType ?? "witness",
    acceptanceCriteria: b.acceptanceCriteria ?? null,
    referenceCode: b.referenceCode ?? null,
    frequency: b.frequency ?? null,
    responsible: b.responsible ?? null, inspector: b.inspector ?? null,
    sequenceNo: b.sequenceNo ?? 1,
  }).returning();
  res.status(201).json(row);
});

router.post("/itps/:itpId/approve", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [itp] = await db.select().from(itpsTable).where(eq(itpsTable.id, req.params.itpId));
  if (!itp || itp.status === "approved") { res.status(409).json({ error: "Already approved or not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, itp.projectId)) return;
  const [updated] = await db.update(itpsTable).set({
    status: "approved", approvedById: req.user?.id ?? null, approvedAt: new Date(),
  }).where(eq(itpsTable.id, itp.id)).returning();
  res.json(updated);
});

// ─── INSPECTION REQUESTS ──────────────────────────────────────────────────────
router.get("/projects/:projectId/inspection-requests", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { status } = req.query as Record<string, string>;
  let cond: any = eq(inspectionRequestsTable.projectId, req.params.projectId);
  if (status) cond = and(cond, eq(inspectionRequestsTable.status, status));
  const rows = await db.select().from(inspectionRequestsTable).where(cond)
    .orderBy(desc(inspectionRequestsTable.inspectionDate));
  res.json(rows);
});

router.post("/projects/:projectId/inspection-requests", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.inspectionDate) { res.status(400).json({ error: "inspectionDate required" }); return; }
  const count = await db.select({ c: sql`count(*)` }).from(inspectionRequestsTable)
    .where(eq(inspectionRequestsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(inspectionRequestsTable).values({
    projectId: req.params.projectId,
    irNumber: b.irNumber ?? `IR-${String(seq).padStart(4, "0")}`,
    itpItemId: b.itpItemId ?? null, raisedById: req.user?.id ?? null,
    inspectionDate: new Date(b.inspectionDate),
    location: b.location ?? null, notes: b.notes ?? null,
    gpsLat: b.gpsLat ? String(b.gpsLat) : null,
    gpsLng: b.gpsLng ? String(b.gpsLng) : null,
  }).returning();
  res.status(201).json(row);
});

router.get("/inspection-requests/:irId", requireAuth, async (req: Request, res: Response) => {
  const [ir] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, req.params.irId));
  if (!ir) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, ir.projectId)) return;
  const items = await db.select().from(inspectionChecklistsTable).where(eq(inspectionChecklistsTable.irId, ir.id));
  res.json({ ...ir, checklist: items });
});

router.post("/inspection-requests/:irId/record", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [ir] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, req.params.irId));
  if (!ir) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, ir.projectId)) return;
  if (b.result === undefined) { res.status(400).json({ error: "result required (passed|failed)" }); return; }
  // Insert checklist items
  if (Array.isArray(b.checklist)) {
    for (const c of b.checklist) {
      await db.insert(inspectionChecklistsTable).values({
        irId: ir.id, parameter: c.parameter ?? "check",
        acceptanceCriteria: c.acceptanceCriteria ?? null,
        observed: c.observed ?? null, passed: c.passed ?? null,
        remarks: c.remarks ?? null,
      });
    }
  }
  const [updated] = await db.update(inspectionRequestsTable).set({
    result: b.result, status: b.result === "passed" ? "passed" : "failed",
    inspectedById: req.user?.id ?? null, inspectedAt: new Date(),
    notes: b.notes ?? ir.notes,
  }).where(eq(inspectionRequestsTable.id, ir.id)).returning();
  res.json(updated);
});

// ─── NCR ──────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/ncrs", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { status } = req.query as Record<string, string>;
  let cond: any = eq(ncrsTable.projectId, req.params.projectId);
  if (status) cond = and(cond, eq(ncrsTable.status, status));
  const rows = await db.select().from(ncrsTable).where(cond).orderBy(desc(ncrsTable.createdAt));
  res.json(rows);
});

router.post("/projects/:projectId/ncrs", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.description) { res.status(400).json({ error: "description required" }); return; }
  const count = await db.select({ c: sql`count(*)` }).from(ncrsTable)
    .where(eq(ncrsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(ncrsTable).values({
    projectId: req.params.projectId,
    ncrNumber: b.ncrNumber ?? `NCR-${String(seq).padStart(4, "0")}`,
    raisedById: req.user?.id ?? null, irId: b.irId ?? null,
    trade: b.trade ?? null, description: b.description,
    severity: b.severity ?? "minor", rootCause: b.rootCause ?? null,
    wbsActivityId: b.wbsActivityId ?? null,
  }).returning();
  res.status(201).json(row);
});

router.get("/ncrs/:ncrId", requireAuth, async (req: Request, res: Response) => {
  const [ncr] = await db.select().from(ncrsTable).where(eq(ncrsTable.id, req.params.ncrId));
  if (!ncr) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, ncr.projectId)) return;
  const actions = await db.select().from(ncrActionsTable).where(eq(ncrActionsTable.ncrId, ncr.id));
  res.json({ ...ncr, actions });
});

// NCR finite-state machine. Status may only transition along this graph;
// requesting any other status via PATCH returns 409 Conflict.
const NCR_TRANSITIONS: Record<string, string[]> = {
  open: ["capa_submitted"],
  capa_submitted: ["re_inspection"],
  re_inspection: ["closed", "capa_submitted"],
  closed: [],
};

router.patch("/ncrs/:ncrId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [ncr] = await db.select().from(ncrsTable).where(eq(ncrsTable.id, req.params.ncrId));
  if (!ncr) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, ncr.projectId)) return;

  // Enforce FSM if caller is changing status
  if (b.status !== undefined && b.status !== ncr.status) {
    const allowed = NCR_TRANSITIONS[ncr.status] ?? [];
    if (!allowed.includes(b.status)) {
      res.status(409).json({
        error: `Invalid NCR status transition: ${ncr.status} → ${b.status}`,
        currentStatus: ncr.status, allowedNext: allowed,
      });
      return;
    }
    // Closing requires at least one CAPA action recorded
    if (b.status === "closed") {
      const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(ncrActionsTable).where(eq(ncrActionsTable.ncrId, ncr.id));
      if (Number(c ?? 0) === 0) {
        res.status(409).json({ error: "Cannot close NCR without at least one CAPA action" });
        return;
      }
    }
  }

  const patch: Record<string, any> = {};
  const fields = ["status","severity","rootCause","reworkCost"];
  for (const f of fields) if (b[f] !== undefined) patch[f] = b[f];
  if (b.status === "closed") patch.closedAt = new Date();
  const [updated] = await db.update(ncrsTable).set(patch).where(eq(ncrsTable.id, ncr.id)).returning();
  res.json(updated);
});

router.post("/ncrs/:ncrId/actions", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [ncr] = await db.select().from(ncrsTable).where(eq(ncrsTable.id, req.params.ncrId));
  if (!ncr) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, ncr.projectId)) return;
  if (!b.description) { res.status(400).json({ error: "description required" }); return; }
  const [row] = await db.insert(ncrActionsTable).values({
    ncrId: ncr.id, actionType: b.actionType ?? "capa",
    description: b.description, dueDate: b.dueDate ? new Date(b.dueDate) : null,
    responsibleId: b.responsibleId ?? null,
  }).returning();
  // Update NCR status
  if (b.actionType === "capa") {
    await db.update(ncrsTable).set({ status: "capa_submitted" }).where(eq(ncrsTable.id, ncr.id));
  } else if (b.actionType === "re_inspection") {
    await db.update(ncrsTable).set({ status: "re_inspection" }).where(eq(ncrsTable.id, ncr.id));
  }
  res.status(201).json(row);
});

// ─── SAFETY PERMITS ───────────────────────────────────────────────────────────
router.get("/projects/:projectId/safety-permits", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { status, permitType } = req.query as Record<string, string>;
  let cond: any = eq(safetyPermitsTable.projectId, req.params.projectId);
  if (status) cond = and(cond, eq(safetyPermitsTable.status, status));
  if (permitType) cond = and(cond, eq(safetyPermitsTable.permitType, permitType));
  const rows = await db.select().from(safetyPermitsTable).where(cond)
    .orderBy(desc(safetyPermitsTable.startDateTime));
  res.json(rows);
});

router.post("/projects/:projectId/safety-permits", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.permitType || !b.workDescription || !b.startDateTime || !b.endDateTime) {
    res.status(400).json({ error: "permitType, workDescription, startDateTime, endDateTime required" }); return;
  }
  const count = await db.select({ c: sql`count(*)` }).from(safetyPermitsTable)
    .where(eq(safetyPermitsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(safetyPermitsTable).values({
    projectId: req.params.projectId,
    permitNumber: b.permitNumber ?? `PTW-${String(seq).padStart(4, "0")}`,
    permitType: b.permitType, workDescription: b.workDescription,
    location: b.location ?? null, startDateTime: new Date(b.startDateTime),
    endDateTime: new Date(b.endDateTime), applicantId: req.user?.id ?? null,
    hazards: b.hazards ?? null, precautions: b.precautions ?? null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/safety-permits/:permitId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [permit] = await db.select().from(safetyPermitsTable).where(eq(safetyPermitsTable.id, req.params.permitId));
  if (!permit) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, permit.projectId)) return;
  const patch: Record<string, any> = {};
  if (b.status !== undefined) {
    patch.status = b.status;
    if (b.status === "approved") { patch.approvedById = req.user?.id ?? null; patch.approvedAt = new Date(); }
  }
  const [updated] = await db.update(safetyPermitsTable).set(patch).where(eq(safetyPermitsTable.id, permit.id)).returning();
  res.json(updated);
});

// ─── HIRA ─────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/hira", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const rows = await db.select().from(hiraEntriesTable)
    .where(eq(hiraEntriesTable.projectId, req.params.projectId))
    .orderBy(desc(hiraEntriesTable.riskScore));
  res.json(rows);
});

router.post("/projects/:projectId/hira", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.hazardDescription) { res.status(400).json({ error: "hazardDescription required" }); return; }
  const likelihood = Math.min(5, Math.max(1, n(b.likelihood ?? 1)));
  const severity = Math.min(5, Math.max(1, n(b.severity ?? 1)));
  const riskScore = likelihood * severity;
  const riskLevel = riskScore >= 20 ? "extreme" : riskScore >= 12 ? "high" : riskScore >= 6 ? "medium" : "low";
  const resLikelihood = Math.min(5, Math.max(1, n(b.residualLikelihood ?? likelihood)));
  const resSeverity = Math.min(5, Math.max(1, n(b.residualSeverity ?? severity)));
  const residualRiskScore = resLikelihood * resSeverity;
  const [row] = await db.insert(hiraEntriesTable).values({
    projectId: req.params.projectId,
    wbsActivityId: b.wbsActivityId ?? null,
    hazardDescription: b.hazardDescription,
    hazardCategory: b.hazardCategory ?? null,
    likelihood, severity, riskScore, riskLevel,
    controlMeasures: b.controlMeasures ?? null,
    residualLikelihood: resLikelihood, residualSeverity: resSeverity,
    residualRiskScore, createdById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(row);
});

// ─── JSA ──────────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/jsa", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const rows = await db.select().from(jsaEntriesTable)
    .where(eq(jsaEntriesTable.projectId, req.params.projectId))
    .orderBy(desc(jsaEntriesTable.jsaDate));
  res.json(rows);
});

router.post("/projects/:projectId/jsa", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.jsaDate) { res.status(400).json({ error: "jsaDate required" }); return; }
  const status = b.status ?? "draft";
  const [row] = await db.insert(jsaEntriesTable).values({
    projectId: req.params.projectId,
    wbsActivityId: b.wbsActivityId ?? null,
    jsaDate: new Date(b.jsaDate),
    preparedById: req.user?.id ?? null,
    supervisorId: b.supervisorId ?? null,
    workersPresent: b.workersPresent ?? 0,
    steps: b.steps ?? [],
    status,
    supervisorSignature: b.supervisorSignature ?? null,
    approvedAt: status === "approved" ? new Date() : null,
    approvedById: status === "approved" ? (req.user?.id ?? null) : null,
  }).returning();
  if (row.status === "approved") {
    notifyJsaApproved(row.id).catch(() => {});
  }
  res.status(201).json(row);
});

router.patch("/jsa/:id", requireAuth, async (req: Request, res: Response) => {
  const [entry] = await db.select().from(jsaEntriesTable).where(eq(jsaEntriesTable.id, req.params.id));
  if (!entry) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, entry.projectId)) return;
  const b = req.body ?? {};
  const patch: Record<string, any> = {};
  if (b.steps !== undefined) patch.steps = b.steps;
  if (b.workersPresent !== undefined) patch.workersPresent = b.workersPresent;
  if (b.supervisorSignature !== undefined) patch.supervisorSignature = b.supervisorSignature;
  if (b.status !== undefined) {
    patch.status = b.status;
    if (b.status === "approved") {
      patch.approvedAt = new Date();
      patch.approvedById = req.user?.id ?? null;
    }
  }
  const [updated] = await db.update(jsaEntriesTable).set(patch).where(eq(jsaEntriesTable.id, entry.id)).returning();
  if (updated.status === "approved" && entry.status !== "approved") {
    notifyJsaApproved(updated.id).catch(() => {});
  }
  res.json(updated);
});

// ─── PROJECT NOTIFICATION RECIPIENTS ──────────────────────────────────────────
router.get("/projects/:projectId/notification-settings", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const r = await getProjectRecipients(req.params.projectId);
  res.json({ ...r, mailerConfigured: mailerConfigured() });
});

router.put("/projects/:projectId/notification-settings", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  const clean = (a: any): string[] => Array.isArray(a)
    ? a.map((x: any) => String(x).trim().toLowerCase()).filter((x: string) => x.includes("@"))
    : [];
  const settings = {
    safetyOfficers: clean(b.safetyOfficers),
    qcOfficers: clean(b.qcOfficers),
    cc: clean(b.cc),
    emailVendorOnQcFail: b.emailVendorOnQcFail !== false,
  };
  await db.update(projectsTable).set({ notificationRecipients: settings as any })
    .where(eq(projectsTable.id, req.params.projectId));
  res.json({ ...settings, mailerConfigured: mailerConfigured() });
});

// ─── PPE ISSUES ───────────────────────────────────────────────────────────────
router.get("/projects/:projectId/ppe-issues", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { workerId } = req.query as Record<string, string>;
  let cond: any = eq(ppeIssuesTable.projectId, req.params.projectId);
  if (workerId) cond = and(cond, eq(ppeIssuesTable.workerId, workerId));
  const rows = await db.select().from(ppeIssuesTable).where(cond)
    .orderBy(desc(ppeIssuesTable.issuedDate));
  res.json(rows);
});

router.post("/projects/:projectId/ppe-issues", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.workerId || !b.ppeType) { res.status(400).json({ error: "workerId, ppeType required" }); return; }
  const [row] = await db.insert(ppeIssuesTable).values({
    projectId: req.params.projectId, workerId: b.workerId, ppeType: b.ppeType,
    issuedDate: b.issuedDate ? new Date(b.issuedDate) : new Date(),
    returnedDate: b.returnedDate ? new Date(b.returnedDate) : null,
    condition: b.condition ?? "new", issuedById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(row);
});

// ─── INCIDENTS ────────────────────────────────────────────────────────────────
router.get("/projects/:projectId/incidents", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { status, classification } = req.query as Record<string, string>;
  let cond: any = eq(incidentsTable.projectId, req.params.projectId);
  if (status) cond = and(cond, eq(incidentsTable.status, status));
  if (classification) cond = and(cond, eq(incidentsTable.classification, classification));
  const rows = await db.select().from(incidentsTable).where(cond)
    .orderBy(desc(incidentsTable.incidentDate));
  res.json(rows);
});

router.post("/projects/:projectId/incidents", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.title || !b.incidentDate) { res.status(400).json({ error: "title, incidentDate required" }); return; }
  const count = await db.select({ c: sql`count(*)` }).from(incidentsTable)
    .where(eq(incidentsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(incidentsTable).values({
    projectId: req.params.projectId,
    incidentNumber: b.incidentNumber ?? `INC-${String(seq).padStart(4, "0")}`,
    incidentDate: new Date(b.incidentDate), reportedById: req.user?.id ?? null,
    classification: b.classification ?? "near_miss", title: b.title,
    description: b.description ?? null, location: b.location ?? null,
    injured: b.injured ?? null, lostDays: b.lostDays ?? 0,
    rootCause: b.rootCause ?? null, immediateAction: b.immediateAction ?? null,
  }).returning();
  res.status(201).json(row);
});

router.get("/incidents/:incidentId", requireAuth, async (req: Request, res: Response) => {
  const [inc] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, req.params.incidentId));
  if (!inc) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, inc.projectId)) return;
  const actions = await db.select().from(incidentActionsTable).where(eq(incidentActionsTable.incidentId, inc.id));
  res.json({ ...inc, actions });
});

router.patch("/incidents/:incidentId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [inc] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, req.params.incidentId));
  if (!inc) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, inc.projectId)) return;
  const patch: Record<string, any> = {};
  const fields = ["classification","rootCause","immediateAction","injured","lostDays","location"];
  for (const f of fields) if (b[f] !== undefined) patch[f] = b[f];
  if (b.status !== undefined) { patch.status = b.status; if (b.status === "closed") patch.closedAt = new Date(); }
  const [updated] = await db.update(incidentsTable).set(patch).where(eq(incidentsTable.id, inc.id)).returning();
  res.json(updated);
});

router.post("/incidents/:incidentId/actions", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [inc] = await db.select().from(incidentsTable).where(eq(incidentsTable.id, req.params.incidentId));
  if (!inc) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, inc.projectId)) return;
  if (!b.actionDescription) { res.status(400).json({ error: "actionDescription required" }); return; }
  const [row] = await db.insert(incidentActionsTable).values({
    incidentId: inc.id, actionDescription: b.actionDescription,
    responsibleId: b.responsibleId ?? null,
    dueDate: b.dueDate ? new Date(b.dueDate) : null,
  }).returning();
  res.status(201).json(row);
});

// ─── SAFETY DASHBOARD ─────────────────────────────────────────────────────────
router.get("/projects/:projectId/safety-dashboard", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const pid = req.params.projectId;
  const [
    openPermits, activePermits, openNcrs, openIncidents,
    workerCount, ppeIssuedCount
  ] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(safetyPermitsTable)
      .where(and(eq(safetyPermitsTable.projectId, pid), eq(safetyPermitsTable.status, "pending"))),
    db.select({ c: sql<number>`count(*)` }).from(safetyPermitsTable)
      .where(and(eq(safetyPermitsTable.projectId, pid), eq(safetyPermitsTable.status, "active"))),
    db.select({ c: sql<number>`count(*)` }).from(ncrsTable)
      .where(and(eq(ncrsTable.projectId, pid), sql`status != 'closed'`)),
    db.select({ c: sql<number>`count(*)` }).from(incidentsTable)
      .where(and(eq(incidentsTable.projectId, pid), eq(incidentsTable.status, "open"))),
    db.select({ c: sql<number>`count(*)` }).from(workersTable)
      .where(and(eq(workersTable.projectId, pid), eq(workersTable.status, "active"))),
    db.select({ c: sql<number>`count(distinct worker_id)` }).from(ppeIssuesTable)
      .where(eq(ppeIssuesTable.projectId, pid)),
  ]);
  const totalWorkers = Number(workerCount[0]?.c ?? 0);
  const ppeCompliant = Number(ppeIssuedCount[0]?.c ?? 0);
  const ppeCompliancePct = totalWorkers > 0 ? Math.round((ppeCompliant / totalWorkers) * 100) : 0;
  // Recent incidents
  const recentIncidents = await db.select().from(incidentsTable)
    .where(eq(incidentsTable.projectId, pid))
    .orderBy(desc(incidentsTable.incidentDate)).limit(5);
  // Extreme/high risk HIRA
  const highRisks = await db.select().from(hiraEntriesTable)
    .where(and(eq(hiraEntriesTable.projectId, pid), sql`risk_level in ('extreme','high')`))
    .orderBy(desc(hiraEntriesTable.riskScore)).limit(5);

  res.json({
    openPermits: Number(openPermits[0]?.c ?? 0),
    activePermits: Number(activePermits[0]?.c ?? 0),
    openNcrs: Number(openNcrs[0]?.c ?? 0),
    openIncidents: Number(openIncidents[0]?.c ?? 0),
    totalWorkers,
    ppeCompliancePct,
    recentIncidents,
    highRisks,
  });
});

// ─── STATUTORY EXPORTS ────────────────────────────────────────────────────────
router.get("/payroll-periods/:periodId/epf-export", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const lines = await db.select().from(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));
  const workers = await db.select().from(workersTable).where(eq(workersTable.projectId, period.projectId));
  const workerMap = Object.fromEntries(workers.map(w => [w.id, w]));
  const data = lines.map(l => {
    const w = workerMap[l.workerId] ?? {};
    const wages = n(l.basicWages);
    const epfWage = Math.min(wages, 15000);
    const epfEmployee = n(l.epfEmployee);
    const epfEmployer = n(l.epfEmployer);
    const epfAdmin = Math.round(epfWage * 0.005 * 100) / 100;
    return {
      workerCode: (w as any).workerCode, name: (w as any).name,
      uan: (w as any).uan ?? "—",
      pfNumber: (w as any).pfNumber ?? "—", aadhaar: (w as any).aadhaarNumber ?? "—",
      wages: wages.toFixed(2), epfWage: epfWage.toFixed(2),
      epfEmployee: epfEmployee.toFixed(2), epfEmployer: epfEmployer.toFixed(2),
      epfAdmin: epfAdmin.toFixed(2),
      totalEpf: (epfEmployee + epfEmployer + epfAdmin).toFixed(2),
    };
  });
  const totals = data.reduce((acc, r) => ({
    wages: acc.wages + parseFloat(r.wages),
    epfEmployee: acc.epfEmployee + parseFloat(r.epfEmployee),
    epfEmployer: acc.epfEmployer + parseFloat(r.epfEmployer),
    epfAdmin: acc.epfAdmin + parseFloat(r.epfAdmin),
    totalEpf: acc.totalEpf + parseFloat(r.totalEpf),
  }), { wages: 0, epfEmployee: 0, epfEmployer: 0, epfAdmin: 0, totalEpf: 0 });
  res.json({ period, rows: data, totals });
});

router.get("/payroll-periods/:periodId/esi-export", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const lines = await db.select().from(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));
  const workers = await db.select().from(workersTable).where(eq(workersTable.projectId, period.projectId));
  const workerMap = Object.fromEntries(workers.map(w => [w.id, w]));
  const data = lines.map(l => {
    const w = workerMap[l.workerId] ?? {};
    const gross = n(l.grossWages);
    const esiWage = Math.min(gross, 21000);
    return {
      workerCode: (w as any).workerCode, name: (w as any).name,
      esiNumber: (w as any).esiNumber ?? "—",
      grossWages: gross.toFixed(2), esiWage: esiWage.toFixed(2),
      esiEmployee: n(l.esiEmployee).toFixed(2),
      esiEmployer: n(l.esiEmployer).toFixed(2),
      totalEsi: (n(l.esiEmployee) + n(l.esiEmployer)).toFixed(2),
    };
  });
  const totals = data.reduce((acc, r) => ({
    esiEmployee: acc.esiEmployee + parseFloat(r.esiEmployee),
    esiEmployer: acc.esiEmployer + parseFloat(r.esiEmployer),
    totalEsi: acc.totalEsi + parseFloat(r.totalEsi),
  }), { esiEmployee: 0, esiEmployer: 0, totalEsi: 0 });
  res.json({ period, rows: data, totals });
});

// ─── Form A — BOCW Register of Workers ────────────────────────────────────────
router.get("/payroll-periods/:periodId/form-a", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, period.projectId));
  const [org] = project?.organisationId
    ? await db.select().from(organisationsTable).where(eq(organisationsTable.id, project.organisationId))
    : [null as any];
  const lines = await db.select().from(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));
  const workers = await db.select().from(workersTable).where(eq(workersTable.projectId, period.projectId));
  const wmap = Object.fromEntries(workers.map(w => [w.id, w]));
  const rows = lines.map((l, i) => {
    const w: any = wmap[l.workerId] ?? {};
    return {
      sno: String(i + 1),
      workerCode: w.workerCode ?? "—",
      name: w.name ?? "—",
      gender: w.gender ?? "—",
      aadhaar: w.aadhaarNumber ?? "—",
      uan: w.uan ?? "—",
      trade: w.trade ?? "—",
      skillLevel: w.skillLevel ?? "—",
      bocwReg: w.bocwRegNumber ?? "—",
      state: w.state ?? "—",
      dailyRate: n(w.dailyRate).toFixed(2),
      presentDays: n(l.presentDays).toFixed(1),
    };
  });
  const bytes = await buildTablePdf({
    title: "FORM A — REGISTER OF BUILDING WORKERS",
    subtitle: `${org?.name ?? ""} · ${project?.name ?? ""} · Period: ${period.periodName} (${period.fromDate.toISOString().slice(0,10)} → ${period.toDate.toISOString().slice(0,10)}) · Building and Other Construction Workers (RE&CS) Act, 1996 — Rule 234`,
    landscape: true,
    columns: [
      { header: "S.No", key: "sno", width: 32, align: "center" },
      { header: "Code", key: "workerCode", width: 60 },
      { header: "Name", key: "name", width: 130 },
      { header: "Gender", key: "gender", width: 50, align: "center" },
      { header: "Aadhaar", key: "aadhaar", width: 90 },
      { header: "UAN", key: "uan", width: 80 },
      { header: "Trade", key: "trade", width: 70 },
      { header: "Skill", key: "skillLevel", width: 75 },
      { header: "BOCW Reg.", key: "bocwReg", width: 80 },
      { header: "Home State", key: "state", width: 80 },
      { header: "Daily Rate", key: "dailyRate", width: 60, align: "right" },
      { header: "Days Worked", key: "presentDays", width: 60, align: "right" },
    ],
    rows,
    footer: `Generated ${new Date().toISOString()} · Total workers: ${rows.length}`,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="form-a-bocw-${period.id.slice(0,8)}.pdf"`);
  res.end(Buffer.from(bytes));
});

// ─── Form XVI — Wage Register (Contract Labour Rules, 1971) ───────────────────
router.get("/payroll-periods/:periodId/form-xvi", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, period.projectId));
  const [org] = project?.organisationId
    ? await db.select().from(organisationsTable).where(eq(organisationsTable.id, project.organisationId))
    : [null as any];
  const lines = await db.select().from(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));
  const workers = await db.select().from(workersTable).where(eq(workersTable.projectId, period.projectId));
  const wmap = Object.fromEntries(workers.map(w => [w.id, w]));
  const rows = lines.map((l, i) => {
    const w: any = wmap[l.workerId] ?? {};
    return {
      sno: String(i + 1),
      workerCode: w.workerCode ?? "—",
      name: w.name ?? "—",
      days: n(l.presentDays).toFixed(1),
      ot: n(l.otHours).toFixed(1),
      basic: n(l.basicWages).toFixed(2),
      otAmt: n(l.otAmount).toFixed(2),
      gross: n(l.grossWages).toFixed(2),
      epf: n(l.epfEmployee).toFixed(2),
      esi: n(l.esiEmployee).toFixed(2),
      pt: n(l.pt).toFixed(2),
      lwf: n(l.lwf).toFixed(2),
      tds: n(l.tdsOnWages).toFixed(2),
      adv: n(l.advanceDeduction).toFixed(2),
      totDed: n(l.totalDeductions).toFixed(2),
      net: n(l.netWages).toFixed(2),
    };
  });
  const totals = lines.reduce((acc, l) => ({
    basic: acc.basic + n(l.basicWages), otAmt: acc.otAmt + n(l.otAmount),
    gross: acc.gross + n(l.grossWages), epf: acc.epf + n(l.epfEmployee),
    esi: acc.esi + n(l.esiEmployee), pt: acc.pt + n(l.pt), lwf: acc.lwf + n(l.lwf),
    tds: acc.tds + n(l.tdsOnWages), adv: acc.adv + n(l.advanceDeduction),
    totDed: acc.totDed + n(l.totalDeductions), net: acc.net + n(l.netWages),
  }), { basic: 0, otAmt: 0, gross: 0, epf: 0, esi: 0, pt: 0, lwf: 0, tds: 0, adv: 0, totDed: 0, net: 0 });
  const totalsRow: Record<string, string> = {
    sno: "", workerCode: "", name: "TOTAL", days: "", ot: "",
    basic: totals.basic.toFixed(2), otAmt: totals.otAmt.toFixed(2), gross: totals.gross.toFixed(2),
    epf: totals.epf.toFixed(2), esi: totals.esi.toFixed(2), pt: totals.pt.toFixed(2),
    lwf: totals.lwf.toFixed(2), tds: totals.tds.toFixed(2), adv: totals.adv.toFixed(2),
    totDed: totals.totDed.toFixed(2), net: totals.net.toFixed(2),
  };
  const bytes = await buildTablePdf({
    title: "FORM XVI — REGISTER OF WAGES",
    subtitle: `${org?.name ?? ""} · ${project?.name ?? ""} · Period: ${period.periodName} (${period.fromDate.toISOString().slice(0,10)} → ${period.toDate.toISOString().slice(0,10)}) · Contract Labour (R&A) Central Rules, 1971 — Rule 78(2)(a)`,
    landscape: true,
    columns: [
      { header: "S.No", key: "sno", width: 26, align: "center" },
      { header: "Code", key: "workerCode", width: 48 },
      { header: "Worker Name", key: "name", width: 110 },
      { header: "Days", key: "days", width: 32, align: "right" },
      { header: "OT Hr", key: "ot", width: 32, align: "right" },
      { header: "Basic", key: "basic", width: 56, align: "right" },
      { header: "OT Amt", key: "otAmt", width: 50, align: "right" },
      { header: "Gross", key: "gross", width: 60, align: "right" },
      { header: "EPF", key: "epf", width: 46, align: "right" },
      { header: "ESI", key: "esi", width: 46, align: "right" },
      { header: "PT", key: "pt", width: 36, align: "right" },
      { header: "LWF", key: "lwf", width: 36, align: "right" },
      { header: "TDS", key: "tds", width: 46, align: "right" },
      { header: "Adv.", key: "adv", width: 46, align: "right" },
      { header: "Total Ded.", key: "totDed", width: 60, align: "right" },
      { header: "Net Wages", key: "net", width: 64, align: "right" },
    ],
    rows,
    totalsRow,
    footer: `Generated ${new Date().toISOString()} · Workers: ${rows.length} · Net disbursement INR ${totals.net.toFixed(2)}`,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="form-xvi-wage-register-${period.id.slice(0,8)}.pdf"`);
  res.end(Buffer.from(bytes));
});

// ─── Individual / bulk wage slips ────────────────────────────────────────────
async function buildWageSlipsForPeriod(periodId: string, workerIdFilter?: string): Promise<{
  data: WageSlipData[]; period: typeof payrollPeriodsTable.$inferSelect;
}> {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, periodId));
  if (!period) throw new Error("Period not found");
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, period.projectId));
  const [org] = project?.organisationId
    ? await db.select().from(organisationsTable).where(eq(organisationsTable.id, project.organisationId))
    : [null as any];
  let lineCond: any = eq(payrollLinesTable.periodId, period.id);
  if (workerIdFilter) lineCond = and(lineCond, eq(payrollLinesTable.workerId, workerIdFilter));
  const lines = await db.select().from(payrollLinesTable).where(lineCond);
  const workerIds = lines.map(l => l.workerId);
  const workers = workerIds.length
    ? await db.select().from(workersTable).where(inArray(workersTable.id, workerIds))
    : [];
  const wmap = Object.fromEntries(workers.map(w => [w.id, w]));
  const existing = await db.select().from(wageSlipsTable).where(eq(wageSlipsTable.periodId, period.id));
  const slipMap = Object.fromEntries(existing.map(s => [s.workerId, s]));
  const fromDate = period.fromDate.toISOString().slice(0, 10);
  const toDate = period.toDate.toISOString().slice(0, 10);
  const data: WageSlipData[] = [];
  for (const l of lines) {
    const w: any = wmap[l.workerId] ?? {};
    let slip = slipMap[l.workerId];
    if (!slip) {
      const slipNumber = `WS-${period.id.slice(0,4).toUpperCase()}-${(w.workerCode ?? l.workerId.slice(0,6)).toString()}`;
      const [created] = await db.insert(wageSlipsTable).values({
        periodId: period.id, workerId: l.workerId, slipNumber,
      }).returning();
      slip = created;
    }
    data.push({
      organisationName: org?.name ?? "Organisation",
      projectName: project?.name ?? "Project",
      periodName: period.periodName,
      fromDate, toDate,
      slipNumber: slip.slipNumber,
      issuedAt: slip.issuedAt.toISOString().slice(0, 10),
      worker: {
        workerCode: w.workerCode ?? "—", name: w.name ?? "—",
        trade: w.trade ?? "—", skillLevel: w.skillLevel ?? "—",
        aadhaar: w.aadhaarNumber ?? "—",
        pfNumber: w.pfNumber ?? "—", esiNumber: w.esiNumber ?? "—",
        uan: w.uan ?? "",
        bankName: w.bankName ?? "—", accountNumber: w.accountNumber ?? "—",
        ifscCode: w.ifscCode ?? "—",
        dailyRate: n(w.dailyRate),
      },
      earnings: {
        presentDays: n(l.presentDays), otHours: n(l.otHours),
        basicWages: n(l.basicWages), otAmount: n(l.otAmount),
        grossWages: n(l.grossWages),
      },
      deductions: {
        epfEmployee: n(l.epfEmployee), esiEmployee: n(l.esiEmployee),
        pt: n(l.pt), lwf: n(l.lwf), tds: n(l.tdsOnWages),
        advance: n(l.advanceDeduction), total: n(l.totalDeductions),
      },
      netPayable: n(l.netWages),
    });
  }
  return { data, period };
}

// Bulk: all wage slips for a period (one PDF, one slip per page)
router.get("/payroll-periods/:periodId/wage-slips", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const { data } = await buildWageSlipsForPeriod(period.id);
  if (data.length === 0) { res.status(404).json({ error: "No payroll lines to issue slips for" }); return; }
  const bytes = await buildMultiWageSlipPdf(data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="wage-slips-${period.id.slice(0,8)}.pdf"`);
  res.end(Buffer.from(bytes));
});

// Single worker wage slip
router.get("/payroll-periods/:periodId/wage-slips/:workerId", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const { data } = await buildWageSlipsForPeriod(period.id, req.params.workerId);
  if (data.length === 0) { res.status(404).json({ error: "No payroll line for that worker" }); return; }
  const bytes = await buildWageSlipPdf(data[0]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="wage-slip-${data[0].slipNumber}.pdf"`);
  res.end(Buffer.from(bytes));
});

router.get("/payroll-periods/:periodId/statutory-summary", requireAuth, async (req: Request, res: Response) => {
  const [period] = await db.select().from(payrollPeriodsTable).where(eq(payrollPeriodsTable.id, req.params.periodId));
  if (!period) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, period.projectId)) return;
  const lines = await db.select().from(payrollLinesTable).where(eq(payrollLinesTable.periodId, period.id));
  const agg = lines.reduce((acc, l) => ({
    epfEmployee: acc.epfEmployee + n(l.epfEmployee),
    epfEmployer: acc.epfEmployer + n(l.epfEmployer),
    esiEmployee: acc.esiEmployee + n(l.esiEmployee),
    esiEmployer: acc.esiEmployer + n(l.esiEmployer),
    pt: acc.pt + n(l.pt), lwf: acc.lwf + n(l.lwf),
    tds: acc.tds + n(l.tdsOnWages), netWages: acc.netWages + n(l.netWages),
  }), { epfEmployee: 0, epfEmployer: 0, esiEmployee: 0, esiEmployer: 0, pt: 0, lwf: 0, tds: 0, netWages: 0 });
  res.json({ period, workerCount: lines.length, ...agg });
});

// ─── QUALITY TESTS ────────────────────────────────────────────────────────────
router.get("/projects/:projectId/quality-tests", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const { testType, result, fromDate, toDate } = req.query as Record<string, string>;
  let cond: any = eq(qualityTestsTable.projectId, req.params.projectId);
  if (testType) cond = and(cond, eq(qualityTestsTable.testType, testType));
  if (result === "pass") cond = and(cond, eq(qualityTestsTable.passed, true));
  else if (result === "fail") cond = and(cond, eq(qualityTestsTable.passed, false));
  else if (result === "pending") cond = and(cond, sql`${qualityTestsTable.passed} IS NULL`);
  if (fromDate) cond = and(cond, sql`${qualityTestsTable.testDate} >= ${new Date(fromDate)}`);
  if (toDate) cond = and(cond, sql`${qualityTestsTable.testDate} <= ${new Date(toDate)}`);
  const rows = await db.select().from(qualityTestsTable).where(cond)
    .orderBy(desc(qualityTestsTable.testDate));
  res.json(rows);
});

// ─── Quality Test Certificate PDF ─────────────────────────────────────────────
router.get("/quality-tests/:id/certificate.pdf", requireAuth, async (req: Request, res: Response) => {
  const [test] = await db.select().from(qualityTestsTable).where(eq(qualityTestsTable.id, req.params.id));
  if (!test) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, test.projectId)) return;
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, test.projectId));
  const [org] = project?.organisationId
    ? await db.select().from(organisationsTable).where(eq(organisationsTable.id, project.organisationId))
    : [null as any];
  const resultText = test.passed === true ? "PASS" : test.passed === false ? "FAIL" : "PENDING";
  const limitText = test.minAcceptable && test.maxAcceptable
    ? `${test.minAcceptable} – ${test.maxAcceptable} ${test.testUnit ?? ""}`
    : test.minAcceptable ? `≥ ${test.minAcceptable} ${test.testUnit ?? ""}`
    : test.maxAcceptable ? `≤ ${test.maxAcceptable} ${test.testUnit ?? ""}` : "—";
  const rows = [
    { field: "Sample ID", value: test.sampleId ?? "—" },
    { field: "Test Type", value: String(test.testType).replace(/_/g, " ") },
    { field: "IS Code Reference", value: test.isCodeRef ?? "—" },
    { field: "Sample Location", value: test.sampleLocation ?? "—" },
    { field: "Laboratory", value: test.labName ?? "—" },
    { field: "Sample Date", value: test.sampleDate ? new Date(test.sampleDate).toISOString().slice(0,10) : "—" },
    { field: "Test Date", value: test.testDate ? new Date(test.testDate).toISOString().slice(0,10) : "—" },
    { field: "Test Value", value: test.testValue != null ? `${test.testValue} ${test.testUnit ?? ""}` : "—" },
    { field: "Acceptance Limit", value: limitText },
    { field: "Result", value: resultText },
    { field: "Remarks", value: test.remarks ?? "—" },
  ];
  const bytes = await buildTablePdf({
    title: "MATERIAL TEST CERTIFICATE",
    subtitle: `${org?.name ?? ""} · ${project?.name ?? ""} · Certificate #${test.id.slice(0,8).toUpperCase()}`,
    columns: [
      { header: "Particular", key: "field", width: 200 },
      { header: "Value", key: "value", width: 320 },
    ],
    rows,
    footer: `Generated ${new Date().toISOString()} · IS-code compliance certificate · System-generated, no signature required when used internally`,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="test-cert-${test.sampleId ?? test.id.slice(0,8)}.pdf"`);
  res.end(Buffer.from(bytes));
});

router.post("/projects/:projectId/quality-tests", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.testType) { res.status(400).json({ error: "testType required" }); return; }
  // Auto-populate IS code limits from lookup
  const { IS_CODE_LIMITS } = await import("@workspace/db");
  const limit = (IS_CODE_LIMITS as any)[b.testType] ?? {};
  const testValue = b.testValue !== undefined ? n(b.testValue) : null;
  const minVal = b.minAcceptable !== undefined ? n(b.minAcceptable) : limit.minValue ?? null;
  const maxVal = b.maxAcceptable !== undefined ? n(b.maxAcceptable) : limit.maxValue ?? null;
  let passed: boolean | null = null;
  if (testValue !== null) {
    if (minVal !== null && maxVal !== null) passed = testValue >= minVal && testValue <= maxVal;
    else if (minVal !== null) passed = testValue >= minVal;
    else if (maxVal !== null) passed = testValue <= maxVal;
  }
  const count = await db.select({ c: sql`count(*)` }).from(qualityTestsTable)
    .where(eq(qualityTestsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(qualityTestsTable).values({
    projectId: req.params.projectId, testType: b.testType,
    isCodeRef: b.isCodeRef ?? limit.ref ?? null,
    sampleId: b.sampleId ?? `S-${String(seq).padStart(4, "0")}`,
    sampleLocation: b.sampleLocation ?? null,
    sampleDate: b.sampleDate ? new Date(b.sampleDate) : null,
    testDate: b.testDate ? new Date(b.testDate) : new Date(),
    labName: b.labName ?? null,
    testUnit: b.testUnit ?? limit.unit ?? null,
    testValue: testValue !== null ? String(testValue) : null,
    minAcceptable: minVal !== null ? String(minVal) : null,
    maxAcceptable: maxVal !== null ? String(maxVal) : null,
    passed, remarks: b.remarks ?? null,
    irId: b.irId ?? null, itpItemId: b.itpItemId ?? null,
    conductedById: req.user?.id ?? null,
  }).returning();
  if (row.passed !== null && row.passed !== undefined) {
    notifyQualityTestFinalised(row.id).catch(() => {});
  }
  res.status(201).json(row);
});

// ─── LABOUR CONTRACTOR BILLS ──────────────────────────────────────────────────
router.get("/projects/:projectId/labour-contractor-bills", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const rows = await db.select().from(labourContractorBillsTable)
    .where(eq(labourContractorBillsTable.projectId, req.params.projectId))
    .orderBy(desc(labourContractorBillsTable.createdAt));
  res.json(rows);
});

router.post("/projects/:projectId/labour-contractor-bills", requireAuth, async (req: Request, res: Response) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  const b = req.body ?? {};
  if (!b.periodFrom || !b.periodTo || !b.claimedAmount || !b.contractorId) {
    res.status(400).json({ error: "contractorId, periodFrom, periodTo, claimedAmount required" }); return;
  }
  const count = await db.select({ c: sql`count(*)` }).from(labourContractorBillsTable)
    .where(eq(labourContractorBillsTable.projectId, req.params.projectId));
  const seq = Number(count[0]?.c ?? 0) + 1;
  const [row] = await db.insert(labourContractorBillsTable).values({
    projectId: req.params.projectId,
    billNumber: b.billNumber ?? `LCB-${String(seq).padStart(4, "0")}`,
    contractorId: b.contractorId, periodId: b.periodId ?? null,
    periodFrom: new Date(b.periodFrom), periodTo: new Date(b.periodTo),
    claimedHeadcount: b.claimedHeadcount ?? 0,
    claimedDays: String(n(b.claimedDays)), claimedAmount: String(n(b.claimedAmount)),
    submittedById: req.user?.id ?? null, status: "submitted", submittedAt: new Date(),
  }).returning();
  res.status(201).json(row);
});

// Compute attendance-based verification for a labour contractor bill.
// When the bill is scoped to a contractor, only that contractor's workers are
// considered; otherwise the entire project workforce in the period is used.
async function verifyLabourBill(bill: typeof labourContractorBillsTable.$inferSelect) {
  // Restrict workers to this contractor when set
  const workerScope = bill.contractorId
    ? await db.select().from(workersTable).where(and(
        eq(workersTable.projectId, bill.projectId),
        eq(workersTable.contractorId, bill.contractorId),
      ))
    : await db.select().from(workersTable).where(eq(workersTable.projectId, bill.projectId));
  const scopedIds = new Set(workerScope.map(w => w.id));

  const attRecords = await db.select().from(attendanceRecordsTable)
    .where(and(
      eq(attendanceRecordsTable.projectId, bill.projectId),
      sql`attendance_date >= ${bill.periodFrom.toISOString()} AND attendance_date <= ${bill.periodTo.toISOString()}`,
    ));

  const workerDays: Record<string, number> = {};
  for (const a of attRecords) {
    if (!scopedIds.has(a.workerId)) continue;
    if (n(a.hoursWorked) >= 4) workerDays[a.workerId] = (workerDays[a.workerId] ?? 0) + 1;
  }
  const verifiedHeadcount = Object.keys(workerDays).length;
  const verifiedDays = Object.values(workerDays).reduce((s, d) => s + d, 0);
  const workerMap = Object.fromEntries(workerScope.map(w => [w.id, w]));
  const verifiedAmount = Object.entries(workerDays)
    .reduce((s, [wid, days]) => s + days * n(workerMap[wid]?.dailyRate ?? 0), 0);

  const claimedAmount = n(bill.claimedAmount);
  const verifiedAmt = Math.round(verifiedAmount * 100) / 100;
  const discrepancy = Math.round((claimedAmount - verifiedAmt) * 100) / 100;
  const flags: string[] = [];
  if (bill.claimedHeadcount > verifiedHeadcount) {
    flags.push(`Excess headcount claim: claimed ${bill.claimedHeadcount}, attended ${verifiedHeadcount}`);
  }
  if (n(bill.claimedDays) > verifiedDays) {
    flags.push(`Excess mandays claim: claimed ${bill.claimedDays}, attended ${verifiedDays}`);
  }
  if (discrepancy > 0) flags.push(`Over-claim by ₹${discrepancy.toLocaleString("en-IN")}`);

  return {
    verifiedHeadcount, verifiedDays, verifiedAmount: verifiedAmt, discrepancy, flags,
    workerBreakdown: Object.entries(workerDays).map(([wid, days]) => ({
      workerId: wid, workerName: workerMap[wid]?.name ?? null, presentDays: days,
      dailyRate: n(workerMap[wid]?.dailyRate ?? 0),
    })),
  };
}

// Auto-deduction engine for labour contractor bills.
// Applied on approval against gross (verified) payable amount.
// Deductions: TDS 194C @ 2%, Retention @ 5%, LWF @ 0.5%,
// PF employer share @ 13%, ESI employer share @ 3.25%,
// advance recovery @ 20% (capped at outstanding contractor advance balance).
// Idempotent: clears previous labour-kind deductions for this bill before recomputing.
async function computeLabourBillDeductions(
  tx: any, billId: string, gross: number, projectId: string, contractorId: string | null,
): Promise<{ totalDeductions: number; netPayable: number }> {
  await tx.delete(billDeductionsTable).where(and(
    eq(billDeductionsTable.billId, billId),
    eq(billDeductionsTable.billKind, "labour"),
  ));

  type Ded = { type: string; desc: string; rate: number; base: number; amount: number; legal: string };
  const deds: Ded[] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;

  deds.push({ type: "tds_194c", desc: "TDS u/s 194C — Payments to contractors",
    rate: 2, base: gross, amount: r2(gross * 0.02),
    legal: "Income Tax Act, 1961 — Section 194C" });
  deds.push({ type: "retention", desc: "Retention money @ 5% of bill value",
    rate: 5, base: gross, amount: r2(gross * 0.05),
    legal: "Contract clause 14.3 — Retention 5% until DLP" });
  deds.push({ type: "lwf", desc: "Labour Welfare Fund @ 0.5%",
    rate: 0.5, base: gross, amount: r2(gross * 0.005),
    legal: "Building & Other Construction Workers Act, 1996" });
  deds.push({ type: "pf_employer", desc: "PF employer share @ 13% (12% EPF + 1% admin/EDLI)",
    rate: 13, base: gross, amount: r2(gross * 0.13),
    legal: "EPF & MP Act, 1952 — Sections 6 & 6C" });
  deds.push({ type: "esi_employer", desc: "ESI employer share @ 3.25%",
    rate: 3.25, base: gross, amount: r2(gross * 0.0325),
    legal: "Employees' State Insurance Act, 1948 — Section 39" });

  if (contractorId) {
    const advRows = await tx.select({ balance: advanceLedgerTable.balance })
      .from(advanceLedgerTable)
      .where(and(
        eq(advanceLedgerTable.contractorId, contractorId),
        eq(advanceLedgerTable.projectId, projectId),
      ))
      .orderBy(desc(advanceLedgerTable.createdAt)).limit(1);
    const advBalance = advRows.length > 0 ? n(advRows[0].balance) : 0;
    if (advBalance > 0) {
      const uncapped = r2(gross * 0.20);
      const recoveryAmt = Math.min(uncapped, advBalance);
      deds.push({ type: "advance_recovery",
        desc: `Advance recovery @ 20% of gross, capped at outstanding ₹${advBalance.toLocaleString("en-IN")}`,
        rate: 20, base: gross, amount: recoveryAmt,
        legal: "Contract clause 9.1 — Mobilization advance recovery" });
    }
  }

  let totalDeductions = 0;
  for (const ded of deds) {
    totalDeductions += ded.amount;
    await tx.insert(billDeductionsTable).values({
      billId, billKind: "labour",
      deductionType: ded.type, description: ded.desc,
      rate: String(ded.rate), baseAmount: String(ded.base),
      amount: String(ded.amount), legalRef: ded.legal,
    });
  }
  totalDeductions = Math.round(totalDeductions * 100) / 100;
  const netPayable = Math.max(0, Math.round((gross - totalDeductions) * 100) / 100);
  return { totalDeductions, netPayable };
}

// Cross-verify: compare claimed with attendance-derived figures
router.get("/labour-contractor-bills/:billId", requireAuth, async (req: Request, res: Response) => {
  const [bill] = await db.select().from(labourContractorBillsTable).where(eq(labourContractorBillsTable.id, req.params.billId));
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, bill.projectId)) return;
  const verification = await verifyLabourBill(bill);
  const vouchers = await db.select().from(paymentVouchersTable)
    .where(eq(paymentVouchersTable.labourContractorBillId, bill.id));
  const deductions = await db.select().from(billDeductionsTable).where(and(
    eq(billDeductionsTable.billId, bill.id),
    eq(billDeductionsTable.billKind, "labour"),
  )).orderBy(billDeductionsTable.createdAt);
  res.json({ ...bill, verification, vouchers, deductions });
});

router.patch("/labour-contractor-bills/:billId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [bill] = await db.select().from(labourContractorBillsTable).where(eq(labourContractorBillsTable.id, req.params.billId));
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, bill.projectId)) return;
  if (bill.status === "approved" || bill.status === "rejected") {
    res.status(409).json({ error: `Bill already ${bill.status}` }); return;
  }
  const patch: Record<string, any> = {};
  const now = new Date();
  let approving = false;
  if (b.status !== undefined) {
    patch.status = b.status;
    if (b.status === "approved") {
      approving = true;
      patch.approvedById = req.user?.id ?? null;
      patch.approvedAt = now;
    }
  }
  if (b.verifiedHeadcount !== undefined) patch.verifiedHeadcount = b.verifiedHeadcount;
  if (b.verifiedDays !== undefined) patch.verifiedDays = String(n(b.verifiedDays));
  if (b.verifiedAmount !== undefined) patch.verifiedAmount = String(n(b.verifiedAmount));
  if (b.discrepancyNotes !== undefined) patch.discrepancyNotes = b.discrepancyNotes;
  if (b.rejectionReason !== undefined) patch.rejectionReason = b.rejectionReason;

  // On approval: re-verify from attendance, generate payment voucher, lock payroll lines.
  // Wrapped in a transaction so partial financial state can't be persisted on failure.
  if (approving) {
    if (!bill.contractorId || !bill.periodId) {
      res.status(409).json({ error: "Cannot approve: bill is missing contractorId or periodId" }); return;
    }
    const verification = await verifyLabourBill(bill);
    const payableAmount = b.verifiedAmount !== undefined ? n(b.verifiedAmount) : verification.verifiedAmount;
    patch.verifiedHeadcount = patch.verifiedHeadcount ?? verification.verifiedHeadcount;
    patch.verifiedDays = patch.verifiedDays ?? String(verification.verifiedDays);
    patch.verifiedAmount = String(payableAmount);
    if (!patch.discrepancyNotes && verification.flags.length > 0) {
      patch.discrepancyNotes = verification.flags.join("; ");
    }

    const voucherNum = `LCV-${bill.projectId.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const result = await db.transaction(async (tx) => {
      // Apply auto-deduction engine (TDS, retention, LWF, PF, ESI, advance recovery)
      // against the verified gross amount; voucher is issued at net payable.
      const { totalDeductions, netPayable } = await computeLabourBillDeductions(
        tx, bill.id, payableAmount, bill.projectId, bill.contractorId,
      );
      patch.grossAmount = String(payableAmount);
      patch.totalDeductions = String(totalDeductions);
      patch.netPayable = String(netPayable);

      const [v] = await tx.insert(paymentVouchersTable).values({
        labourContractorBillId: bill.id, projectId: bill.projectId,
        voucherNumber: voucherNum, amount: String(netPayable),
        mode: b.paymentMode ?? "neft",
        bankName: b.bankName ?? null, accountNumber: b.accountNumber ?? null,
        ifscCode: b.ifscCode ?? null,
        utr: b.utr ?? null, paidAt: null,
        releasedById: req.user?.id ?? null,
      }).returning();

      // Post advance recovery against the contractor's advance ledger so the
      // outstanding balance is decremented as bills are approved.
      if (bill.contractorId) {
        const advRows = await tx.select({ balance: advanceLedgerTable.balance })
          .from(advanceLedgerTable)
          .where(and(
            eq(advanceLedgerTable.contractorId, bill.contractorId),
            eq(advanceLedgerTable.projectId, bill.projectId),
          ))
          .orderBy(desc(advanceLedgerTable.createdAt)).limit(1);
        const prevBalance = advRows.length > 0 ? n(advRows[0].balance) : 0;
        const recoveryRows = await tx.select({ amount: billDeductionsTable.amount })
          .from(billDeductionsTable)
          .where(and(
            eq(billDeductionsTable.billId, bill.id),
            eq(billDeductionsTable.billKind, "labour"),
            eq(billDeductionsTable.deductionType, "advance_recovery"),
          )).limit(1);
        const recoveryAmt = recoveryRows.length > 0 ? n(recoveryRows[0].amount) : 0;
        if (recoveryAmt > 0) {
          await tx.insert(advanceLedgerTable).values({
            projectId: bill.projectId, contractorId: bill.contractorId,
            labourContractorBillId: bill.id,
            transactionType: "recovery",
            amount: String(recoveryAmt),
            balance: String(Math.max(0, Math.round((prevBalance - recoveryAmt) * 100) / 100)),
            remarks: `Recovered against labour bill ${bill.billNumber}`,
          });
        }
      }

      const contractorWorkers = await tx.select({ id: workersTable.id }).from(workersTable).where(and(
        eq(workersTable.projectId, bill.projectId),
        eq(workersTable.contractorId, bill.contractorId!),
      ));
      const workerIds = contractorWorkers.map(w => w.id);
      if (workerIds.length > 0) {
        await tx.update(payrollLinesTable).set({
          locked: true,
          lockedReason: `Locked by labour contractor bill ${bill.billNumber}`,
          lockedAt: now,
        }).where(and(
          eq(payrollLinesTable.periodId, bill.periodId!),
          inArray(payrollLinesTable.workerId, workerIds),
        ));
      }

      const [u] = await tx.update(labourContractorBillsTable).set(patch)
        .where(eq(labourContractorBillsTable.id, bill.id)).returning();
      return { updated: u, voucher: v, lockedWorkerCount: workerIds.length };
    });
    res.json({ ...result.updated, voucher: result.voucher, lockedPayrollLines: result.lockedWorkerCount });
    return;
  }

  const [updated] = await db.update(labourContractorBillsTable).set(patch)
    .where(eq(labourContractorBillsTable.id, bill.id)).returning();
  res.json({ ...updated, voucher: null });
});

export default router;
