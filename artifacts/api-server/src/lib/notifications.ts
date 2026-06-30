import { db } from "@workspace/db";
import {
  projectsTable, jsaEntriesTable, materialTestsTable,
  grnItemsTable, grnsTable, vendorsTable, usersTable,
  inventoryItemsTable, qualityTestsTable, userProfilesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { buildTablePdf } from "./payrollPdf";
import { mailerConfigured, sendMail } from "./mailer";

export type ProjectNotificationRecipients = {
  safetyOfficers?: string[];
  qcOfficers?: string[];
  cc?: string[];
  emailVendorOnQcFail?: boolean;
};

export async function getProjectRecipients(projectId: string): Promise<ProjectNotificationRecipients> {
  const [p] = await db.select({ r: projectsTable.notificationRecipients })
    .from(projectsTable).where(eq(projectsTable.id, projectId));
  const r = (p?.r ?? {}) as ProjectNotificationRecipients;
  return {
    safetyOfficers: Array.isArray(r.safetyOfficers) ? r.safetyOfficers.filter(Boolean) : [],
    qcOfficers: Array.isArray(r.qcOfficers) ? r.qcOfficers.filter(Boolean) : [],
    cc: Array.isArray(r.cc) ? r.cc.filter(Boolean) : [],
    emailVendorOnQcFail: r.emailVendorOnQcFail !== false,
  };
}

async function emailsForUserIds(ids: Array<string | null | undefined>, organisationId: string | null | undefined): Promise<string[]> {
  const valid = ids.filter((x): x is string => !!x);
  if (valid.length === 0 || !organisationId) return [];
  // Scope to users whose profile org matches the project org — prevents cross-org leakage
  // when a foreign user id has been assigned to a project-scoped field.
  const rows = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .innerJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
    .where(and(inArray(usersTable.id, valid), eq(userProfilesTable.organisationId, organisationId)));
  return rows.map(r => r.email).filter((e): e is string => !!e);
}

function uniqEmails(...lists: Array<string[] | undefined>): string[] {
  const set = new Set<string>();
  for (const list of lists ?? []) for (const e of list ?? []) {
    const v = String(e).trim().toLowerCase();
    if (v && v.includes("@")) set.add(v);
  }
  return [...set];
}

async function buildJsaPdf(jsa: any, project: any): Promise<Uint8Array> {
  const steps = Array.isArray(jsa.steps) ? jsa.steps : [];
  const rows = steps.map((s: any, i: number) => ({
    sno: String(i + 1),
    step: s.step ?? s.description ?? "—",
    hazard: s.hazard ?? "—",
    control: s.control ?? s.mitigation ?? "—",
    ppe: Array.isArray(s.ppe) ? s.ppe.join(", ") : (s.ppe ?? "—"),
    risk: s.risk ?? s.riskLevel ?? "—",
  }));
  return await buildTablePdf({
    title: "JOB SAFETY ANALYSIS (JSA)",
    subtitle: `${project?.name ?? ""} (${project?.code ?? ""}) · JSA Date: ${new Date(jsa.jsaDate).toISOString().slice(0,10)} · Status: APPROVED · Workers present: ${jsa.workersPresent ?? 0}`,
    landscape: true,
    columns: [
      { header: "S.No", key: "sno", width: 32, align: "center" },
      { header: "Step", key: "step", width: 180 },
      { header: "Hazard", key: "hazard", width: 170 },
      { header: "Control / Mitigation", key: "control", width: 200 },
      { header: "PPE", key: "ppe", width: 120 },
      { header: "Risk", key: "risk", width: 60, align: "center" },
    ],
    rows: rows.length ? rows : [{ sno: "—", step: "(no steps recorded)", hazard: "—", control: "—", ppe: "—", risk: "—" }],
    footer: `Approved at ${jsa.approvedAt ? new Date(jsa.approvedAt).toISOString() : "—"} · Generated ${new Date().toISOString()}`,
  });
}

async function buildMaterialTestCertPdf(test: any, project: any, itemName: string | null): Promise<Uint8Array> {
  const required = test.requiredValue != null ? String(test.requiredValue) : "—";
  const actual = test.actualValue != null ? String(test.actualValue) : "—";
  const unit = test.unit ?? "";
  return await buildTablePdf({
    title: "MATERIAL TEST CERTIFICATE",
    subtitle: `${project?.name ?? ""} (${project?.code ?? ""}) · Test: ${test.testType} · IS Code: ${test.isCode ?? "—"} · Result: ${String(test.testResult).toUpperCase()}`,
    columns: [
      { header: "Field", key: "k", width: 180 },
      { header: "Value", key: "v", width: 340 },
    ],
    rows: [
      { k: "Material / Item", v: itemName ?? "—" },
      { k: "Test Type", v: test.testType },
      { k: "Reference Standard", v: test.isCode ?? "—" },
      { k: "Sample Date", v: test.sampleDate ? new Date(test.sampleDate).toISOString().slice(0,10) : "—" },
      { k: "Test Date", v: test.testDate ? new Date(test.testDate).toISOString().slice(0,10) : "—" },
      { k: "Required Value", v: `${required} ${unit}`.trim() },
      { k: "Actual Value", v: `${actual} ${unit}`.trim() },
      { k: "Result", v: String(test.testResult).toUpperCase() },
      { k: "Remarks", v: test.remarks ?? "—" },
    ],
    footer: `Generated ${new Date().toISOString()} · Certificate ID: ${test.id}`,
  });
}

export async function notifyJsaApproved(jsaId: string): Promise<{ to: string[]; sent: boolean; error?: string }> {
  try {
    const [jsa] = await db.select().from(jsaEntriesTable).where(eq(jsaEntriesTable.id, jsaId));
    if (!jsa || jsa.status !== "approved") return { to: [], sent: false, error: "not approved" };
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, jsa.projectId));
    if (!project) return { to: [], sent: false, error: "project missing" };
    const recipients = await getProjectRecipients(jsa.projectId);
    const userEmails = await emailsForUserIds([jsa.supervisorId, jsa.preparedById, jsa.approvedById, project.pmId], project.organisationId);
    const to = uniqEmails(userEmails, recipients.safetyOfficers, recipients.cc);
    if (to.length === 0) return { to, sent: false, error: "no recipients" };
    if (!mailerConfigured()) return { to, sent: false, error: "SMTP not configured" };
    const pdf = await buildJsaPdf(jsa, project);
    const result = await sendMail({
      to: to.join(", "),
      subject: `[${project.code}] JSA approved — ${new Date(jsa.jsaDate).toISOString().slice(0,10)}`,
      text: `The attached Job Safety Analysis for ${project.name} was approved on ${jsa.approvedAt ? new Date(jsa.approvedAt).toISOString() : "(now)"}.\n\nWorkers present: ${jsa.workersPresent}\nProject: ${project.name} (${project.code})`,
      attachments: [{ filename: `jsa-${jsa.id.slice(0,8)}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    return { to, sent: result.ok, error: result.ok ? undefined : result.error };
  } catch (e: any) {
    return { to: [], sent: false, error: e?.message ?? String(e) };
  }
}

export async function notifyQualityTestFinalised(testId: string): Promise<{ to: string[]; sent: boolean; error?: string }> {
  try {
    const [test] = await db.select().from(qualityTestsTable).where(eq(qualityTestsTable.id, testId));
    if (!test || test.passed === null || test.passed === undefined) return { to: [], sent: false, error: "not finalised" };
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, test.projectId));
    if (!project) return { to: [], sent: false, error: "project missing" };
    const recipients = await getProjectRecipients(test.projectId);
    const userEmails = await emailsForUserIds([test.conductedById, project.pmId], project.organisationId);
    const to = uniqEmails(userEmails, recipients.qcOfficers, recipients.cc);
    if (to.length === 0) return { to, sent: false, error: "no recipients" };
    if (!mailerConfigured()) return { to, sent: false, error: "SMTP not configured" };
    const isFail = test.passed === false;
    const pdf = await buildTablePdf({
      title: "MATERIAL TEST CERTIFICATE",
      subtitle: `${project.name} (${project.code}) · ${test.testType} · Sample ${test.sampleId ?? "—"} · ${isFail ? "FAIL" : "PASS"}`,
      columns: [
        { header: "Field", key: "k", width: 180 },
        { header: "Value", key: "v", width: 340 },
      ],
      rows: [
        { k: "Test Type", v: test.testType },
        { k: "IS Code / Reference", v: test.isCodeRef ?? "—" },
        { k: "Sample ID", v: test.sampleId ?? "—" },
        { k: "Sample Location", v: test.sampleLocation ?? "—" },
        { k: "Lab", v: test.labName ?? "—" },
        { k: "Sample Date", v: test.sampleDate ? new Date(test.sampleDate).toISOString().slice(0,10) : "—" },
        { k: "Test Date", v: test.testDate ? new Date(test.testDate).toISOString().slice(0,10) : "—" },
        { k: "Test Value", v: `${test.testValue ?? "—"} ${test.testUnit ?? ""}`.trim() },
        { k: "Acceptance Range", v: `${test.minAcceptable != null ? `≥ ${test.minAcceptable}` : ""}${test.minAcceptable != null && test.maxAcceptable != null ? " and " : ""}${test.maxAcceptable != null ? `≤ ${test.maxAcceptable}` : ""} ${test.testUnit ?? ""}`.trim() || "—" },
        { k: "Result", v: isFail ? "FAIL" : "PASS" },
        { k: "Remarks", v: test.remarks ?? "—" },
      ],
      footer: `Generated ${new Date().toISOString()} · Certificate ID: ${test.id}`,
    });
    const result = await sendMail({
      to: to.join(", "),
      subject: `[${project.code}] Material test ${isFail ? "FAILED" : "PASSED"} — ${test.testType} (sample ${test.sampleId ?? ""})`,
      text: `Material test certificate attached.\n\nProject: ${project.name} (${project.code})\nTest: ${test.testType}\nSample: ${test.sampleId ?? "—"}\nResult: ${isFail ? "FAIL" : "PASS"}${isFail ? "\n\nMaterial should be rejected and a debit note raised against the vendor." : ""}`,
      attachments: [{ filename: `test-cert-${test.id.slice(0,8)}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    return { to, sent: result.ok, error: result.ok ? undefined : result.error };
  } catch (e: any) {
    return { to: [], sent: false, error: e?.message ?? String(e) };
  }
}

export async function notifyMaterialTestFinalised(testId: string): Promise<{ to: string[]; sent: boolean; error?: string }> {
  try {
    const [test] = await db.select().from(materialTestsTable).where(eq(materialTestsTable.id, testId));
    if (!test || (test.testResult !== "pass" && test.testResult !== "fail")) {
      return { to: [], sent: false, error: "not finalised" };
    }
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, test.projectId));
    if (!project) return { to: [], sent: false, error: "project missing" };
    const recipients = await getProjectRecipients(test.projectId);
    const userEmails = await emailsForUserIds([test.testedById, project.pmId], project.organisationId);

    let itemName: string | null = null;
    let vendorEmail: string | null = null;
    if (test.grnItemId) {
      // Resolve GRN item via its parent GRN, requiring project match — prevents
      // cross-project metadata disclosure if grnItemId points to a foreign record.
      const [row] = await db
        .select({ itemName: grnItemsTable.itemName, grnId: grnsTable.id, vendorId: grnsTable.vendorId })
        .from(grnItemsTable)
        .innerJoin(grnsTable, eq(grnsTable.id, grnItemsTable.grnId))
        .where(and(eq(grnItemsTable.id, test.grnItemId), eq(grnsTable.projectId, test.projectId)));
      itemName = row?.itemName ?? null;
      if (test.testResult === "fail" && recipients.emailVendorOnQcFail && row?.vendorId) {
        const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, row.vendorId));
        vendorEmail = v?.email ?? null;
      }
    }
    if (!itemName && test.inventoryItemId) {
      const [inv] = await db.select().from(inventoryItemsTable)
        .where(and(eq(inventoryItemsTable.id, test.inventoryItemId), eq(inventoryItemsTable.projectId, test.projectId)));
      itemName = inv?.name ?? null;
    }
    const to = uniqEmails(userEmails, recipients.qcOfficers, recipients.cc, vendorEmail ? [vendorEmail] : []);
    if (to.length === 0) return { to, sent: false, error: "no recipients" };
    if (!mailerConfigured()) return { to, sent: false, error: "SMTP not configured" };
    const pdf = await buildMaterialTestCertPdf(test, project, itemName);
    const isFail = test.testResult === "fail";
    const result = await sendMail({
      to: to.join(", "),
      subject: `[${project.code}] Material test ${isFail ? "FAILED" : "PASSED"} — ${test.testType}${itemName ? ` (${itemName})` : ""}`,
      text: `Material test certificate attached.\n\nProject: ${project.name} (${project.code})\nTest: ${test.testType}\nItem: ${itemName ?? "—"}\nResult: ${String(test.testResult).toUpperCase()}${isFail ? "\n\nA debit note is required for the rejected material." : ""}`,
      attachments: [{ filename: `test-cert-${test.id.slice(0,8)}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    return { to, sent: result.ok, error: result.ok ? undefined : result.error };
  } catch (e: any) {
    return { to: [], sent: false, error: e?.message ?? String(e) };
  }
}
