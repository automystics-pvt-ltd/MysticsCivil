// ─────────────────────────────────────────────────────────────────────────────
// Reports API — eight read-only endpoints, one canonical response shape.
// ─────────────────────────────────────────────────────────────────────────────
// Every endpoint returns the same `ReportData` envelope so the web client can
// route them through a single preview + exporter (CSV / XLSX / Print-to-PDF).
//
// Shape
//   { title, subtitle?, generatedAt, organisationName?, meta[], sections[] }
//   sections[].columns describe formatting (currency/date/percent/...).
//   sections[].stats render as KPI chips above the table.
//
// Scoping
//   - All endpoints require auth.
//   - Project-bound reports verify that the requesting user has access to the
//     requested projectId (admins/owners bypass).
//   - Portfolio + cross-project endpoints filter to accessibleProjectIds.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  projectsTable,
  wbsActivitiesTable,
  milestonesTable,
  dprsTable,
  dprItemsTable,
  approvalsTable,
  usersTable,
  contractorBillsTable,
  labourContractorBillsTable,
  purchaseOrdersTable,
  grnsTable,
  variationOrdersTable,
  vendorsTable,
  issuesTable,
  jsaEntriesTable,
  qualityTestsTable,
  organisationsTable,
} from "@workspace/db";
import { and, eq, gte, lte, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getAccessCtx,
  getAccessibleProjectIds,
  PROJECT_ACCESS_BYPASS_ROLES,
} from "../lib/access";
import { n } from "../lib/serialize";

const router: IRouter = Router();

// ── Shared types ────────────────────────────────────────────────────────────
type ReportColumn = {
  key: string;
  label: string;
  format?: "currency" | "number" | "percent" | "date" | "datetime" | "text";
  align?: "left" | "right" | "center";
  total?: boolean;
};
type ReportStat = {
  label: string;
  value: string | number;
  tone?: "positive" | "warning" | "danger" | "info";
};
type ReportSection = {
  heading: string;
  description?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  stats?: ReportStat[];
};
type ReportData = {
  title: string;
  subtitle?: string;
  generatedAt: string;
  organisationName?: string;
  meta: Array<{ label: string; value: string }>;
  sections: ReportSection[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseDateParam(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function assertProjectAccess(req: Request, projectId: string): Promise<true | { status: number; error: string }> {
  const ctx = await getAccessCtx(req);
  if (ctx.role && PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role)) return true;
  const ids = await getAccessibleProjectIds(ctx);
  if (!ids.includes(projectId)) return { status: 403, error: "No access to this project" };
  return true;
}

async function loadProjectHeader(projectId: string): Promise<{
  project: any | null;
  orgName: string | null;
}> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return { project: null, orgName: null };
  let orgName: string | null = null;
  if (project.organisationId) {
    const [o] = await db
      .select({ name: organisationsTable.name })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, project.organisationId));
    orgName = o?.name ?? null;
  }
  return { project, orgName };
}

function rangeMeta(from: Date | null, to: Date | null): Array<{ label: string; value: string }> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { label: "Period from", value: from ? fmt(from) : "Project start" },
    { label: "Period to", value: to ? fmt(to) : "Today" },
  ];
}

function projectMeta(project: any, orgName: string | null): Array<{ label: string; value: string }> {
  return [
    { label: "Project", value: project.name ?? "—" },
    { label: "Code", value: project.code ?? "—" },
    { label: "Organisation", value: orgName ?? "—" },
    { label: "Location", value: project.location ?? "—" },
    { label: "Status", value: String(project.status ?? "—").replace(/_/g, " ") },
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// 1. PROJECT SUMMARY REPORT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/project-summary", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Weighted progress + work counts
  const activities = await db
    .select()
    .from(wbsActivitiesTable)
    .where(eq(wbsActivitiesTable.projectId, projectId));
  let wNum = 0, wDen = 0, completed = 0, pending = 0;
  for (const a of activities) {
    const w = n(a.weight) || 1;
    wDen += w; wNum += w * n(a.actualPercent);
    if (a.status === "completed") completed++; else pending++;
  }
  const actualPercent = wDen > 0 ? wNum / wDen : n(project.actualPercent);
  const plannedPercent = n(project.plannedPercent);

  // Money
  const COMMITTED_BILL_STATUSES = ["pm_certification", "auto_deductions", "gst_invoice", "finance_approval", "payment_released", "ledger_posting", "closed"];
  const [contractorSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(${contractorBillsTable.grossAmount}), 0)` })
    .from(contractorBillsTable)
    .where(and(eq(contractorBillsTable.projectId, projectId), inArray(contractorBillsTable.status, COMMITTED_BILL_STATUSES)));
  const [labourSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(COALESCE(${labourContractorBillsTable.verifiedAmount}, ${labourContractorBillsTable.claimedAmount})), 0)` })
    .from(labourContractorBillsTable)
    .where(and(eq(labourContractorBillsTable.projectId, projectId), inArray(labourContractorBillsTable.status, ["approved", "paid"])));
  const [materialsSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(${grnsTable.invoiceAmount}), 0)` })
    .from(grnsTable)
    .where(eq(grnsTable.projectId, projectId));
  const [advanceSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.advancePaid}), 0)` })
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.projectId, projectId));

  const utilC = n(contractorSum?.total), utilL = n(labourSum?.total), utilM = n(materialsSum?.total), utilA = n(advanceSum?.total);
  // PO advances are excluded from the utilization total: they're prepayments
  // recovered later against GRN-invoiced amounts already counted in `utilM`,
  // so adding them again would double-count materials cash-out. We still
  // surface the advance figure as its own informational row below.
  const utilized = utilC + utilL + utilM;
  const estimated = n(project.contractValue) || n(project.budgetToDate);
  const remaining = estimated - utilized;

  const data: ReportData = {
    title: "Project Summary Report",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: projectMeta(project, orgName),
    sections: [
      {
        heading: "Progress",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", align: "right" },
        ],
        stats: [
          { label: "% Complete", value: `${actualPercent.toFixed(1)}%`, tone: actualPercent >= plannedPercent ? "positive" : "warning" },
          { label: "Planned %", value: `${plannedPercent.toFixed(1)}%`, tone: "info" },
          { label: "Variance", value: `${(actualPercent - plannedPercent).toFixed(1)}%`, tone: actualPercent >= plannedPercent ? "positive" : "danger" },
        ],
        rows: [
          { metric: "Activities completed", value: completed },
          { metric: "Activities pending / in progress", value: pending },
          { metric: "Total activities", value: completed + pending },
          { metric: "Weighted % complete", value: `${actualPercent.toFixed(2)}%` },
          { metric: "Planned % to date", value: `${plannedPercent.toFixed(2)}%` },
        ],
      },
      {
        heading: "Cost & Utilization",
        columns: [
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount", format: "currency", align: "right", total: true },
        ],
        stats: [
          { label: "Estimated Cost", value: inr(estimated), tone: "info" },
          { label: "Amount Utilized", value: inr(utilized), tone: utilized > estimated ? "danger" : "warning" },
          { label: "Remaining Balance", value: inr(remaining), tone: remaining < 0 ? "danger" : "positive" },
        ],
        rows: [
          { category: "Contractor bills (committed)", amount: utilC },
          { category: "Labour bills (approved + paid)", amount: utilL },
          { category: "Materials (GRN invoiced)", amount: utilM },
          // Informational only — excluded from the total above (see comment).
          { category: "PO advances paid (informational)", amount: utilA },
        ],
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. DPR REPORT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/dpr", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });
  const from = parseDateParam(req.query["from"]);
  const to = parseDateParam(req.query["to"]);

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const conds = [eq(dprsTable.projectId, projectId)];
  if (from) conds.push(gte(dprsTable.reportDate, from));
  if (to) conds.push(lte(dprsTable.reportDate, to));
  const dprs = await db
    .select({
      id: dprsTable.id,
      reportDate: dprsTable.reportDate,
      status: dprsTable.status,
      weather: dprsTable.weather,
      temperature: dprsTable.temperature,
      manpowerCount: dprsTable.manpowerCount,
      summary: dprsTable.summary,
      submittedByName: sql<string>`COALESCE(NULLIF(TRIM(COALESCE(${usersTable.firstName}, '') || ' ' || COALESCE(${usersTable.lastName}, '')), ''), ${usersTable.email})`,
    })
    .from(dprsTable)
    .leftJoin(usersTable, eq(usersTable.id, dprsTable.submittedById))
    .where(and(...conds))
    .orderBy(desc(dprsTable.reportDate));

  const totalManpower = dprs.reduce((s, d) => s + (d.manpowerCount ?? 0), 0);
  const approvedCount = dprs.filter((d) => d.status === "approved").length;
  const avgManpower = dprs.length > 0 ? Math.round(totalManpower / dprs.length) : 0;

  const data: ReportData = {
    title: "Daily Progress Report (DPR) Register",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: [...projectMeta(project, orgName), ...rangeMeta(from, to)],
    sections: [
      {
        heading: "DPR Register",
        description: `${dprs.length} report(s) in the selected period.`,
        stats: [
          { label: "Total DPRs", value: dprs.length, tone: "info" },
          { label: "Approved", value: approvedCount, tone: "positive" },
          { label: "Avg. manpower / day", value: avgManpower, tone: "info" },
          { label: "Total man-days", value: totalManpower, tone: "info" },
        ],
        columns: [
          { key: "reportDate", label: "Date", format: "date" },
          { key: "status", label: "Status" },
          { key: "weather", label: "Weather" },
          { key: "temperature", label: "Temp °C", format: "number", align: "right" },
          { key: "manpowerCount", label: "Manpower", format: "number", align: "right", total: true },
          { key: "submittedByName", label: "Submitted by" },
          { key: "summary", label: "Summary" },
        ],
        rows: dprs.map((d) => ({
          ...d,
          reportDate: iso(d.reportDate),
          status: prettyStatus(d.status),
          summary: d.summary ?? "—",
          submittedByName: d.submittedByName ?? "—",
          weather: d.weather ?? "—",
          temperature: d.temperature ?? "—",
        })),
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. FINANCIAL REPORT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/financial", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });
  const from = parseDateParam(req.query["from"]);
  const to = parseDateParam(req.query["to"]);

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const cConds = [eq(contractorBillsTable.projectId, projectId)];
  if (from) cConds.push(gte(contractorBillsTable.billDate, from));
  if (to) cConds.push(lte(contractorBillsTable.billDate, to));
  // NOTE: contractor_bills doesn't carry a direct vendorId — vendor is
  // resolved through work_order_estimates. Until that join is added we omit
  // the vendor column from this section rather than render a placeholder.
  const cBills = await db
    .select({
      billNumber: contractorBillsTable.billNumber,
      billDate: contractorBillsTable.billDate,
      grossAmount: contractorBillsTable.grossAmount,
      totalDeductions: contractorBillsTable.totalDeductions,
      netPayable: contractorBillsTable.netPayable,
      status: contractorBillsTable.status,
    })
    .from(contractorBillsTable)
    .where(and(...cConds))
    .orderBy(desc(contractorBillsTable.billDate));

  const poConds = [eq(purchaseOrdersTable.projectId, projectId)];
  if (from) poConds.push(gte(purchaseOrdersTable.poDate, from));
  if (to) poConds.push(lte(purchaseOrdersTable.poDate, to));
  const pos = await db
    .select({
      poNumber: purchaseOrdersTable.poNumber,
      poDate: purchaseOrdersTable.poDate,
      vendor: vendorsTable.name,
      grandTotal: purchaseOrdersTable.grandTotal,
      advancePaid: purchaseOrdersTable.advancePaid,
      status: purchaseOrdersTable.status,
    })
    .from(purchaseOrdersTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, purchaseOrdersTable.vendorId))
    .where(and(...poConds))
    .orderBy(desc(purchaseOrdersTable.poDate));

  const grnConds = [eq(grnsTable.projectId, projectId)];
  if (from) grnConds.push(gte(grnsTable.grnDate, from));
  if (to) grnConds.push(lte(grnsTable.grnDate, to));
  const grns = await db
    .select({
      grnNumber: grnsTable.grnNumber,
      grnDate: grnsTable.grnDate,
      vendor: vendorsTable.name,
      invoiceAmount: grnsTable.invoiceAmount,
      status: grnsTable.status,
    })
    .from(grnsTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, grnsTable.vendorId))
    .where(and(...grnConds))
    .orderBy(desc(grnsTable.grnDate));

  const totalBills = cBills.reduce((s, b) => s + n(b.grossAmount), 0);
  const totalDeductions = cBills.reduce((s, b) => s + n(b.totalDeductions), 0);
  const totalNet = cBills.reduce((s, b) => s + n(b.netPayable), 0);
  const totalPo = pos.reduce((s, p) => s + n(p.grandTotal), 0);
  const totalAdvance = pos.reduce((s, p) => s + n(p.advancePaid), 0);
  const totalGrn = grns.reduce((s, g) => s + n(g.invoiceAmount), 0);

  const data: ReportData = {
    title: "Financial Report",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: [...projectMeta(project, orgName), ...rangeMeta(from, to), { label: "Contract Value", value: inr(n(project.contractValue)) }],
    sections: [
      {
        heading: "Contractor Bills",
        stats: [
          { label: "Bills", value: cBills.length, tone: "info" },
          { label: "Gross", value: inr(totalBills), tone: "info" },
          { label: "Deductions", value: inr(totalDeductions), tone: "warning" },
          { label: "Net payable", value: inr(totalNet), tone: "positive" },
        ],
        columns: [
          { key: "billNumber", label: "Bill #" },
          { key: "billDate", label: "Date", format: "date" },
          { key: "grossAmount", label: "Gross", format: "currency", align: "right", total: true },
          { key: "totalDeductions", label: "Deductions", format: "currency", align: "right", total: true },
          { key: "netPayable", label: "Net", format: "currency", align: "right", total: true },
          { key: "status", label: "Status" },
        ],
        rows: cBills.map((b) => ({
          ...b,
          billDate: iso(b.billDate),
          grossAmount: n(b.grossAmount),
          totalDeductions: n(b.totalDeductions),
          netPayable: n(b.netPayable),
          status: prettyStatus(b.status),
        })),
      },
      {
        heading: "Purchase Orders",
        stats: [
          { label: "POs", value: pos.length, tone: "info" },
          { label: "Total value", value: inr(totalPo), tone: "info" },
          { label: "Advances paid", value: inr(totalAdvance), tone: "warning" },
        ],
        columns: [
          { key: "poNumber", label: "PO #" },
          { key: "poDate", label: "Date", format: "date" },
          { key: "vendor", label: "Vendor" },
          { key: "grandTotal", label: "Grand Total", format: "currency", align: "right", total: true },
          { key: "advancePaid", label: "Advance", format: "currency", align: "right", total: true },
          { key: "status", label: "Status" },
        ],
        rows: pos.map((p) => ({
          ...p,
          poDate: iso(p.poDate),
          vendor: p.vendor ?? "—",
          grandTotal: n(p.grandTotal),
          advancePaid: n(p.advancePaid),
          status: prettyStatus(p.status),
        })),
      },
      {
        heading: "Goods Receipts (GRN)",
        stats: [
          { label: "GRNs", value: grns.length, tone: "info" },
          { label: "Invoiced value", value: inr(totalGrn), tone: "info" },
        ],
        columns: [
          { key: "grnNumber", label: "GRN #" },
          { key: "grnDate", label: "Date", format: "date" },
          { key: "vendor", label: "Vendor" },
          { key: "invoiceAmount", label: "Invoice Amount", format: "currency", align: "right", total: true },
          { key: "status", label: "Status" },
        ],
        rows: grns.map((g) => ({
          ...g,
          grnDate: iso(g.grnDate),
          vendor: g.vendor ?? "—",
          invoiceAmount: n(g.invoiceAmount),
          status: prettyStatus(g.status),
        })),
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. WORKFORCE & SAFETY REPORT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/workforce", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });
  const from = parseDateParam(req.query["from"]);
  const to = parseDateParam(req.query["to"]);

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const lConds = [eq(labourContractorBillsTable.projectId, projectId)];
  if (from) lConds.push(gte(labourContractorBillsTable.periodFrom, from));
  if (to) lConds.push(lte(labourContractorBillsTable.periodTo, to));
  const lbills = await db
    .select({
      billNumber: labourContractorBillsTable.billNumber,
      contractor: vendorsTable.name,
      periodFrom: labourContractorBillsTable.periodFrom,
      periodTo: labourContractorBillsTable.periodTo,
      claimedHeadcount: labourContractorBillsTable.claimedHeadcount,
      verifiedHeadcount: labourContractorBillsTable.verifiedHeadcount,
      claimedDays: labourContractorBillsTable.claimedDays,
      verifiedDays: labourContractorBillsTable.verifiedDays,
      netPayable: labourContractorBillsTable.netPayable,
      status: labourContractorBillsTable.status,
    })
    .from(labourContractorBillsTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, labourContractorBillsTable.contractorId))
    .where(and(...lConds))
    .orderBy(desc(labourContractorBillsTable.periodTo));

  const jConds = [eq(jsaEntriesTable.projectId, projectId)];
  if (from) jConds.push(gte(jsaEntriesTable.createdAt, from));
  if (to) jConds.push(lte(jsaEntriesTable.createdAt, to));
  const jsaCount = (await db.select({ c: sql<number>`COUNT(*)` }).from(jsaEntriesTable).where(and(...jConds)))[0]?.c ?? 0;

  const qConds = [eq(qualityTestsTable.projectId, projectId)];
  if (from) qConds.push(gte(qualityTestsTable.createdAt, from));
  if (to) qConds.push(lte(qualityTestsTable.createdAt, to));
  const qcCount = (await db.select({ c: sql<number>`COUNT(*)` }).from(qualityTestsTable).where(and(...qConds)))[0]?.c ?? 0;

  const safetyIssues = await db
    .select({
      title: issuesTable.title,
      severity: issuesTable.severity,
      status: issuesTable.status,
      raisedAt: issuesTable.raisedAt,
    })
    .from(issuesTable)
    .where(and(
      eq(issuesTable.projectId, projectId),
      ...(from ? [gte(issuesTable.raisedAt, from)] : []),
      ...(to ? [lte(issuesTable.raisedAt, to)] : []),
    ))
    .orderBy(desc(issuesTable.raisedAt));

  const totalHeadcount = lbills.reduce((s, b) => s + (b.verifiedHeadcount ?? b.claimedHeadcount ?? 0), 0);
  const totalDays = lbills.reduce((s, b) => s + n(b.verifiedDays ?? b.claimedDays), 0);
  const totalLabourCost = lbills.reduce((s, b) => s + n(b.netPayable), 0);

  const data: ReportData = {
    title: "Workforce & Safety Report",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: [...projectMeta(project, orgName), ...rangeMeta(from, to)],
    sections: [
      {
        heading: "Labour Deployment (by contractor)",
        stats: [
          { label: "Contractor periods", value: lbills.length, tone: "info" },
          { label: "Total headcount", value: totalHeadcount, tone: "info" },
          { label: "Total man-days", value: totalDays.toFixed(0), tone: "info" },
          { label: "Total labour cost", value: inr(totalLabourCost), tone: "warning" },
        ],
        columns: [
          { key: "billNumber", label: "Bill #" },
          { key: "contractor", label: "Contractor" },
          { key: "periodFrom", label: "From", format: "date" },
          { key: "periodTo", label: "To", format: "date" },
          { key: "headcount", label: "Headcount", format: "number", align: "right", total: true },
          { key: "days", label: "Days", format: "number", align: "right", total: true },
          { key: "netPayable", label: "Net Payable", format: "currency", align: "right", total: true },
          { key: "status", label: "Status" },
        ],
        rows: lbills.map((b) => ({
          billNumber: b.billNumber,
          contractor: b.contractor ?? "—",
          periodFrom: iso(b.periodFrom),
          periodTo: iso(b.periodTo),
          headcount: b.verifiedHeadcount ?? b.claimedHeadcount ?? 0,
          days: n(b.verifiedDays ?? b.claimedDays),
          netPayable: n(b.netPayable),
          status: prettyStatus(b.status),
        })),
      },
      {
        heading: "Safety & Quality (period totals)",
        stats: [
          { label: "JSA entries logged", value: jsaCount, tone: "info" },
          { label: "Quality tests recorded", value: qcCount, tone: "info" },
          { label: "Safety issues", value: safetyIssues.length, tone: safetyIssues.length > 0 ? "warning" : "positive" },
        ],
        columns: [
          { key: "title", label: "Issue" },
          { key: "severity", label: "Severity" },
          { key: "status", label: "Status" },
          { key: "raisedAt", label: "Raised", format: "date" },
        ],
        rows: safetyIssues.map((i) => ({
          title: i.title,
          severity: prettyStatus(i.severity),
          status: prettyStatus(i.status),
          raisedAt: iso(i.raisedAt),
        })),
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. SUPPLY CHAIN REPORT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/supply-chain", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });
  const from = parseDateParam(req.query["from"]);
  const to = parseDateParam(req.query["to"]);

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const poConds = [eq(purchaseOrdersTable.projectId, projectId)];
  if (from) poConds.push(gte(purchaseOrdersTable.poDate, from));
  if (to) poConds.push(lte(purchaseOrdersTable.poDate, to));
  const pos = await db
    .select({
      poNumber: purchaseOrdersTable.poNumber,
      poDate: purchaseOrdersTable.poDate,
      vendor: vendorsTable.name,
      grandTotal: purchaseOrdersTable.grandTotal,
      advancePaid: purchaseOrdersTable.advancePaid,
      status: purchaseOrdersTable.status,
      deliveryDeadline: purchaseOrdersTable.deliveryDeadline,
    })
    .from(purchaseOrdersTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, purchaseOrdersTable.vendorId))
    .where(and(...poConds))
    .orderBy(desc(purchaseOrdersTable.poDate));

  const grnConds = [eq(grnsTable.projectId, projectId)];
  if (from) grnConds.push(gte(grnsTable.grnDate, from));
  if (to) grnConds.push(lte(grnsTable.grnDate, to));
  const grns = await db
    .select({
      grnNumber: grnsTable.grnNumber,
      grnDate: grnsTable.grnDate,
      poNumber: purchaseOrdersTable.poNumber,
      vendor: vendorsTable.name,
      invoiceAmount: grnsTable.invoiceAmount,
      threeWayMatchStatus: grnsTable.threeWayMatchStatus,
      status: grnsTable.status,
    })
    .from(grnsTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, grnsTable.vendorId))
    .leftJoin(purchaseOrdersTable, eq(purchaseOrdersTable.id, grnsTable.poId))
    .where(and(...grnConds))
    .orderBy(desc(grnsTable.grnDate));

  // Vendor-wise spend rollup
  const vendorRows = new Map<string, { vendor: string; poValue: number; grnValue: number; advance: number }>();
  for (const p of pos) {
    const k = p.vendor ?? "—";
    const r = vendorRows.get(k) ?? { vendor: k, poValue: 0, grnValue: 0, advance: 0 };
    r.poValue += n(p.grandTotal); r.advance += n(p.advancePaid);
    vendorRows.set(k, r);
  }
  for (const g of grns) {
    const k = g.vendor ?? "—";
    const r = vendorRows.get(k) ?? { vendor: k, poValue: 0, grnValue: 0, advance: 0 };
    r.grnValue += n(g.invoiceAmount);
    vendorRows.set(k, r);
  }

  const matched = grns.filter((g) => g.threeWayMatchStatus === "matched").length;
  const mismatched = grns.filter((g) => g.threeWayMatchStatus && g.threeWayMatchStatus !== "matched" && g.threeWayMatchStatus !== "pending").length;

  const data: ReportData = {
    title: "Supply Chain Report",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: [...projectMeta(project, orgName), ...rangeMeta(from, to)],
    sections: [
      {
        heading: "Purchase Orders",
        stats: [
          { label: "POs raised", value: pos.length, tone: "info" },
          { label: "PO value", value: inr(pos.reduce((s, p) => s + n(p.grandTotal), 0)), tone: "info" },
          { label: "Advances paid", value: inr(pos.reduce((s, p) => s + n(p.advancePaid), 0)), tone: "warning" },
        ],
        columns: [
          { key: "poNumber", label: "PO #" },
          { key: "poDate", label: "Date", format: "date" },
          { key: "vendor", label: "Vendor" },
          { key: "grandTotal", label: "Grand Total", format: "currency", align: "right", total: true },
          { key: "advancePaid", label: "Advance", format: "currency", align: "right", total: true },
          { key: "deliveryDeadline", label: "Delivery by", format: "date" },
          { key: "status", label: "Status" },
        ],
        rows: pos.map((p) => ({
          poNumber: p.poNumber,
          poDate: iso(p.poDate),
          vendor: p.vendor ?? "—",
          grandTotal: n(p.grandTotal),
          advancePaid: n(p.advancePaid),
          deliveryDeadline: iso(p.deliveryDeadline),
          status: prettyStatus(p.status),
        })),
      },
      {
        heading: "Goods Receipts (GRN) & 3-Way Match",
        stats: [
          { label: "GRNs", value: grns.length, tone: "info" },
          { label: "Matched", value: matched, tone: "positive" },
          { label: "Mismatched", value: mismatched, tone: mismatched > 0 ? "danger" : "positive" },
        ],
        columns: [
          { key: "grnNumber", label: "GRN #" },
          { key: "grnDate", label: "Date", format: "date" },
          { key: "poNumber", label: "Against PO" },
          { key: "vendor", label: "Vendor" },
          { key: "invoiceAmount", label: "Invoice", format: "currency", align: "right", total: true },
          { key: "threeWayMatchStatus", label: "3-Way" },
          { key: "status", label: "Status" },
        ],
        rows: grns.map((g) => ({
          grnNumber: g.grnNumber,
          grnDate: iso(g.grnDate),
          poNumber: g.poNumber ?? "—",
          vendor: g.vendor ?? "—",
          invoiceAmount: n(g.invoiceAmount),
          threeWayMatchStatus: prettyStatus(g.threeWayMatchStatus ?? "—"),
          status: prettyStatus(g.status),
        })),
      },
      {
        heading: "Vendor-wise Spend",
        columns: [
          { key: "vendor", label: "Vendor" },
          { key: "poValue", label: "PO Value", format: "currency", align: "right", total: true },
          { key: "advance", label: "Advance Paid", format: "currency", align: "right", total: true },
          { key: "grnValue", label: "GRN Invoiced", format: "currency", align: "right", total: true },
        ],
        rows: [...vendorRows.values()].sort((a, b) => b.poValue - a.poValue),
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 6. VARIATION ORDERS REGISTER
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/variation-orders", requireAuth, async (req: Request, res: Response) => {
  const projectId = String(req.query["projectId"] ?? "");
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const access = await assertProjectAccess(req, projectId);
  if (access !== true) return res.status(access.status).json({ error: access.error });

  const { project, orgName } = await loadProjectHeader(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const raised = sql`r`.as("raised");
  const approver = sql`a`.as("approver");
  const vos = await db
    .select({
      voNumber: variationOrdersTable.voNumber,
      title: variationOrdersTable.title,
      scopeChange: variationOrdersTable.scopeChange,
      costImpact: variationOrdersTable.costImpact,
      programmeImpactDays: variationOrdersTable.programmeImpactDays,
      status: variationOrdersTable.status,
      createdAt: variationOrdersTable.createdAt,
      approvedAt: variationOrdersTable.approvedAt,
      raisedById: variationOrdersTable.raisedById,
      approvedById: variationOrdersTable.approvedById,
    })
    .from(variationOrdersTable)
    .where(eq(variationOrdersTable.projectId, projectId))
    .orderBy(desc(variationOrdersTable.createdAt));

  // Names for raisers/approvers — done in a small lookup pass
  const userIds = new Set<string>();
  for (const v of vos) { if (v.raisedById) userIds.add(v.raisedById); if (v.approvedById) userIds.add(v.approvedById); }
  const users = userIds.size > 0
    ? await db.select({ id: usersTable.id, name: sql<string>`COALESCE(NULLIF(TRIM(COALESCE(${usersTable.firstName}, '') || ' ' || COALESCE(${usersTable.lastName}, '')), ''), ${usersTable.email})` }).from(usersTable).where(inArray(usersTable.id, [...userIds]))
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  const approved = vos.filter((v) => v.status === "approved");
  const totalImpact = approved.reduce((s, v) => s + n(v.costImpact), 0);
  const programmeImpact = approved.reduce((s, v) => s + (v.programmeImpactDays ?? 0), 0);

  const data: ReportData = {
    title: "Variation Orders Register",
    subtitle: project.name,
    generatedAt: new Date().toISOString(),
    organisationName: orgName ?? undefined,
    meta: [...projectMeta(project, orgName), { label: "Contract Value", value: inr(n(project.contractValue)) }],
    sections: [
      {
        heading: "Variation Orders",
        stats: [
          { label: "Total VOs", value: vos.length, tone: "info" },
          { label: "Approved", value: approved.length, tone: "positive" },
          { label: "Approved cost impact", value: inr(totalImpact), tone: totalImpact > 0 ? "warning" : "info" },
          { label: "Programme impact", value: `${programmeImpact} days`, tone: programmeImpact > 0 ? "warning" : "info" },
        ],
        columns: [
          { key: "voNumber", label: "VO #" },
          { key: "title", label: "Title" },
          { key: "scopeChange", label: "Scope change" },
          { key: "costImpact", label: "Cost Impact", format: "currency", align: "right", total: true },
          { key: "programmeImpactDays", label: "Days", format: "number", align: "right", total: true },
          { key: "status", label: "Status" },
          { key: "raisedBy", label: "Raised by" },
          { key: "createdAt", label: "Raised", format: "date" },
          { key: "approvedBy", label: "Approved by" },
          { key: "approvedAt", label: "Approved", format: "date" },
        ],
        rows: vos.map((v) => ({
          voNumber: v.voNumber,
          title: v.title,
          scopeChange: v.scopeChange ?? "—",
          costImpact: n(v.costImpact),
          programmeImpactDays: v.programmeImpactDays ?? 0,
          status: prettyStatus(v.status),
          raisedBy: v.raisedById ? (nameMap.get(v.raisedById) ?? "—") : "—",
          createdAt: iso(v.createdAt),
          approvedBy: v.approvedById ? (nameMap.get(v.approvedById) ?? "—") : "—",
          approvedAt: iso(v.approvedAt),
        })),
      },
    ],
  };
  // Silence unused-import lint for the alias helpers above.
  void raised; void approver;
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 7. APPROVALS AUDIT
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/approvals-audit", requireAuth, async (req: Request, res: Response) => {
  const projectIdQ = String(req.query["projectId"] ?? "");
  const ctx = await getAccessCtx(req);
  const canBypass = ctx.role ? PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role) : false;
  const accessible = canBypass ? null : await getAccessibleProjectIds(ctx);

  const from = parseDateParam(req.query["from"]);
  const to = parseDateParam(req.query["to"]);

  const conds: any[] = [];
  if (projectIdQ) {
    if (!canBypass && accessible && !accessible.includes(projectIdQ)) {
      return res.status(403).json({ error: "No access to this project" });
    }
    conds.push(eq(approvalsTable.projectId, projectIdQ));
  } else if (!canBypass && accessible) {
    if (accessible.length === 0) {
      return res.json(emptyReport("Approvals Audit Report", from, to));
    }
    conds.push(inArray(approvalsTable.projectId, accessible));
  }
  if (from) conds.push(gte(approvalsTable.createdAt, from));
  if (to) conds.push(lte(approvalsTable.createdAt, to));

  const rows = await db
    .select({
      id: approvalsTable.id,
      title: approvalsTable.title,
      projectId: approvalsTable.projectId,
      projectName: projectsTable.name,
      entityType: approvalsTable.entityType,
      assignedToRole: approvalsTable.assignedToRole,
      status: approvalsTable.status,
      createdAt: approvalsTable.createdAt,
      resolvedAt: approvalsTable.resolvedAt,
      requesterName: sql<string>`COALESCE(NULLIF(TRIM(COALESCE(${usersTable.firstName}, '') || ' ' || COALESCE(${usersTable.lastName}, '')), ''), ${usersTable.email})`,
    })
    .from(approvalsTable)
    .leftJoin(projectsTable, eq(projectsTable.id, approvalsTable.projectId))
    .leftJoin(usersTable, eq(usersTable.id, approvalsTable.requestedById))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(approvalsTable.createdAt));

  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const resolved = rows.filter((r) => r.resolvedAt);
  const avgTurnaroundMs = resolved.length > 0
    ? resolved.reduce((s, r) => s + (new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / resolved.length
    : 0;
  const avgTurnaroundDays = avgTurnaroundMs / (1000 * 60 * 60 * 24);

  const data: ReportData = {
    title: "Approvals Audit Report",
    subtitle: projectIdQ ? rows[0]?.projectName ?? "" : "All accessible projects",
    generatedAt: new Date().toISOString(),
    meta: rangeMeta(from, to),
    sections: [
      {
        heading: "Approval Activity",
        stats: [
          { label: "Total approvals", value: rows.length, tone: "info" },
          { label: "Approved", value: approved, tone: "positive" },
          { label: "Rejected", value: rejected, tone: "danger" },
          { label: "Pending", value: pending, tone: "warning" },
          { label: "Avg. turnaround", value: `${avgTurnaroundDays.toFixed(1)} days`, tone: "info" },
        ],
        columns: [
          { key: "createdAt", label: "Requested", format: "datetime" },
          { key: "title", label: "Item" },
          { key: "entityType", label: "Type" },
          { key: "projectName", label: "Project" },
          { key: "requesterName", label: "Requested by" },
          { key: "assignedToRole", label: "Assigned to" },
          { key: "status", label: "Status" },
          { key: "resolvedAt", label: "Resolved", format: "datetime" },
          { key: "turnaroundDays", label: "Turnaround (d)", format: "number", align: "right" },
        ],
        rows: rows.map((r) => ({
          createdAt: iso(r.createdAt),
          title: r.title,
          entityType: prettyStatus(r.entityType),
          projectName: r.projectName ?? "—",
          requesterName: r.requesterName ?? "—",
          assignedToRole: r.assignedToRole,
          status: prettyStatus(r.status),
          resolvedAt: iso(r.resolvedAt),
          turnaroundDays: r.resolvedAt
            ? ((new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24)).toFixed(2)
            : "—",
        })),
      },
    ],
  };
  return res.json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// 8. PORTFOLIO REPORT (all accessible projects)
// ════════════════════════════════════════════════════════════════════════════
router.get("/reports/portfolio", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const canBypass = ctx.role ? PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role) : false;
  const accessible = canBypass ? null : await getAccessibleProjectIds(ctx);

  const projectsQ = db.select().from(projectsTable);
  const projects = await (accessible
    ? (accessible.length > 0 ? projectsQ.where(inArray(projectsTable.id, accessible)) : Promise.resolve([] as any[]))
    : projectsQ);

  const portfolio = await Promise.all(projects.map(async (p: any) => {
    // Cheap rollups per project — keep this loop tight.
    const [contractor] = await db
      .select({ total: sql<string>`COALESCE(SUM(${contractorBillsTable.grossAmount}), 0)` })
      .from(contractorBillsTable)
      .where(and(
        eq(contractorBillsTable.projectId, p.id),
        inArray(contractorBillsTable.status, ["pm_certification", "auto_deductions", "gst_invoice", "finance_approval", "payment_released", "ledger_posting", "closed"]),
      ));
    const [grn] = await db
      .select({ total: sql<string>`COALESCE(SUM(${grnsTable.invoiceAmount}), 0)` })
      .from(grnsTable).where(eq(grnsTable.projectId, p.id));
    const [adv] = await db
      .select({ total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.advancePaid}), 0)` })
      .from(purchaseOrdersTable).where(eq(purchaseOrdersTable.projectId, p.id));
    // PO advances are intentionally excluded — see project-summary for the
    // double-counting rationale.
    const utilized = n(contractor?.total) + n(grn?.total);
    const estimated = n(p.contractValue);
    return {
      code: p.code,
      name: p.name,
      status: prettyStatus(p.status),
      plannedPercent: n(p.plannedPercent),
      actualPercent: n(p.actualPercent),
      variance: n(p.actualPercent) - n(p.plannedPercent),
      estimatedCost: estimated,
      amountUtilized: utilized,
      remainingBalance: estimated - utilized,
      utilizationPercent: estimated > 0 ? (utilized / estimated) * 100 : 0,
    };
  }));

  const totalEst = portfolio.reduce((s, p) => s + p.estimatedCost, 0);
  const totalUtil = portfolio.reduce((s, p) => s + p.amountUtilized, 0);
  const behind = portfolio.filter((p) => p.variance < -2).length;
  const overBudget = portfolio.filter((p) => p.utilizationPercent > 100).length;

  const data: ReportData = {
    title: "Portfolio Report",
    subtitle: "All accessible projects",
    generatedAt: new Date().toISOString(),
    meta: [
      { label: "Total projects", value: String(portfolio.length) },
      { label: "Total contract value", value: inr(totalEst) },
      { label: "Total utilized", value: inr(totalUtil) },
    ],
    sections: [
      {
        heading: "Project Portfolio",
        stats: [
          { label: "Projects", value: portfolio.length, tone: "info" },
          { label: "Behind schedule", value: behind, tone: behind > 0 ? "warning" : "positive" },
          { label: "Over budget", value: overBudget, tone: overBudget > 0 ? "danger" : "positive" },
          { label: "Portfolio utilization", value: `${totalEst > 0 ? ((totalUtil / totalEst) * 100).toFixed(1) : "0"}%`, tone: "info" },
        ],
        columns: [
          { key: "code", label: "Code" },
          { key: "name", label: "Project" },
          { key: "status", label: "Status" },
          { key: "plannedPercent", label: "Planned %", format: "percent", align: "right" },
          { key: "actualPercent", label: "Actual %", format: "percent", align: "right" },
          { key: "variance", label: "Variance %", format: "percent", align: "right" },
          { key: "estimatedCost", label: "Estimated", format: "currency", align: "right", total: true },
          { key: "amountUtilized", label: "Utilized", format: "currency", align: "right", total: true },
          { key: "remainingBalance", label: "Remaining", format: "currency", align: "right", total: true },
          { key: "utilizationPercent", label: "Util %", format: "percent", align: "right" },
        ],
        rows: portfolio,
      },
    ],
  };
  return res.json(data);
});

// ── Small formatting helpers ────────────────────────────────────────────────
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dd = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dd.getTime()) ? null : dd.toISOString();
}
function inr(v: number): string {
  if (!Number.isFinite(v)) return "₹0";
  const abs = Math.abs(v); const sign = v < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(0)}`;
}
function prettyStatus(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function emptyReport(title: string, from: Date | null, to: Date | null): ReportData {
  return {
    title,
    generatedAt: new Date().toISOString(),
    meta: rangeMeta(from, to),
    sections: [{ heading: "No data", columns: [], rows: [] }],
  };
}

export default router;
