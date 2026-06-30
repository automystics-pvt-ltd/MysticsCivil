import {
  db,
  projectsTable,
  contractorBillsTable,
  billDeductionsTable,
  paymentVouchersTable,
  clientInvoicesTable,
  gstEntriesTable,
  tdsEntriesTable,
  retentionLedgerTable,
  advanceLedgerTable,
  ledgerAccountsTable,
  ledgerEntriesTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";

async function main() {
  console.log("🌱  Seeding Phase 3 — Financial Core…");

  // Pick first project
  const projects = await db.select().from(projectsTable).orderBy(asc(projectsTable.createdAt)).limit(1);
  if (!projects.length) { console.error("No projects found — run seed-projects first"); process.exit(1); }
  const project = projects[0];
  const pid = project.id;
  console.log(`   Project: ${project.name} (${pid})`);

  // ── Ledger Accounts ────────────────────────────────────────────────────────
  const accounts = [
    { code: "1001", name: "Cash & Bank", type: "asset" },
    { code: "1002", name: "Accounts Receivable — Client", type: "asset" },
    { code: "1003", name: "Advance to Contractors", type: "asset" },
    { code: "1004", name: "Retention Money Recoverable", type: "asset" },
    { code: "2001", name: "Accounts Payable — Contractors", type: "liability" },
    { code: "2002", name: "TDS Payable u/s 194C", type: "liability" },
    { code: "2003", name: "GST Payable (CGST)", type: "liability" },
    { code: "2004", name: "GST Payable (SGST)", type: "liability" },
    { code: "3001", name: "Owner's Capital", type: "capital" },
    { code: "4001", name: "Contract Revenue", type: "revenue" },
    { code: "4002", name: "Retention Released — Revenue", type: "revenue" },
    { code: "5001", name: "Civil Work Expenditure", type: "expenditure" },
    { code: "5002", name: "Labour Welfare Fund", type: "expenditure" },
    { code: "5003", name: "Miscellaneous Expenditure", type: "expenditure" },
    { code: "6001", name: "GST Input Credit", type: "tax" },
  ];

  const accountIds: Record<string, string> = {};
  for (const acct of accounts) {
    const existing = await db.select().from(ledgerAccountsTable)
      .where(eq(ledgerAccountsTable.accountCode, acct.code));
    if (existing.length) { accountIds[acct.code] = existing[0].id; continue; }
    const opening = acct.type === "asset" ? "500000" : acct.type === "revenue" ? "0" : "100000";
    const [row] = await db.insert(ledgerAccountsTable).values({
      projectId: pid,
      accountCode: acct.code,
      accountName: acct.name,
      accountType: acct.type,
      openingBalance: opening,
      currentBalance: opening,
    }).returning();
    accountIds[acct.code] = row.id;
  }
  console.log(`   ✓ ${accounts.length} ledger accounts`);

  // ── Contractor Bills — 15 across all workflow stages ──────────────────────
  const billDefs = [
    { num: "RA-001", gross: 1850000, status: "closed",            paidAt: sub(0),   utr: "SBIN0023451", mode: "neft" },
    { num: "RA-002", gross: 2200000, status: "closed",            paidAt: sub(5),   utr: "HDFC0092311", mode: "rtgs" },
    { num: "RA-003", gross: 980000,  status: "closed",            paidAt: sub(12),  utr: "ICIC0045321", mode: "neft" },
    { num: "RA-004", gross: 3100000, status: "payment_released",  paidAt: sub(2) },
    { num: "RA-005", gross: 1450000, status: "payment_released",  paidAt: sub(3) },
    { num: "RA-006", gross: 2780000, status: "finance_approval" },
    { num: "RA-007", gross: 1620000, status: "gst_invoice" },
    { num: "RA-008", gross: 890000,  status: "auto_deductions" },
    { num: "RA-009", gross: 2050000, status: "pm_certification" },
    { num: "RA-010", gross: 1370000, status: "qs_scrutiny" },
    { num: "RA-011", gross: 760000,  status: "technical_check" },
    { num: "RA-012", gross: 1940000, status: "submitted" },
    { num: "RA-013", gross: 830000,  status: "draft" },
    { num: "RA-014", gross: 2410000, status: "draft" },
    { num: "RA-015", gross: 1100000, status: "draft" },
  ];

  function sub(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d; }

  const billIds: string[] = [];
  for (const def of billDefs) {
    const existing = await db.select().from(contractorBillsTable)
      .where(eq(contractorBillsTable.billNumber, def.num));
    if (existing.length) { billIds.push(existing[0].id); continue; }

    const gross = def.gross;
    const gst = Math.round(gross * 0.18 * 100) / 100;
    const tds = Math.round(gross * 0.02 * 100) / 100;
    const retention = Math.round(gross * 0.05 * 100) / 100;
    const lwf = Math.round(gross * 0.005 * 100) / 100;
    const totalDed = tds + retention + lwf;
    const net = gross + gst - totalDed;

    const isPaid = def.status === "closed" || def.status === "payment_released";
    const hasDeductions = ["closed", "payment_released", "finance_approval", "gst_invoice", "auto_deductions"].includes(def.status);
    const irnNum = ["closed", "payment_released", "finance_approval", "gst_invoice"].includes(def.status)
      ? `IRN-${pid.slice(-6).toUpperCase()}-${def.num}-A1B2C3` : null;

    const billDate = new Date(); billDate.setDate(billDate.getDate() - (15 - billDefs.indexOf(def)) * 3);
    const periodFrom = new Date(billDate); periodFrom.setDate(periodFrom.getDate() - 30);

    const [bill] = await db.insert(contractorBillsTable).values({
      projectId: pid,
      billNumber: def.num,
      billDate,
      periodFrom,
      periodTo: billDate,
      grossAmount: String(gross),
      totalDeductions: hasDeductions ? String(totalDed) : "0",
      gstAmount: String(gst),
      netPayable: hasDeductions ? String(Math.max(0, net)) : String(gross + gst),
      status: def.status,
      irnNumber: irnNum,
      utr: (def as any).utr ?? null,
      paymentMode: (def as any).mode ?? (isPaid ? "neft" : null),
      paidAt: isPaid ? (def as any).paidAt ?? new Date() : null,
      closedAt: def.status === "closed" ? (def as any).paidAt ?? new Date() : null,
      technicalCheckedAt: ["qs_scrutiny","pm_certification","auto_deductions","gst_invoice","finance_approval","payment_released","closed"].includes(def.status) ? billDate : null,
      qsScrutinizedAt: ["pm_certification","auto_deductions","gst_invoice","finance_approval","payment_released","closed"].includes(def.status) ? billDate : null,
      pmCertifiedAt: ["auto_deductions","gst_invoice","finance_approval","payment_released","closed"].includes(def.status) ? billDate : null,
      financeApprovedAt: ["payment_released","closed"].includes(def.status) ? billDate : null,
      remarks: `Measurement for period ending ${billDate.toLocaleDateString("en-IN")}`,
    }).returning();
    billIds.push(bill.id);

    // Deductions for advanced bills
    if (hasDeductions) {
      await db.insert(billDeductionsTable).values([
        { billId: bill.id, deductionType: "tds_194c", description: "TDS u/s 194C — Payments to contractors (company)", rate: "2", baseAmount: String(gross), amount: String(tds), legalRef: "Income Tax Act, 1961 — Section 194C" },
        { billId: bill.id, deductionType: "retention", description: "Retention money @ 5% of gross bill value", rate: "5", baseAmount: String(gross), amount: String(retention), legalRef: "Contract clause 14.3 — Retention 5% until DLP" },
        { billId: bill.id, deductionType: "lwf", description: "Labour Welfare Fund contribution @ 0.5%", rate: "0.5", baseAmount: String(gross), amount: String(lwf), legalRef: "Building & Other Construction Workers Act, 1996" },
      ]);
    }

    // Payment voucher for paid bills
    if (isPaid) {
      await db.insert(paymentVouchersTable).values({
        billId: bill.id,
        projectId: pid,
        voucherNumber: `PV-${def.num}`,
        amount: String(Math.max(0, net)),
        mode: (def as any).mode ?? "neft",
        bankName: "State Bank of India",
        accountNumber: "32011234567",
        ifscCode: "SBIN0001234",
        utr: (def as any).utr ?? `UTR${Date.now().toString(36)}`,
        paidAt: (def as any).paidAt ?? new Date(),
      });

      // TDS entry
      await db.insert(tdsEntriesTable).values({
        projectId: pid,
        billId: bill.id,
        vendorName: `Contractor — ${def.num}`,
        pan: "ABCDE1234F",
        sectionCode: "194C",
        grossAmount: String(gross),
        tdsRate: "2",
        tdsAmount: String(tds),
        quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)}FY${String(new Date().getFullYear()).slice(-2)}`,
      });

      // Retention ledger
      await db.insert(retentionLedgerTable).values({
        projectId: pid,
        billId: bill.id,
        transactionType: "retention_held",
        retentionHeld: String(retention),
        retentionReleased: "0",
        balance: String(retention),
        remarks: `Retention held on ${def.num}`,
      });
    }
  }
  console.log(`   ✓ ${billDefs.length} contractor bills`);

  // ── Client Invoices — 3 invoices ──────────────────────────────────────────
  const invDefs = [
    { num: "INV-CLI-001", client: "MSRDC — Maharashtra State Road Dev Corp", gross: 12500000, status: "paid",         daysAgo: 45 },
    { num: "INV-CLI-002", client: "MSRDC — Maharashtra State Road Dev Corp", gross: 8750000,  status: "acknowledged", daysAgo: 20 },
    { num: "INV-CLI-003", client: "MSRDC — Maharashtra State Road Dev Corp", gross: 6300000,  status: "sent",         daysAgo: 5  },
  ];

  for (const inv of invDefs) {
    const existing = await db.select().from(clientInvoicesTable)
      .where(eq(clientInvoicesTable.invoiceNumber, inv.num));
    if (existing.length) continue;

    const gross = inv.gross;
    const cgst = 9; const sgst = 9;
    const gstAmt = Math.round(gross * (cgst + sgst) / 100 * 100) / 100;
    const retention = Math.round(gross * 0.05 * 100) / 100;
    const net = gross + gstAmt - retention;
    const invDate = new Date(); invDate.setDate(invDate.getDate() - inv.daysAgo);
    const dueDate = new Date(invDate); dueDate.setDate(dueDate.getDate() + 30);

    const [created] = await db.insert(clientInvoicesTable).values({
      projectId: pid,
      invoiceNumber: inv.num,
      clientName: inv.client,
      invoiceDate: invDate,
      dueDate,
      grossAmount: String(gross),
      cgstRate: String(cgst),
      sgstRate: String(sgst),
      gstAmount: String(gstAmt),
      netAmount: String(net),
      retentionHeld: String(retention),
      amountReceived: inv.status === "paid" ? String(net) : "0",
      status: inv.status,
      irnNumber: inv.status !== "sent" ? `IRN-CLI-${Date.now().toString(36).toUpperCase()}` : null,
      reraReference: "MH/RERA/P12345",
      paidAt: inv.status === "paid" ? invDate : null,
    }).returning();

    // Auto GST entry
    await db.insert(gstEntriesTable).values({
      projectId: pid,
      entityType: "client_invoice",
      entityId: created.id,
      invoiceNumber: inv.num,
      partyGstin: "27AADCS0472N1Z1",
      partyName: inv.client,
      taxableValue: String(gross),
      cgstRate: String(cgst),
      cgstAmount: String(Math.round(gross * cgst / 100 * 100) / 100),
      sgstRate: String(sgst),
      sgstAmount: String(Math.round(gross * sgst / 100 * 100) / 100),
      totalGst: String(gstAmt),
      hsnCode: "9954",
      entryType: "sale",
    });
  }
  console.log(`   ✓ ${invDefs.length} client invoices + GST entries`);

  // ── Ledger Entries ─────────────────────────────────────────────────────────
  const journalEntries = [
    { num: "JE-001", narration: "Opening balance — Advance to contractor for RA-001", debit: "1003", credit: "1001", amount: 370000 },
    { num: "JE-002", narration: "Payment to contractor — RA-001 net payable", debit: "2001", credit: "1001", amount: 1680000 },
    { num: "JE-003", narration: "TDS deposited to IT Dept — Q1 FY26", debit: "2002", credit: "1001", amount: 37000 },
    { num: "JE-004", narration: "Contract revenue recognised — INV-CLI-001", debit: "1002", credit: "4001", amount: 12500000 },
    { num: "JE-005", narration: "Client payment received — INV-CLI-001", debit: "1001", credit: "1002", amount: 13812500 },
  ];

  for (const je of journalEntries) {
    const existing = await db.select().from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.entryNumber, je.num));
    if (existing.length) continue;
    await db.insert(ledgerEntriesTable).values({
      projectId: pid,
      entryNumber: je.num,
      narration: je.narration,
      debitAccountId: accountIds[je.debit] ?? null,
      creditAccountId: accountIds[je.credit] ?? null,
      amount: String(je.amount),
    });
  }
  console.log(`   ✓ ${journalEntries.length} journal entries`);

  console.log("\n✅  Financial seed complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
