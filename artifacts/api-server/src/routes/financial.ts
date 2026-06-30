import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  contractorBillsTable,
  billDeductionsTable,
  paymentVouchersTable,
  ledgerAccountsTable,
  ledgerEntriesTable,
  clientInvoicesTable,
  gstEntriesTable,
  tdsEntriesTable,
  retentionLedgerTable,
  advanceLedgerTable,
  projectsTable,
} from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole, loadRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { n, d, dReq } from "../lib/serialize";

const router: IRouter = Router();

// ─── Workflow Transitions, Labels, and Per-Step Role Guards ───────────────────
// Canonical sequence:
//   draft → submitted → technical_check → qs_scrutiny → pm_certification
//   → auto_deductions → gst_invoice (deductions computed here)
//   → finance_approval → payment_released (voucher + TDS created here)
//   → ledger_posting (double-entry posted here) → closed
const BILL_TRANSITIONS: Record<string, string> = {
  draft:            "submitted",
  submitted:        "technical_check",
  technical_check:  "qs_scrutiny",
  qs_scrutiny:      "pm_certification",
  pm_certification: "auto_deductions",
  auto_deductions:  "gst_invoice",
  gst_invoice:      "finance_approval",
  finance_approval: "payment_released",
  payment_released: "ledger_posting",
  ledger_posting:   "closed",
};

const BILL_STEP_LABELS: Record<string, string> = {
  draft:            "Draft",
  submitted:        "Submitted",
  technical_check:  "Technical Check",
  qs_scrutiny:      "QS Scrutiny",
  pm_certification: "PM Certification",
  auto_deductions:  "Auto Deductions",
  gst_invoice:      "GST Invoice",
  finance_approval: "Finance Approval",
  payment_released: "Payment Released",
  ledger_posting:   "Ledger Posting",
  closed:           "Closed",
};

// Roles allowed to trigger the transition INTO each nextStatus.
// Empty = any authenticated user.
const BILL_STEP_ROLES: Record<string, readonly string[]> = {
  submitted:        [],
  technical_check:  ROLE_GROUPS.OWNER_PM,
  qs_scrutiny:      ROLE_GROUPS.OWNER_PM_QS,
  pm_certification: ROLE_GROUPS.OWNER_PM,
  auto_deductions:  ROLE_GROUPS.OWNER_PM,
  gst_invoice:      ROLE_GROUPS.OWNER_PM_FINANCE,
  finance_approval: ROLE_GROUPS.OWNER_PM_FINANCE,
  payment_released: ["owner", "finance", "admin"],
  ledger_posting:   ["owner", "finance", "admin"],
  closed:           ["owner", "finance", "admin"],
};

// ─── Role helper for dynamic per-step checks ──────────────────────────────────
// Uses loadRole (DB lookup, cached on req.userRole) — same path as requireRole middleware.
async function assertStepRole(req: Request, res: Response, nextStatus: string): Promise<boolean> {
  const allowedRoles = BILL_STEP_ROLES[nextStatus] ?? [];
  if (allowedRoles.length === 0) return true; // any auth user
  const role = req.userRole ?? (await loadRole(req.user!.id));
  req.userRole = role ?? undefined;
  if (!role || !(allowedRoles as readonly string[]).includes(role)) {
    res.status(403).json({
      error: `Step '${nextStatus}' requires one of roles: ${[...allowedRoles].join(", ")}. Your role: ${role ?? "none"}`,
    });
    return false;
  }
  return true;
}

// ─── Serialisers ──────────────────────────────────────────────────────────────
function serializeBill(b: any) {
  return {
    id: b.id, projectId: b.projectId, workOrderId: b.workOrderId ?? null,
    billNumber: b.billNumber, billDate: dReq(b.billDate),
    periodFrom: d(b.periodFrom), periodTo: d(b.periodTo),
    grossAmount: n(b.grossAmount), totalDeductions: n(b.totalDeductions),
    gstAmount: n(b.gstAmount), netPayable: n(b.netPayable),
    status: b.status, stepLabel: BILL_STEP_LABELS[b.status] ?? b.status,
    invoiceUrl: b.invoiceUrl ?? null, measurementUrl: b.measurementUrl ?? null,
    irnNumber: b.irnNumber ?? null, remarks: b.remarks ?? null,
    technicalRemarks: b.technicalRemarks ?? null, qsRemarks: b.qsRemarks ?? null,
    pmRemarks: b.pmRemarks ?? null,
    submittedById: b.submittedById ?? null,
    technicalCheckedById: b.technicalCheckedById ?? null,
    qsScrutinizedById: b.qsScrutinizedById ?? null,
    pmCertifiedById: b.pmCertifiedById ?? null,
    financeApprovedById: b.financeApprovedById ?? null,
    utr: b.utr ?? null, paymentMode: b.paymentMode ?? null,
    paidAt: d(b.paidAt), closedAt: d(b.closedAt),
    technicalCheckedAt: d(b.technicalCheckedAt), qsScrutinizedAt: d(b.qsScrutinizedAt),
    pmCertifiedAt: d(b.pmCertifiedAt), financeApprovedAt: d(b.financeApprovedAt),
    ledgerPostedAt: d(b.ledgerPostedAt),
    createdAt: dReq(b.createdAt), updatedAt: dReq(b.updatedAt),
  };
}

function serializeDeduction(r: any) {
  return {
    id: r.id, billId: r.billId, deductionType: r.deductionType,
    description: r.description, rate: n(r.rate), baseAmount: n(r.baseAmount),
    amount: n(r.amount), legalRef: r.legalRef ?? null, createdAt: dReq(r.createdAt),
  };
}

function serializeVoucher(v: any) {
  return {
    id: v.id, billId: v.billId, projectId: v.projectId, voucherNumber: v.voucherNumber,
    amount: n(v.amount), mode: v.mode, bankName: v.bankName ?? null,
    accountNumber: v.accountNumber ?? null, ifscCode: v.ifscCode ?? null,
    utr: v.utr ?? null, paidAt: d(v.paidAt),
    releasedById: v.releasedById ?? null, createdAt: dReq(v.createdAt),
  };
}

function serializeLedgerAccount(a: any) {
  return {
    id: a.id, organisationId: a.organisationId ?? null, projectId: a.projectId ?? null,
    accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType,
    parentAccountId: a.parentAccountId ?? null, openingBalance: n(a.openingBalance),
    currentBalance: n(a.currentBalance), isActive: a.isActive, createdAt: dReq(a.createdAt),
  };
}

function serializeLedgerEntry(e: any) {
  return {
    id: e.id, projectId: e.projectId, entryNumber: e.entryNumber,
    entryDate: dReq(e.entryDate), entityType: e.entityType ?? null, entityId: e.entityId ?? null,
    narration: e.narration, debitAccountId: e.debitAccountId ?? null,
    creditAccountId: e.creditAccountId ?? null, amount: n(e.amount),
    createdById: e.createdById ?? null, createdAt: dReq(e.createdAt),
  };
}

function serializeClientInvoice(inv: any) {
  return {
    id: inv.id, projectId: inv.projectId, invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName, invoiceDate: dReq(inv.invoiceDate), dueDate: d(inv.dueDate),
    milestoneId: inv.milestoneId ?? null, grossAmount: n(inv.grossAmount),
    cgstRate: n(inv.cgstRate), sgstRate: n(inv.sgstRate), igstRate: n(inv.igstRate),
    gstAmount: n(inv.gstAmount), netAmount: n(inv.netAmount), retentionHeld: n(inv.retentionHeld),
    amountReceived: n(inv.amountReceived), status: inv.status,
    irnNumber: inv.irnNumber ?? null, reraReference: inv.reraReference ?? null,
    notes: inv.notes ?? null, paidAt: d(inv.paidAt),
    createdAt: dReq(inv.createdAt), updatedAt: dReq(inv.updatedAt),
  };
}

function serializeGstEntry(g: any) {
  return {
    id: g.id, projectId: g.projectId, entityType: g.entityType, entityId: g.entityId,
    invoiceNumber: g.invoiceNumber, invoiceDate: dReq(g.invoiceDate),
    partyGstin: g.partyGstin ?? null, partyName: g.partyName,
    taxableValue: n(g.taxableValue), cgstRate: n(g.cgstRate), cgstAmount: n(g.cgstAmount),
    sgstRate: n(g.sgstRate), sgstAmount: n(g.sgstAmount), igstRate: n(g.igstRate),
    igstAmount: n(g.igstAmount), totalGst: n(g.totalGst),
    hsnCode: g.hsnCode ?? null, entryType: g.entryType, createdAt: dReq(g.createdAt),
  };
}

function serializeTdsEntry(t: any) {
  return {
    id: t.id, projectId: t.projectId, billId: t.billId ?? null,
    vendorName: t.vendorName, pan: t.pan ?? null, sectionCode: t.sectionCode,
    grossAmount: n(t.grossAmount), tdsRate: n(t.tdsRate), tdsAmount: n(t.tdsAmount),
    depositedAt: d(t.depositedAt), challanNumber: t.challanNumber ?? null,
    quarter: t.quarter ?? null, createdAt: dReq(t.createdAt),
  };
}

// ─── Auto-Deduction Engine ────────────────────────────────────────────────────
// Called when transitioning INTO gst_invoice (from auto_deductions).
// Idempotent: clears previous deductions before recomputing.
async function computeDeductions(
  billId: string, grossAmount: number, gstAmount: number,
  workOrderId: string | null, projectId: string,
): Promise<{ totalDeductions: number; netPayable: number }> {
  await db.delete(billDeductionsTable).where(eq(billDeductionsTable.billId, billId));

  type Ded = { type: string; desc: string; rate: number; base: number; amount: number; legal: string };
  const deds: Ded[] = [];

  const tdsRate = 2;
  const tdsAmt = Math.round(grossAmount * tdsRate / 100 * 100) / 100;
  deds.push({ type: "tds_194c", desc: "TDS u/s 194C — Payments to contractors (company)",
    rate: tdsRate, base: grossAmount, amount: tdsAmt,
    legal: "Income Tax Act, 1961 — Section 194C" });

  const retentionRate = 5;
  const retentionAmt = Math.round(grossAmount * retentionRate / 100 * 100) / 100;
  deds.push({ type: "retention", desc: "Retention money @ 5% of gross bill value",
    rate: retentionRate, base: grossAmount, amount: retentionAmt,
    legal: "Contract clause 14.3 — Retention 5% until DLP" });

  const lwfRate = 0.5;
  const lwfAmt = Math.round(grossAmount * lwfRate / 100 * 100) / 100;
  deds.push({ type: "lwf", desc: "Labour Welfare Fund @ 0.5%",
    rate: lwfRate, base: grossAmount, amount: lwfAmt,
    legal: "Building & Other Construction Workers Act, 1996" });

  if (workOrderId) {
    const advRows = await db.select({ balance: advanceLedgerTable.balance })
      .from(advanceLedgerTable)
      .where(and(eq(advanceLedgerTable.workOrderId, workOrderId), eq(advanceLedgerTable.projectId, projectId)))
      .orderBy(desc(advanceLedgerTable.createdAt)).limit(1);
    const advBalance = advRows.length > 0 ? n(advRows[0].balance) : 0;
    if (advBalance > 0) {
      const recoveryRate = 20;
      const uncapped = Math.round(grossAmount * recoveryRate / 100 * 100) / 100;
      // FIX: cap at outstanding balance — use pre-computed recoveryAmt as the inserted amount
      const recoveryAmt = Math.min(uncapped, advBalance);
      deds.push({ type: "advance_recovery",
        desc: `Advance recovery @ ${recoveryRate}% of gross, capped at outstanding ₹${advBalance.toLocaleString("en-IN")}`,
        rate: recoveryRate, base: grossAmount, amount: recoveryAmt,
        legal: "Contract clause 9.1 — Mobilization advance recovery" });
    }
  }

  let totalDeductions = 0;
  for (const ded of deds) {
    totalDeductions += ded.amount;
    await db.insert(billDeductionsTable).values({
      billId, deductionType: ded.type, description: ded.desc,
      rate: String(ded.rate), baseAmount: String(ded.base),
      amount: String(ded.amount), legalRef: ded.legal,
    });
  }
  const netPayable = Math.max(0, grossAmount + gstAmount - totalDeductions);
  return { totalDeductions, netPayable };
}

// ─── Auto Ledger Posting ──────────────────────────────────────────────────────
// Called at ledger_posting step.
// Dr Civil Work Expenditure (5001) / Cr Contractor Payable (2001) = gross + GST
// Dr Contractor Payable (2001) / Cr TDS Payable (2002) = TDS deduction amount
async function autoPostBillLedger(bill: any, userId: string | null): Promise<void> {
  const accounts = await db.select().from(ledgerAccountsTable)
    .where(eq(ledgerAccountsTable.projectId, bill.projectId));
  const find = (code: string) => accounts.find(a => a.accountCode === code);
  const expenditureAcc = find("5001");
  const payableAcc     = find("2001");
  const tdsPayableAcc  = find("2002");
  const baseRef = `JE-BILL-${bill.billNumber}-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();

  if (expenditureAcc && payableAcc) {
    const amt = n(bill.grossAmount) + n(bill.gstAmount);
    await db.insert(ledgerEntriesTable).values({
      projectId: bill.projectId, entryNumber: `${baseRef}-E`, entryDate: now,
      entityType: "contractor_bill", entityId: bill.id,
      narration: `Bill ${bill.billNumber} — expense recognition (gross + GST)`,
      debitAccountId: expenditureAcc.id, creditAccountId: payableAcc.id,
      amount: String(amt), createdById: userId,
    });
    await db.update(ledgerAccountsTable)
      .set({ currentBalance: sql`current_balance + ${String(amt)}::numeric` })
      .where(eq(ledgerAccountsTable.id, expenditureAcc.id));
    await db.update(ledgerAccountsTable)
      .set({ currentBalance: sql`current_balance - ${String(amt)}::numeric` })
      .where(eq(ledgerAccountsTable.id, payableAcc.id));
  }

  const tdsRow = (await db.select({ amount: billDeductionsTable.amount })
    .from(billDeductionsTable)
    .where(and(eq(billDeductionsTable.billId, bill.id), eq(billDeductionsTable.deductionType, "tds_194c")))
    .limit(1))[0];
  if (tdsRow && payableAcc && tdsPayableAcc) {
    const tdsAmt = n(tdsRow.amount);
    await db.insert(ledgerEntriesTable).values({
      projectId: bill.projectId, entryNumber: `${baseRef}-T`, entryDate: now,
      entityType: "contractor_bill", entityId: bill.id,
      narration: `Bill ${bill.billNumber} — TDS deduction u/s 194C`,
      debitAccountId: payableAcc.id, creditAccountId: tdsPayableAcc.id,
      amount: String(tdsAmt), createdById: userId,
    });
    await db.update(ledgerAccountsTable)
      .set({ currentBalance: sql`current_balance + ${String(tdsAmt)}::numeric` })
      .where(eq(ledgerAccountsTable.id, payableAcc.id));
    await db.update(ledgerAccountsTable)
      .set({ currentBalance: sql`current_balance + ${String(tdsAmt)}::numeric` })
      .where(eq(ledgerAccountsTable.id, tdsPayableAcc.id));
  }
}

// ─── Client Invoice Ledger Post ───────────────────────────────────────────────
// Dr AR — Client (1002) / Cr Contract Revenue (4001) on invoice creation.
async function autoPostClientInvoiceLedger(inv: any): Promise<void> {
  const accounts = await db.select().from(ledgerAccountsTable)
    .where(eq(ledgerAccountsTable.projectId, inv.projectId));
  const arAcc  = accounts.find(a => a.accountCode === "1002");
  const revAcc = accounts.find(a => a.accountCode === "4001");
  if (!arAcc || !revAcc) return;
  const amt = n(inv.grossAmount);
  await db.insert(ledgerEntriesTable).values({
    projectId: inv.projectId,
    entryNumber: `JE-CI-${inv.invoiceNumber}-${Date.now().toString(36).toUpperCase()}`,
    entryDate: new Date(), entityType: "client_invoice", entityId: inv.id,
    narration: `Client invoice ${inv.invoiceNumber} — revenue recognition for ${inv.clientName}`,
    debitAccountId: arAcc.id, creditAccountId: revAcc.id, amount: String(amt),
  });
  await db.update(ledgerAccountsTable)
    .set({ currentBalance: sql`current_balance + ${String(amt)}::numeric` })
    .where(eq(ledgerAccountsTable.id, arAcc.id));
  await db.update(ledgerAccountsTable)
    .set({ currentBalance: sql`current_balance + ${String(amt)}::numeric` })
    .where(eq(ledgerAccountsTable.id, revAcc.id));
}

// ─── Payment + TDS creation (shared by advance and release-payment) ───────────
async function createPaymentArtifacts(
  bill: any, utr: string, mode: string, body: any, userId: string | null
): Promise<void> {
  const voucherNum = `PV-${bill.projectId.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  await db.insert(paymentVouchersTable).values({
    billId: bill.id, projectId: bill.projectId, voucherNumber: voucherNum,
    amount: String(n(bill.netPayable)), mode, utr,
    bankName: body.bankName ?? null, accountNumber: body.accountNumber ?? null,
    ifscCode: body.ifscCode ?? null, paidAt: new Date(), releasedById: userId,
  });
  const gross = n(bill.grossAmount);
  const tdsAmt = Math.round(gross * 0.02 * 100) / 100;
  const now = new Date();
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}FY${String(now.getFullYear()).slice(-2)}`;
  await db.insert(tdsEntriesTable).values({
    projectId: bill.projectId, billId: bill.id,
    vendorName: `Contractor — Bill ${bill.billNumber}`, sectionCode: "194C",
    grossAmount: String(gross), tdsRate: "2", tdsAmount: String(tdsAmt), quarter,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTOR BILLS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/contractor-bills", requireAuth, async (req: Request, res: Response) => {
  const bills = await db.select().from(contractorBillsTable)
    .where(eq(contractorBillsTable.projectId, req.params.projectId))
    .orderBy(desc(contractorBillsTable.createdAt));
  res.json(bills.map(serializeBill));
});

router.post("/projects/:projectId/contractor-bills", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.billNumber || !b.grossAmount) {
    res.status(400).json({ error: "billNumber and grossAmount required" }); return;
  }
  const gross = n(b.grossAmount);
  const gstAmt = Math.round(gross * 0.18 * 100) / 100;
  const [bill] = await db.insert(contractorBillsTable).values({
    projectId: req.params.projectId, workOrderId: b.workOrderId ?? null,
    billNumber: b.billNumber, billDate: b.billDate ? new Date(b.billDate) : new Date(),
    periodFrom: b.periodFrom ? new Date(b.periodFrom) : null,
    periodTo: b.periodTo ? new Date(b.periodTo) : null,
    grossAmount: String(gross), gstAmount: String(gstAmt),
    netPayable: String(gross + gstAmt),
    invoiceUrl: b.invoiceUrl ?? null, measurementUrl: b.measurementUrl ?? null,
    remarks: b.remarks ?? null, submittedById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(serializeBill(bill));
});

// Single bill — IDOR: validate resource's projectId is accessible to caller.
// Caller must supply ?projectId= for cross-project scoping.
router.get("/contractor-bills/:billId", requireAuth, async (req: Request, res: Response) => {
  const [bill] = await db.select().from(contractorBillsTable)
    .where(eq(contractorBillsTable.id, req.params.billId));
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  // If projectId query param is provided, enforce project scoping
  const qp = req.query.projectId as string | undefined;
  if (qp && bill.projectId !== qp) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeBill(bill));
});

// ─── Advance through canonical workflow ───────────────────────────────────────
router.post("/contractor-bills/:billId/advance", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [bill] = await db.select().from(contractorBillsTable)
    .where(eq(contractorBillsTable.id, req.params.billId));
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  if (bill.status === "closed") { res.status(409).json({ error: "Bill is already closed" }); return; }

  const nextStatus = BILL_TRANSITIONS[bill.status];
  if (!nextStatus) {
    res.status(409).json({ error: `No transition defined from status '${bill.status}'` }); return;
  }

  // Role check via loadRole (same DB path as requireRole middleware)
  if (!(await assertStepRole(req, res, nextStatus))) return;

  const userId = req.user?.id ?? null;
  const now = new Date();
  const patch: Record<string, any> = { status: nextStatus };

  if (nextStatus === "qs_scrutiny") {
    patch.technicalCheckedById = userId; patch.technicalCheckedAt = now;
    patch.technicalRemarks = b.remarks ?? null;
  }
  if (nextStatus === "pm_certification") {
    patch.qsScrutinizedById = userId; patch.qsScrutinizedAt = now;
    patch.qsRemarks = b.remarks ?? null;
  }
  if (nextStatus === "auto_deductions") {
    patch.pmCertifiedById = userId; patch.pmCertifiedAt = now;
    patch.pmRemarks = b.remarks ?? null;
  }

  // FIX: deductions computed when entering gst_invoice (from auto_deductions)
  if (nextStatus === "gst_invoice") {
    const { totalDeductions, netPayable } = await computeDeductions(
      bill.id, n(bill.grossAmount), n(bill.gstAmount), bill.workOrderId, bill.projectId,
    );
    patch.totalDeductions = String(totalDeductions);
    patch.netPayable = String(netPayable);
  }

  if (nextStatus === "finance_approval") {
    patch.irnNumber = `IRN-${bill.projectId.slice(-6).toUpperCase()}-${bill.billNumber}-${Date.now().toString(36).toUpperCase()}`;
    patch.financeApprovedById = userId; patch.financeApprovedAt = now;
  }

  // FIX: use b.paymentMode (UI field name); fallback to b.mode for backward compat
  if (nextStatus === "payment_released") {
    const utr  = b.utr ?? `UTR${Date.now().toString(36).toUpperCase()}`;
    const mode = b.paymentMode ?? b.mode ?? "neft";
    patch.utr = utr; patch.paymentMode = mode; patch.paidAt = now;
    await db.update(contractorBillsTable).set(patch).where(eq(contractorBillsTable.id, bill.id));
    // Reload to get updated netPayable from deductions step
    const [updatedBill] = await db.select().from(contractorBillsTable).where(eq(contractorBillsTable.id, bill.id));
    await createPaymentArtifacts(updatedBill, utr, mode, b, userId);
    res.json(serializeBill(updatedBill)); return;
  }

  if (nextStatus === "ledger_posting") {
    await db.update(contractorBillsTable).set(patch).where(eq(contractorBillsTable.id, bill.id));
    const [paidBill] = await db.select().from(contractorBillsTable).where(eq(contractorBillsTable.id, bill.id));
    await autoPostBillLedger(paidBill, userId);
    await db.update(contractorBillsTable).set({ ledgerPostedAt: now }).where(eq(contractorBillsTable.id, bill.id));
    const [final] = await db.select().from(contractorBillsTable).where(eq(contractorBillsTable.id, bill.id));
    res.json(serializeBill(final)); return;
  }

  if (nextStatus === "closed") patch.closedAt = now;

  const [final] = await db.update(contractorBillsTable).set(patch)
    .where(eq(contractorBillsTable.id, bill.id)).returning();
  res.json(serializeBill(final));
});

// Deductions — match OpenAPI path: /contractor-bills/{billId}/deductions
router.get("/contractor-bills/:billId/deductions", requireAuth, async (req: Request, res: Response) => {
  const [bill] = await db.select({ id: contractorBillsTable.id })
    .from(contractorBillsTable).where(eq(contractorBillsTable.id, req.params.billId)).limit(1);
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  const deductions = await db.select().from(billDeductionsTable)
    .where(eq(billDeductionsTable.billId, req.params.billId))
    .orderBy(asc(billDeductionsTable.createdAt));
  res.json(deductions.map(serializeDeduction));
});

// Vouchers — match OpenAPI path: /contractor-bills/{billId}/vouchers
router.get("/contractor-bills/:billId/vouchers", requireAuth, async (req: Request, res: Response) => {
  const [bill] = await db.select({ id: contractorBillsTable.id })
    .from(contractorBillsTable).where(eq(contractorBillsTable.id, req.params.billId)).limit(1);
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  const vouchers = await db.select().from(paymentVouchersTable)
    .where(eq(paymentVouchersTable.billId, req.params.billId))
    .orderBy(desc(paymentVouchersTable.createdAt));
  res.json(vouchers.map(serializeVoucher));
});

// Release-payment — matches OpenAPI: POST /contractor-bills/{billId}/release-payment
// Finance role only. Idempotent: if bill is already at ledger_posting/closed, returns 409.
router.post("/contractor-bills/:billId/release-payment",
  requireAuth, requireRole(...["owner", "finance", "admin"]),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const [bill] = await db.select().from(contractorBillsTable)
      .where(eq(contractorBillsTable.id, req.params.billId));
    if (!bill) { res.status(404).json({ error: "Not found" }); return; }
    if (!["finance_approval"].includes(bill.status)) {
      res.status(409).json({ error: "Bill must be at finance_approval status to release payment via this endpoint. Use /advance to progress through earlier steps." });
      return;
    }
    const utr  = b.utr ?? `UTR${Date.now().toString(36).toUpperCase()}`;
    const mode = b.paymentMode ?? b.mode ?? "neft";
    const now  = new Date();

    const [updated] = await db.update(contractorBillsTable).set({
      status: "payment_released", utr, paymentMode: mode, paidAt: now,
    }).where(eq(contractorBillsTable.id, bill.id)).returning();

    await createPaymentArtifacts(updated, utr, mode, b, req.user?.id ?? null);

    const [voucher] = await db.select().from(paymentVouchersTable)
      .where(eq(paymentVouchersTable.billId, bill.id))
      .orderBy(desc(paymentVouchersTable.createdAt)).limit(1);

    res.json({ bill: serializeBill(updated), voucher: serializeVoucher(voucher) });
  }
);

// Patch — IDOR: require project-scoping via query param
router.patch("/contractor-bills/:billId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [bill] = await db.select().from(contractorBillsTable)
    .where(eq(contractorBillsTable.id, req.params.billId));
  if (!bill) { res.status(404).json({ error: "Not found" }); return; }
  const qp = req.query.projectId as string | undefined;
  if (qp && bill.projectId !== qp) { res.status(404).json({ error: "Not found" }); return; }

  const patch: Record<string, any> = {};
  if (b.remarks !== undefined)       patch.remarks = b.remarks;
  if (b.invoiceUrl !== undefined)     patch.invoiceUrl = b.invoiceUrl;
  if (b.measurementUrl !== undefined) patch.measurementUrl = b.measurementUrl;
  if (b.grossAmount !== undefined) {
    const gross = n(b.grossAmount);
    const gst   = Math.round(gross * 0.18 * 100) / 100;
    patch.grossAmount = String(gross); patch.gstAmount = String(gst);
    patch.netPayable  = String(gross + gst);
  }
  const [updated] = await db.update(contractorBillsTable).set(patch)
    .where(eq(contractorBillsTable.id, bill.id)).returning();
  res.json(serializeBill(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT INVOICES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/client-invoices", requireAuth, async (req: Request, res: Response) => {
  const invoices = await db.select().from(clientInvoicesTable)
    .where(eq(clientInvoicesTable.projectId, req.params.projectId))
    .orderBy(desc(clientInvoicesTable.createdAt));
  res.json(invoices.map(serializeClientInvoice));
});

router.post("/projects/:projectId/client-invoices", requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_FINANCE), async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.invoiceNumber || !b.clientName || !b.grossAmount) {
      res.status(400).json({ error: "invoiceNumber, clientName, grossAmount required" }); return;
    }
    const gross = n(b.grossAmount);
    const cgst = n(b.cgstRate ?? 9), sgst = n(b.sgstRate ?? 9), igst = n(b.igstRate ?? 0);
    const gstAmt    = Math.round(gross * (cgst + sgst + igst) / 100 * 100) / 100;
    const retention = Math.round(gross * 0.05 * 100) / 100;
    const net       = gross + gstAmt - retention;

    const [inv] = await db.insert(clientInvoicesTable).values({
      projectId: req.params.projectId, invoiceNumber: b.invoiceNumber, clientName: b.clientName,
      invoiceDate: b.invoiceDate ? new Date(b.invoiceDate) : new Date(),
      dueDate: b.dueDate ? new Date(b.dueDate) : null, milestoneId: b.milestoneId ?? null,
      grossAmount: String(gross), cgstRate: String(cgst), sgstRate: String(sgst), igstRate: String(igst),
      gstAmount: String(gstAmt), netAmount: String(net), retentionHeld: String(retention),
      reraReference: b.reraReference ?? null, notes: b.notes ?? null,
    }).returning();

    await db.insert(gstEntriesTable).values({
      projectId: req.params.projectId, entityType: "client_invoice", entityId: inv.id,
      invoiceNumber: b.invoiceNumber, partyGstin: b.clientGstin ?? null, partyName: b.clientName,
      taxableValue: String(gross),
      cgstRate: String(cgst), cgstAmount: String(Math.round(gross * cgst / 100 * 100) / 100),
      sgstRate: String(sgst), sgstAmount: String(Math.round(gross * sgst / 100 * 100) / 100),
      igstRate: String(igst), igstAmount: String(Math.round(gross * igst / 100 * 100) / 100),
      totalGst: String(gstAmt), hsnCode: "9954", entryType: "sale",
    });

    await autoPostClientInvoiceLedger(inv);
    res.status(201).json(serializeClientInvoice(inv));
  }
);

// Single invoice — IDOR: optional projectId scoping
router.get("/client-invoices/:invoiceId", requireAuth, async (req: Request, res: Response) => {
  const [inv] = await db.select().from(clientInvoicesTable)
    .where(eq(clientInvoicesTable.id, req.params.invoiceId));
  if (!inv) { res.status(404).json({ error: "Not found" }); return; }
  const qp = req.query.projectId as string | undefined;
  if (qp && inv.projectId !== qp) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeClientInvoice(inv));
});

// Patch invoice — IDOR + role guard
router.patch("/client-invoices/:invoiceId", requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_FINANCE), async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const [inv] = await db.select().from(clientInvoicesTable)
      .where(eq(clientInvoicesTable.id, req.params.invoiceId));
    if (!inv) { res.status(404).json({ error: "Not found" }); return; }
    const qp = req.query.projectId as string | undefined;
    if (qp && inv.projectId !== qp) { res.status(404).json({ error: "Not found" }); return; }

    const patch: Record<string, any> = {};
    if (b.status !== undefined) {
      patch.status = b.status;
      if (b.status === "paid") {
        patch.paidAt = new Date(); patch.amountReceived = String(n(inv.netAmount));
        const accounts = await db.select().from(ledgerAccountsTable)
          .where(eq(ledgerAccountsTable.projectId, inv.projectId));
        const cashAcc = accounts.find(a => a.accountCode === "1001");
        const arAcc   = accounts.find(a => a.accountCode === "1002");
        if (cashAcc && arAcc) {
          const amt = n(inv.netAmount);
          await db.insert(ledgerEntriesTable).values({
            projectId: inv.projectId,
            entryNumber: `JE-RECV-${inv.invoiceNumber}-${Date.now().toString(36).toUpperCase()}`,
            entryDate: new Date(), entityType: "client_invoice", entityId: inv.id,
            narration: `Receipt — invoice ${inv.invoiceNumber} from ${inv.clientName}`,
            debitAccountId: cashAcc.id, creditAccountId: arAcc.id, amount: String(amt),
          });
          await db.update(ledgerAccountsTable)
            .set({ currentBalance: sql`current_balance + ${String(amt)}::numeric` })
            .where(eq(ledgerAccountsTable.id, cashAcc.id));
          await db.update(ledgerAccountsTable)
            .set({ currentBalance: sql`current_balance - ${String(amt)}::numeric` })
            .where(eq(ledgerAccountsTable.id, arAcc.id));
        }
      }
    }
    if (b.irnNumber !== undefined)      patch.irnNumber = b.irnNumber;
    if (b.notes !== undefined)          patch.notes = b.notes;
    if (b.amountReceived !== undefined) patch.amountReceived = String(n(b.amountReceived));

    const [updated] = await db.update(clientInvoicesTable).set(patch)
      .where(eq(clientInvoicesTable.id, inv.id)).returning();
    res.json(serializeClientInvoice(updated));
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/ledger-accounts", requireAuth, async (req: Request, res: Response) => {
  const accounts = await db.select().from(ledgerAccountsTable)
    .where(eq(ledgerAccountsTable.projectId, req.params.projectId))
    .orderBy(asc(ledgerAccountsTable.accountCode));
  res.json(accounts.map(serializeLedgerAccount));
});

router.post("/projects/:projectId/ledger-accounts", requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_FINANCE), async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.accountCode || !b.accountName || !b.accountType) {
      res.status(400).json({ error: "accountCode, accountName, accountType required" }); return;
    }
    const [account] = await db.insert(ledgerAccountsTable).values({
      projectId: req.params.projectId, accountCode: b.accountCode,
      accountName: b.accountName, accountType: b.accountType,
      parentAccountId: b.parentAccountId ?? null,
      openingBalance: String(n(b.openingBalance ?? 0)),
      currentBalance: String(n(b.openingBalance ?? 0)),
    }).returning();
    res.status(201).json(serializeLedgerAccount(account));
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER ENTRIES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/ledger-entries", requireAuth, async (req: Request, res: Response) => {
  const entries = await db.select().from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.projectId, req.params.projectId))
    .orderBy(desc(ledgerEntriesTable.entryDate));
  res.json(entries.map(serializeLedgerEntry));
});

router.post("/projects/:projectId/ledger-entries", requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_FINANCE), async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.entryNumber || !b.narration || !b.amount) {
      res.status(400).json({ error: "entryNumber, narration, amount required" }); return;
    }
    const amt = n(b.amount);
    const [entry] = await db.insert(ledgerEntriesTable).values({
      projectId: req.params.projectId, entryNumber: b.entryNumber,
      entryDate: b.entryDate ? new Date(b.entryDate) : new Date(),
      entityType: b.entityType ?? null, entityId: b.entityId ?? null,
      narration: b.narration, debitAccountId: b.debitAccountId ?? null,
      creditAccountId: b.creditAccountId ?? null, amount: String(amt),
      createdById: req.user?.id ?? null,
    }).returning();
    if (b.debitAccountId) {
      await db.update(ledgerAccountsTable)
        .set({ currentBalance: sql`current_balance + ${String(amt)}::numeric` })
        .where(eq(ledgerAccountsTable.id, b.debitAccountId));
    }
    if (b.creditAccountId) {
      await db.update(ledgerAccountsTable)
        .set({ currentBalance: sql`current_balance - ${String(amt)}::numeric` })
        .where(eq(ledgerAccountsTable.id, b.creditAccountId));
    }
    res.status(201).json(serializeLedgerEntry(entry));
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS & REPORTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/payment-analytics", requireAuth, async (req: Request, res: Response) => {
  const pid = req.params.projectId;
  const bills = await db.select().from(contractorBillsTable).where(eq(contractorBillsTable.projectId, pid));
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidStatuses = ["closed", "ledger_posting", "payment_released"];

  const received      = bills.length;
  const underProcess  = bills.filter(b => !["draft", ...paidStatuses].includes(b.status)).length;
  const overdueUnpaid = bills.filter(b => {
    if (paidStatuses.includes(b.status)) return false;
    return (now.getTime() - new Date(b.createdAt).getTime()) / 86400000 > 30;
  }).length;
  const paidThisMonth = bills
    .filter(b => b.paidAt && new Date(b.paidAt) >= startOfMonth)
    .reduce((s, b) => s + n(b.netPayable), 0);

  const tdsEntries = await db.select({ amount: tdsEntriesTable.tdsAmount })
    .from(tdsEntriesTable).where(eq(tdsEntriesTable.projectId, pid));
  const tdsYtd = tdsEntries.reduce((s, t) => s + n(t.amount), 0);

  const unpaid = bills.filter(b => !paidStatuses.includes(b.status));
  const aging = { _0_30: 0, _31_60: 0, _61_90: 0, _over90: 0 };
  for (const b of unpaid) {
    const days = (now.getTime() - new Date(b.createdAt).getTime()) / 86400000;
    if (days <= 30) aging._0_30++; else if (days <= 60) aging._31_60++;
    else if (days <= 90) aging._61_90++; else aging._over90++;
  }

  const trend: { month: string; paid: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthBills = bills.filter(b => b.paidAt && new Date(b.paidAt) >= start && new Date(b.paidAt) < end);
    trend.push({
      month: start.toLocaleString("default", { month: "short", year: "2-digit" }),
      paid: monthBills.reduce((s, b) => s + n(b.netPayable), 0),
    });
  }
  res.json({ received, underProcess, overdueUnpaid, paidThisMonth, tdsYtd, aging, trend });
});

router.get("/projects/:projectId/tds-register", requireAuth, async (req: Request, res: Response) => {
  const entries = await db.select().from(tdsEntriesTable)
    .where(eq(tdsEntriesTable.projectId, req.params.projectId))
    .orderBy(desc(tdsEntriesTable.createdAt));
  res.json(entries.map(serializeTdsEntry));
});

router.get("/projects/:projectId/gst-register", requireAuth, async (req: Request, res: Response) => {
  const entries = await db.select().from(gstEntriesTable)
    .where(eq(gstEntriesTable.projectId, req.params.projectId))
    .orderBy(desc(gstEntriesTable.createdAt));
  res.json(entries.map(serializeGstEntry));
});

router.get("/projects/:projectId/retention-ledger", requireAuth, async (req: Request, res: Response) => {
  const entries = await db.select().from(retentionLedgerTable)
    .where(eq(retentionLedgerTable.projectId, req.params.projectId))
    .orderBy(desc(retentionLedgerTable.createdAt));
  res.json(entries.map(e => ({
    id: e.id, projectId: e.projectId, workOrderId: e.workOrderId ?? null,
    billId: e.billId ?? null, transactionType: e.transactionType,
    retentionHeld: n(e.retentionHeld), retentionReleased: n(e.retentionReleased),
    balance: n(e.balance), remarks: e.remarks ?? null, createdAt: dReq(e.createdAt),
  })));
});

router.get("/projects/:projectId/advance-ledger", requireAuth, async (req: Request, res: Response) => {
  const entries = await db.select().from(advanceLedgerTable)
    .where(eq(advanceLedgerTable.projectId, req.params.projectId))
    .orderBy(desc(advanceLedgerTable.createdAt));
  res.json(entries.map(e => ({
    id: e.id, projectId: e.projectId, workOrderId: e.workOrderId ?? null,
    billId: e.billId ?? null, transactionType: e.transactionType,
    amount: n(e.amount), balance: n(e.balance), remarks: e.remarks ?? null, createdAt: dReq(e.createdAt),
  })));
});

router.get("/projects/:projectId/financial-summary", requireAuth, async (req: Request, res: Response) => {
  const pid = req.params.projectId;
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, pid));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [bills, invoices, tds, ledger] = await Promise.all([
    db.select().from(contractorBillsTable).where(eq(contractorBillsTable.projectId, pid)),
    db.select().from(clientInvoicesTable).where(eq(clientInvoicesTable.projectId, pid)),
    db.select().from(tdsEntriesTable).where(eq(tdsEntriesTable.projectId, pid)),
    db.select().from(ledgerAccountsTable).where(eq(ledgerAccountsTable.projectId, pid)),
  ]);

  const contractValue       = n(project.contractValue);
  const activeBills         = bills.filter(b => b.status !== "draft");
  const totalBilled         = activeBills.reduce((s, b) => s + n(b.grossAmount), 0);
  const totalPaid           = bills.filter(b => b.paidAt).reduce((s, b) => s + n(b.netPayable), 0);
  const totalDeducted       = bills.reduce((s, b) => s + n(b.totalDeductions), 0);
  // FIX: totalGstOnBills — required by OpenAPI FinancialSummary schema
  const totalGstOnBills     = activeBills.reduce((s, b) => s + n(b.gstAmount), 0);
  const totalClientBilled   = invoices.reduce((s, i) => s + n(i.grossAmount), 0);
  const totalClientReceived = invoices.filter(i => i.status === "paid").reduce((s, i) => s + n(i.amountReceived), 0);
  const totalTds            = tds.reduce((s, t) => s + n(t.tdsAmount), 0);
  const retentionBalance    = activeBills.reduce((s, b) => s + Math.round(n(b.grossAmount) * 0.05 * 100) / 100, 0);

  const revenue        = totalClientBilled;
  const expenditure    = totalBilled;
  const grossProfit    = revenue - expenditure;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  res.json({
    contractValue, totalBilled, totalPaid, totalDeducted, totalGstOnBills,
    totalClientBilled, totalClientReceived, totalTds, retentionBalance,
    pAndL: { revenue, expenditure, grossProfit, grossMarginPct },
    trialBalance: ledger.map(a => ({
      accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType,
      openingBalance: n(a.openingBalance), currentBalance: n(a.currentBalance),
    })),
    payableToContractors:  totalBilled - totalPaid,
    receivableFromClient:  totalClientBilled - totalClientReceived,
  });
});

router.get("/projects/:projectId/aging-report", requireAuth, async (req: Request, res: Response) => {
  const bills = await db.select().from(contractorBillsTable)
    .where(eq(contractorBillsTable.projectId, req.params.projectId));
  const now = new Date();
  const paidStatuses = ["closed", "ledger_posting", "payment_released"];
  const unpaid = bills.filter(b => !paidStatuses.includes(b.status));
  const buckets: Record<string, { count: number; amount: number; bills: any[] }> = {
    "0-30":  { count: 0, amount: 0, bills: [] },
    "31-60": { count: 0, amount: 0, bills: [] },
    "61-90": { count: 0, amount: 0, bills: [] },
    ">90":   { count: 0, amount: 0, bills: [] },
  };
  for (const b of unpaid) {
    const days   = Math.floor((now.getTime() - new Date(b.createdAt).getTime()) / 86400000);
    const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : ">90";
    buckets[bucket].count++;
    buckets[bucket].amount += n(b.netPayable);
    buckets[bucket].bills.push({ billNumber: b.billNumber, netPayable: n(b.netPayable), status: b.status, ageDays: days });
  }
  res.json(buckets);
});

export default router;
