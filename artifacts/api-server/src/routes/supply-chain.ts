import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  vendorsTable, vendorDocumentsTable, avlEntriesTable,
  storesTable, inventoryItemsTable, stockLedgerTable,
  materialIndentsTable, indentItemsTable,
  rfqsTable, rfqItemsTable, rfqVendorsTable, rfqResponsesTable,
  purchaseOrdersTable, poItemsTable,
  grnsTable, grnItemsTable,
  materialTestsTable, stockIssuesTable, issueItemsTable,
  wastageLogsTable, rateContractsTable,
  projectsTable, userProfilesTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, gte, lte, inArray } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { n, d, dReq } from "../lib/serialize";
import { notifyMaterialTestFinalised } from "../lib/notifications";

const router: IRouter = Router();

// ─── Serialisers ──────────────────────────────────────────────────────────────
const sv = (v: any) => ({
  id: v.id, organisationId: v.organisationId ?? null,
  name: v.name, code: v.code ?? null, contactPerson: v.contactPerson ?? null,
  email: v.email ?? null, phone: v.phone ?? null, address: v.address ?? null,
  city: v.city ?? null, state: v.state ?? null, pincode: v.pincode ?? null,
  gstNumber: v.gstNumber ?? null, pan: v.pan ?? null,
  msmeCategory: v.msmeCategory ?? null, msmeNumber: v.msmeNumber ?? null,
  bankName: v.bankName ?? null, accountNumber: v.accountNumber ?? null, ifscCode: v.ifscCode ?? null,
  status: v.status, performanceScore: n(v.performanceScore),
  onTimeDeliveryPct: n(v.onTimeDeliveryPct), qualityAcceptancePct: n(v.qualityAcceptancePct),
  totalOrders: v.totalOrders, blacklistReason: v.blacklistReason ?? null,
  approvedById: v.approvedById ?? null, approvedAt: d(v.approvedAt),
  createdAt: dReq(v.createdAt), updatedAt: dReq(v.updatedAt),
});

const sStore = (s: any) => ({
  id: s.id, projectId: s.projectId, name: s.name, storeType: s.storeType,
  location: s.location ?? null, storeKeeperName: s.storeKeeperName ?? null,
  isActive: s.isActive, createdAt: dReq(s.createdAt),
});

const sInv = (i: any) => ({
  id: i.id, projectId: i.projectId, storeId: i.storeId ?? null,
  itemCode: i.itemCode ?? null, itemName: i.itemName, description: i.description ?? null,
  category: i.category ?? null, unit: i.unit, hsnCode: i.hsnCode ?? null,
  minStockLevel: n(i.minStockLevel), maxStockLevel: n(i.maxStockLevel),
  currentStock: n(i.currentStock), costingMethod: i.costingMethod,
  avgRate: n(i.avgRate), lastPurchaseRate: n(i.lastPurchaseRate),
  wbsActivityId: i.wbsActivityId ?? null, boqItemId: i.boqItemId ?? null,
  isReorderTriggered: i.isReorderTriggered,
  createdAt: dReq(i.createdAt), updatedAt: dReq(i.updatedAt),
});

const sIndent = (m: any) => ({
  id: m.id, projectId: m.projectId, indentNumber: m.indentNumber,
  indentDate: dReq(m.indentDate), wbsActivityId: m.wbsActivityId ?? null,
  requiredByDate: d(m.requiredByDate), status: m.status,
  remarks: m.remarks ?? null, queryRemarks: m.queryRemarks ?? null,
  raisedById: m.raisedById ?? null, approvedById: m.approvedById ?? null,
  approvedAt: d(m.approvedAt), createdAt: dReq(m.createdAt), updatedAt: dReq(m.updatedAt),
});

const sIndentItem = (i: any) => ({
  id: i.id, indentId: i.indentId, inventoryItemId: i.inventoryItemId ?? null,
  itemName: i.itemName, unit: i.unit, requiredQty: n(i.requiredQty),
  availableStock: n(i.availableStock), approvedQty: i.approvedQty ? n(i.approvedQty) : null,
  specification: i.specification ?? null, boqItemId: i.boqItemId ?? null,
  createdAt: dReq(i.createdAt),
});

const sRfq = (r: any) => ({
  id: r.id, projectId: r.projectId, rfqNumber: r.rfqNumber, rfqDate: dReq(r.rfqDate),
  indentId: r.indentId ?? null, submissionDeadline: d(r.submissionDeadline),
  deliveryDeadline: d(r.deliveryDeadline), deliveryLocation: r.deliveryLocation ?? null,
  status: r.status, paymentTerms: r.paymentTerms ?? null, notes: r.notes ?? null,
  awardedVendorId: r.awardedVendorId ?? null, awardedAt: d(r.awardedAt),
  createdAt: dReq(r.createdAt), updatedAt: dReq(r.updatedAt),
});

const sPo = (p: any) => ({
  id: p.id, projectId: p.projectId, poNumber: p.poNumber, poDate: dReq(p.poDate),
  vendorId: p.vendorId, rfqId: p.rfqId ?? null, indentId: p.indentId ?? null,
  status: p.status, deliveryLocation: p.deliveryLocation ?? null,
  deliveryDeadline: d(p.deliveryDeadline), paymentTerms: p.paymentTerms ?? null,
  totalAmount: n(p.totalAmount), gstAmount: n(p.gstAmount), grandTotal: n(p.grandTotal),
  advancePaid: n(p.advancePaid), amountReceived: n(p.amountReceived),
  version: p.version, amendmentReason: p.amendmentReason ?? null, notes: p.notes ?? null,
  createdById: p.createdById ?? null, approvedById: p.approvedById ?? null,
  approvedAt: d(p.approvedAt), createdAt: dReq(p.createdAt), updatedAt: dReq(p.updatedAt),
});

const sPoItem = (i: any) => ({
  id: i.id, poId: i.poId, inventoryItemId: i.inventoryItemId ?? null,
  itemName: i.itemName, unit: i.unit, orderedQty: n(i.orderedQty),
  receivedQty: n(i.receivedQty), unitRate: n(i.unitRate), gstRate: n(i.gstRate),
  amount: n(i.amount), gstAmount: n(i.gstAmount),
  specification: i.specification ?? null, hsnCode: i.hsnCode ?? null,
});

const sGrn = (g: any) => ({
  id: g.id, projectId: g.projectId, grnNumber: g.grnNumber, grnDate: dReq(g.grnDate),
  poId: g.poId ?? null, vendorId: g.vendorId ?? null, storeId: g.storeId ?? null,
  vehicleNumber: g.vehicleNumber ?? null, dcNumber: g.dcNumber ?? null,
  invoiceNumber: g.invoiceNumber ?? null, invoiceAmount: g.invoiceAmount ? n(g.invoiceAmount) : null,
  status: g.status, threeWayMatchStatus: g.threeWayMatchStatus ?? null,
  threeWayMatchNotes: g.threeWayMatchNotes ?? null, qcHoldCount: g.qcHoldCount,
  photoUrls: g.photoUrls ?? [], gpsLocation: g.gpsLocation ?? null,
  receivedById: g.receivedById ?? null, createdAt: dReq(g.createdAt), updatedAt: dReq(g.updatedAt),
});

const sGrnItem = (i: any) => ({
  id: i.id, grnId: i.grnId, poItemId: i.poItemId ?? null,
  inventoryItemId: i.inventoryItemId ?? null, itemName: i.itemName, unit: i.unit,
  orderedQty: n(i.orderedQty), receivedQty: n(i.receivedQty), acceptedQty: n(i.acceptedQty),
  rejectedQty: n(i.rejectedQty), unitRate: n(i.unitRate),
  batchNumber: i.batchNumber ?? null, gradeSpecification: i.gradeSpecification ?? null,
  condition: i.condition, qcHold: i.qcHold, remarks: i.remarks ?? null,
  createdAt: dReq(i.createdAt),
});

const sTest = (t: any) => ({
  id: t.id, projectId: t.projectId, grnItemId: t.grnItemId ?? null,
  inventoryItemId: t.inventoryItemId ?? null, testType: t.testType,
  isCode: t.isCode ?? null, sampleDate: d(t.sampleDate), testDate: d(t.testDate),
  testResult: t.testResult, requiredValue: t.requiredValue ? n(t.requiredValue) : null,
  actualValue: t.actualValue ? n(t.actualValue) : null, unit: t.unit ?? null,
  testedById: t.testedById ?? null, remarks: t.remarks ?? null,
  certificateUrl: t.certificateUrl ?? null, debitNoteIssued: t.debitNoteIssued,
  createdAt: dReq(t.createdAt),
});

const sIssue = (i: any) => ({
  id: i.id, projectId: i.projectId, issueNumber: i.issueNumber,
  issueDate: dReq(i.issueDate), indentId: i.indentId ?? null, storeId: i.storeId ?? null,
  issuedToName: i.issuedToName ?? null, issuedToContractor: i.issuedToContractor ?? null,
  wbsActivityId: i.wbsActivityId ?? null, notes: i.notes ?? null,
  issuedById: i.issuedById ?? null, createdAt: dReq(i.createdAt),
});

const sWaste = (w: any) => ({
  id: w.id, projectId: w.projectId, inventoryItemId: w.inventoryItemId ?? null,
  storeId: w.storeId ?? null, wasteDate: dReq(w.wasteDate),
  qty: n(w.qty), unit: w.unit, rate: n(w.rate), amount: n(w.amount),
  reasonCode: w.reasonCode, description: w.description ?? null,
  normQty: w.normQty ? n(w.normQty) : null, aboveNorm: w.aboveNorm,
  alertSentToPm: w.alertSentToPm, loggedById: w.loggedById ?? null,
  createdAt: dReq(w.createdAt),
});

const sLedger = (l: any) => ({
  id: l.id, projectId: l.projectId, inventoryItemId: l.inventoryItemId,
  storeId: l.storeId ?? null, transactionType: l.transactionType,
  entityType: l.entityType ?? null, entityId: l.entityId ?? null,
  qty: n(l.qty), rate: n(l.rate), amount: n(l.amount), balanceQty: n(l.balanceQty),
  narration: l.narration ?? null, createdById: l.createdById ?? null,
  createdAt: dReq(l.createdAt),
});

const sRc = (r: any) => ({
  id: r.id, projectId: r.projectId, vendorId: r.vendorId,
  contractNumber: r.contractNumber, validFrom: dReq(r.validFrom), validTo: dReq(r.validTo),
  inventoryItemId: r.inventoryItemId ?? null, itemName: r.itemName, unit: r.unit,
  agreedRate: n(r.agreedRate), gstRate: n(r.gstRate),
  maxQty: r.maxQty ? n(r.maxQty) : null, usedQty: n(r.usedQty),
  isActive: r.isActive, notes: r.notes ?? null, createdAt: dReq(r.createdAt),
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ACCESS GUARD — prevents cross-tenant IDOR on entity-by-id routes
// ─────────────────────────────────────────────────────────────────────────────

/** Returns 403 and true if the user cannot access the entity's project. */
async function denyIfNoProjectAccess(
  req: Request, res: Response, entityProjectId: string,
): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return true; }
  // Admins bypass tenant check
  const userRole = req.userRole ?? null;
  if (userRole === "admin") return false;
  // Resolve user's org
  const [profile] = await db.select({ organisationId: userProfilesTable.organisationId })
    .from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  if (!profile?.organisationId) { res.status(403).json({ error: "Forbidden" }); return true; }
  // Resolve project's org
  const [project] = await db.select({ organisationId: projectsTable.organisationId })
    .from(projectsTable).where(eq(projectsTable.id, entityProjectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return true; }
  if (project.organisationId !== profile.organisationId) {
    res.status(403).json({ error: "Forbidden" }); return true;
  }
  return false;
}

// Apply project-access guard to ALL /projects/:projectId/* routes
router.use("/projects/:projectId", requireAuth, async (req: Request, res: Response, next) => {
  if (await denyIfNoProjectAccess(req, res, req.params.projectId)) return;
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDORS
// ─────────────────────────────────────────────────────────────────────────────

// Resolve caller's org. Returns null for admins (no org filter), or org id for
// all other users. Sends 403 if a non-admin has no org and returns undefined.
async function resolveCallerOrg(req: Request, res: Response): Promise<string | null | undefined> {
  if (req.userRole === "admin") return null;
  const [profile] = await db.select({ organisationId: userProfilesTable.organisationId })
    .from(userProfilesTable).where(eq(userProfilesTable.userId, req.user!.id));
  if (!profile?.organisationId) { res.status(403).json({ error: "Forbidden" }); return undefined; }
  return profile.organisationId;
}

router.get("/vendors", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const callerOrg = await resolveCallerOrg(req, res);
  if (callerOrg === undefined) return;
  // Always scope to caller's org (non-admins); ignore client-supplied orgId.
  const conds: any[] = [];
  if (callerOrg) conds.push(eq(vendorsTable.organisationId, callerOrg));
  if (status) conds.push(eq(vendorsTable.status, status));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const rows = where
    ? await db.select().from(vendorsTable).where(where).orderBy(desc(vendorsTable.createdAt))
    : await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));
  res.json(rows.map(sv));
});

router.post("/vendors", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(vendorsTable).values({
    name: b.name, code: b.code ?? null, contactPerson: b.contactPerson ?? null,
    email: b.email ?? null, phone: b.phone ?? null, address: b.address ?? null,
    city: b.city ?? null, state: b.state ?? null, pincode: b.pincode ?? null,
    gstNumber: b.gstNumber ?? null, pan: b.pan ?? null,
    msmeCategory: b.msmeCategory ?? null, msmeNumber: b.msmeNumber ?? null,
    bankName: b.bankName ?? null, accountNumber: b.accountNumber ?? null,
    ifscCode: b.ifscCode ?? null, organisationId: b.organisationId ?? null,
    createdById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(sv(row));
});

router.get("/vendors/:vendorId", requireAuth, async (req: Request, res: Response) => {
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, req.params.vendorId));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  const callerOrg = await resolveCallerOrg(req, res);
  if (callerOrg === undefined) return;
  if (callerOrg && v.organisationId && v.organisationId !== callerOrg) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(sv(v));
});

router.patch("/vendors/:vendorId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, req.params.vendorId));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  // Org-level access guard for vendor write operations
  if (v.organisationId) {
    const [profile] = await db.select({ organisationId: userProfilesTable.organisationId })
      .from(userProfilesTable).where(eq(userProfilesTable.userId, req.user!.id));
    if (profile?.organisationId && profile.organisationId !== v.organisationId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }
  const patch: Record<string, any> = {};
  const fields = ["name","code","contactPerson","email","phone","address","city","state","pincode","gstNumber","pan","msmeCategory","msmeNumber","bankName","accountNumber","ifscCode","notes"];
  for (const f of fields) if (b[f] !== undefined) patch[f] = b[f];
  if (b.status !== undefined) {
    patch.status = b.status;
    if (b.status === "active") { patch.approvedById = req.user?.id ?? null; patch.approvedAt = new Date(); }
    if (b.status === "blacklisted") patch.blacklistReason = b.blacklistReason ?? null;
  }
  const [updated] = await db.update(vendorsTable).set(patch).where(eq(vendorsTable.id, v.id)).returning();
  res.json(sv(updated));
});

router.get("/vendors/:vendorId/documents", requireAuth, async (req: Request, res: Response) => {
  const [vendorCheck] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, req.params.vendorId));
  if (!vendorCheck) { res.status(404).json({ error: "Vendor not found" }); return; }
  const callerOrg = await resolveCallerOrg(req, res);
  if (callerOrg === undefined) return;
  if (callerOrg && vendorCheck.organisationId && vendorCheck.organisationId !== callerOrg) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const docs = await db.select().from(vendorDocumentsTable)
    .where(eq(vendorDocumentsTable.vendorId, req.params.vendorId));
  res.json(docs.map(d => ({ id: d.id, vendorId: d.vendorId, documentType: d.documentType, documentUrl: d.documentUrl ?? null, fileName: d.fileName ?? null, verified: d.verified, createdAt: dReq(d.createdAt) })));
});

router.post("/vendors/:vendorId/documents", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [vendorCheck] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, req.params.vendorId));
  if (!vendorCheck) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (vendorCheck.organisationId) {
    const [profile] = await db.select({ organisationId: userProfilesTable.organisationId })
      .from(userProfilesTable).where(eq(userProfilesTable.userId, req.user!.id));
    if (profile?.organisationId && profile.organisationId !== vendorCheck.organisationId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }
  const [doc] = await db.insert(vendorDocumentsTable).values({
    vendorId: req.params.vendorId, documentType: b.documentType ?? "other",
    documentUrl: b.documentUrl ?? null, fileName: b.fileName ?? null,
  }).returning();
  res.status(201).json({ id: doc.id, vendorId: doc.vendorId, documentType: doc.documentType, documentUrl: doc.documentUrl ?? null, fileName: doc.fileName ?? null, verified: doc.verified, createdAt: dReq(doc.createdAt) });
});

router.get("/projects/:projectId/avl", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(avlEntriesTable)
    .where(eq(avlEntriesTable.projectId, req.params.projectId));
  res.json(rows.map(r => ({ id: r.id, projectId: r.projectId, vendorId: r.vendorId, materialCategory: r.materialCategory ?? null, notes: r.notes ?? null, addedAt: dReq(r.addedAt) })));
});

router.post("/projects/:projectId/avl", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const [row] = await db.insert(avlEntriesTable).values({
    projectId: req.params.projectId, vendorId: b.vendorId,
    materialCategory: b.materialCategory ?? null, notes: b.notes ?? null,
    addedById: req.user?.id ?? null,
  }).returning();
  res.status(201).json({ id: row.id, projectId: row.projectId, vendorId: row.vendorId, materialCategory: row.materialCategory ?? null, notes: row.notes ?? null, addedAt: dReq(row.addedAt) });
});

// ─────────────────────────────────────────────────────────────────────────────
// STORES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/stores", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(storesTable).where(eq(storesTable.projectId, req.params.projectId));
  res.json(rows.map(sStore));
});

router.post("/projects/:projectId/stores", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(storesTable).values({
    projectId: req.params.projectId, name: b.name, storeType: b.storeType ?? "site",
    location: b.location ?? null, storeKeeperName: b.storeKeeperName ?? null,
  }).returning();
  res.status(201).json(sStore(row));
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/inventory", requireAuth, async (req: Request, res: Response) => {
  const { storeId, reorderOnly } = req.query as Record<string, string>;
  let q = db.select().from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.projectId, req.params.projectId)) as any;
  if (storeId) q = db.select().from(inventoryItemsTable)
    .where(and(eq(inventoryItemsTable.projectId, req.params.projectId), eq(inventoryItemsTable.storeId, storeId)));
  const rows = await q.orderBy(asc(inventoryItemsTable.itemName));
  const items = rows.map(sInv);
  if (reorderOnly === "true") return res.json(items.filter((i: any) => n(i.currentStock) <= n(i.minStockLevel)));
  res.json(items);
});

router.post("/projects/:projectId/inventory", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.itemName) { res.status(400).json({ error: "itemName required" }); return; }
  const [row] = await db.insert(inventoryItemsTable).values({
    projectId: req.params.projectId, storeId: b.storeId ?? null,
    itemCode: b.itemCode ?? null, itemName: b.itemName, description: b.description ?? null,
    category: b.category ?? null, unit: b.unit ?? "nos", hsnCode: b.hsnCode ?? null,
    minStockLevel: String(n(b.minStockLevel ?? 0)), maxStockLevel: String(n(b.maxStockLevel ?? 0)),
    currentStock: String(n(b.openingStock ?? 0)),
    costingMethod: b.costingMethod ?? "wac",
    avgRate: String(n(b.avgRate ?? 0)), lastPurchaseRate: String(n(b.avgRate ?? 0)),
    wbsActivityId: b.wbsActivityId ?? null, boqItemId: b.boqItemId ?? null,
  }).returning();
  res.status(201).json(sInv(row));
});

router.patch("/projects/:projectId/inventory/:itemId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [item] = await db.select().from(inventoryItemsTable)
    .where(and(eq(inventoryItemsTable.id, req.params.itemId), eq(inventoryItemsTable.projectId, req.params.projectId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  const patch: Record<string, any> = {};
  const fields = ["itemName","description","category","unit","minStockLevel","maxStockLevel","costingMethod","hsnCode","storeId"];
  for (const f of fields) if (b[f] !== undefined) patch[f] = ["minStockLevel","maxStockLevel"].includes(f) ? String(n(b[f])) : b[f];
  const [updated] = await db.update(inventoryItemsTable).set(patch)
    .where(eq(inventoryItemsTable.id, item.id)).returning();
  res.json(sInv(updated));
});

router.get("/projects/:projectId/stock-ledger/:itemId", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(stockLedgerTable)
    .where(and(eq(stockLedgerTable.projectId, req.params.projectId), eq(stockLedgerTable.inventoryItemId, req.params.itemId)))
    .orderBy(desc(stockLedgerTable.createdAt));
  res.json(rows.map(sLedger));
});

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL INDENTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/material-indents", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select().from(materialIndentsTable)
    .where(eq(materialIndentsTable.projectId, req.params.projectId)) as any;
  if (status) q = db.select().from(materialIndentsTable)
    .where(and(eq(materialIndentsTable.projectId, req.params.projectId), eq(materialIndentsTable.status, status)));
  const rows = await q.orderBy(desc(materialIndentsTable.createdAt));
  res.json(rows.map(sIndent));
});

router.post("/projects/:projectId/material-indents", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.indentNumber) { res.status(400).json({ error: "indentNumber required" }); return; }
  const [row] = await db.insert(materialIndentsTable).values({
    projectId: req.params.projectId, indentNumber: b.indentNumber,
    wbsActivityId: b.wbsActivityId ?? null,
    requiredByDate: b.requiredByDate ? new Date(b.requiredByDate) : null,
    remarks: b.remarks ?? null, raisedById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(sIndent(row));
});

router.get("/material-indents/:indentId", requireAuth, async (req: Request, res: Response) => {
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  res.json(sIndent(indent));
});

router.get("/material-indents/:indentId/items", requireAuth, async (req: Request, res: Response) => {
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  const items = await db.select().from(indentItemsTable).where(eq(indentItemsTable.indentId, req.params.indentId));
  res.json(items.map(sIndentItem));
});

router.post("/material-indents/:indentId/items", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.itemName || !b.requiredQty) { res.status(400).json({ error: "itemName, requiredQty required" }); return; }
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent) { res.status(404).json({ error: "Indent not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  let availableStock = 0;
  if (b.inventoryItemId) {
    const [inv] = await db.select({ currentStock: inventoryItemsTable.currentStock })
      .from(inventoryItemsTable).where(eq(inventoryItemsTable.id, b.inventoryItemId));
    if (inv) availableStock = n(inv.currentStock);
  }
  const [item] = await db.insert(indentItemsTable).values({
    indentId: req.params.indentId, inventoryItemId: b.inventoryItemId ?? null,
    itemName: b.itemName, unit: b.unit ?? "nos", requiredQty: String(n(b.requiredQty)),
    availableStock: String(availableStock), specification: b.specification ?? null,
    boqItemId: b.boqItemId ?? null,
  }).returning();
  res.status(201).json(sIndentItem(item));
});

// Indent approval workflow
router.post("/material-indents/:indentId/submit", requireAuth, async (req: Request, res: Response) => {
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent || indent.status !== "draft") { res.status(409).json({ error: "Only draft indents can be submitted" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  const [updated] = await db.update(materialIndentsTable).set({ status: "submitted" })
    .where(eq(materialIndentsTable.id, indent.id)).returning();
  res.json(sIndent(updated));
});

router.post("/material-indents/:indentId/approve", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent || indent.status !== "submitted") { res.status(409).json({ error: "Only submitted indents can be approved" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  if (Array.isArray(b.items)) {
    for (const it of b.items) {
      if (it.id && it.approvedQty !== undefined) {
        await db.update(indentItemsTable).set({ approvedQty: String(n(it.approvedQty)) })
          .where(eq(indentItemsTable.id, it.id));
      }
    }
  }
  const [updated] = await db.update(materialIndentsTable).set({
    status: "approved", approvedById: req.user?.id ?? null, approvedAt: new Date(),
  }).where(eq(materialIndentsTable.id, indent.id)).returning();
  res.json(sIndent(updated));
});

router.post("/material-indents/:indentId/query", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [indent] = await db.select().from(materialIndentsTable).where(eq(materialIndentsTable.id, req.params.indentId));
  if (!indent || indent.status !== "submitted") { res.status(409).json({ error: "Only submitted indents can be queried" }); return; }
  if (await denyIfNoProjectAccess(req, res, indent.projectId)) return;
  const [updated] = await db.update(materialIndentsTable).set({ status: "queried", queryRemarks: b.remarks ?? null })
    .where(eq(materialIndentsTable.id, indent.id)).returning();
  res.json(sIndent(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// RFQ
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/rfqs", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(rfqsTable)
    .where(eq(rfqsTable.projectId, req.params.projectId))
    .orderBy(desc(rfqsTable.createdAt));
  res.json(rows.map(sRfq));
});

router.post("/projects/:projectId/rfqs", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.rfqNumber) { res.status(400).json({ error: "rfqNumber required" }); return; }
  const [row] = await db.insert(rfqsTable).values({
    projectId: req.params.projectId, rfqNumber: b.rfqNumber,
    indentId: b.indentId ?? null,
    submissionDeadline: b.submissionDeadline ? new Date(b.submissionDeadline) : null,
    deliveryDeadline: b.deliveryDeadline ? new Date(b.deliveryDeadline) : null,
    deliveryLocation: b.deliveryLocation ?? null, paymentTerms: b.paymentTerms ?? null,
    notes: b.notes ?? null, createdById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(sRfq(row));
});

router.get("/rfqs/:rfqId", requireAuth, async (req: Request, res: Response) => {
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfq) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfq.projectId)) return;
  const [items, vendors, responses] = await Promise.all([
    db.select().from(rfqItemsTable).where(eq(rfqItemsTable.rfqId, rfq.id)),
    db.select().from(rfqVendorsTable).where(eq(rfqVendorsTable.rfqId, rfq.id)),
    db.select().from(rfqResponsesTable).where(eq(rfqResponsesTable.rfqId, rfq.id)),
  ]);
  res.json({
    ...sRfq(rfq),
    items: items.map(i => ({ id: i.id, rfqId: i.rfqId, itemName: i.itemName, unit: i.unit, requiredQty: n(i.requiredQty), specification: i.specification ?? null })),
    vendors: vendors.map(v => ({ id: v.id, rfqId: v.rfqId, vendorId: v.vendorId, sentAt: d(v.sentAt), responseReceived: v.responseReceived })),
    responses: responses.map(r => ({ id: r.id, rfqId: r.rfqId, vendorId: r.vendorId, rfqItemId: r.rfqItemId ?? null, unitRate: n(r.unitRate), gstRate: n(r.gstRate), leadTimeDays: r.leadTimeDays ?? null, deliveryCharges: n(r.deliveryCharges), validityDays: r.validityDays ?? null, isL1: r.isL1, remarks: r.remarks ?? null })),
  });
});

router.post("/rfqs/:rfqId/items", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.itemName) { res.status(400).json({ error: "itemName required" }); return; }
  const [rfqCheck] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfqCheck) { res.status(404).json({ error: "RFQ not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfqCheck.projectId)) return;
  const [item] = await db.insert(rfqItemsTable).values({
    rfqId: req.params.rfqId, itemName: b.itemName, unit: b.unit ?? "nos",
    requiredQty: String(n(b.requiredQty ?? 0)), specification: b.specification ?? null,
    inventoryItemId: b.inventoryItemId ?? null,
  }).returning();
  res.status(201).json({ id: item.id, rfqId: item.rfqId, itemName: item.itemName, unit: item.unit, requiredQty: n(item.requiredQty), specification: item.specification ?? null });
});

router.post("/rfqs/:rfqId/vendors", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const [rfqCheck] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfqCheck) { res.status(404).json({ error: "RFQ not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfqCheck.projectId)) return;
  const [row] = await db.insert(rfqVendorsTable).values({
    rfqId: req.params.rfqId, vendorId: b.vendorId, sentAt: new Date(),
  }).returning();
  res.status(201).json({ id: row.id, rfqId: row.rfqId, vendorId: row.vendorId, sentAt: d(row.sentAt), responseReceived: row.responseReceived });
});

router.post("/rfqs/:rfqId/responses", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.vendorId || b.unitRate === undefined) { res.status(400).json({ error: "vendorId, unitRate required" }); return; }
  const [rfqCheck] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfqCheck) { res.status(404).json({ error: "RFQ not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfqCheck.projectId)) return;
  const [row] = await db.insert(rfqResponsesTable).values({
    rfqId: req.params.rfqId, vendorId: b.vendorId, rfqItemId: b.rfqItemId ?? null,
    unitRate: String(n(b.unitRate)), gstRate: String(n(b.gstRate ?? 18)),
    leadTimeDays: b.leadTimeDays ?? null, deliveryCharges: String(n(b.deliveryCharges ?? 0)),
    validityDays: b.validityDays ?? null, remarks: b.remarks ?? null,
  }).returning();
  // Mark vendor as responded
  await db.update(rfqVendorsTable).set({ responseReceived: true })
    .where(and(eq(rfqVendorsTable.rfqId, req.params.rfqId), eq(rfqVendorsTable.vendorId, b.vendorId)));
  res.status(201).json({ id: row.id, rfqId: row.rfqId, vendorId: row.vendorId, rfqItemId: row.rfqItemId ?? null, unitRate: n(row.unitRate), gstRate: n(row.gstRate), isL1: row.isL1 });
});

// Build L1 comparative statement
router.get("/rfqs/:rfqId/comparison", requireAuth, async (req: Request, res: Response) => {
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfq) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfq.projectId)) return;
  const [items, responses] = await Promise.all([
    db.select().from(rfqItemsTable).where(eq(rfqItemsTable.rfqId, rfq.id)),
    db.select().from(rfqResponsesTable).where(eq(rfqResponsesTable.rfqId, rfq.id)),
  ]);
  const table = items.map(item => {
    const itemResponses = responses.filter(r => r.rfqItemId === item.id || !r.rfqItemId);
    const sorted = [...itemResponses].sort((a, b) => n(a.unitRate) - n(b.unitRate));
    const l1 = sorted[0];
    return {
      itemId: item.id, itemName: item.itemName, unit: item.unit, requiredQty: n(item.requiredQty),
      responses: sorted.map((r, idx) => ({
        vendorId: r.vendorId, rank: idx + 1, unitRate: n(r.unitRate), gstRate: n(r.gstRate),
        totalRate: n(r.unitRate) * (1 + n(r.gstRate) / 100),
        leadTimeDays: r.leadTimeDays ?? null, isL1: idx === 0,
      })),
      l1VendorId: l1?.vendorId ?? null, l1Rate: l1 ? n(l1.unitRate) : null,
    };
  });
  res.json({ rfqId: rfq.id, rfqNumber: rfq.rfqNumber, comparisonTable: table });
});

// Award PO to vendor
router.post("/rfqs/:rfqId/award", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.vendorId) { res.status(400).json({ error: "vendorId required" }); return; }
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, req.params.rfqId));
  if (!rfq) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, rfq.projectId)) return;
  // Enforce minimum 3 vendor responses (Indian procurement best practice)
  const responses = await db.select({ vendorId: rfqResponsesTable.vendorId })
    .from(rfqResponsesTable).where(eq(rfqResponsesTable.rfqId, rfq.id));
  const uniqueVendorCount = new Set(responses.map(r => r.vendorId)).size;
  if (uniqueVendorCount < 3 && !b.overrideVendorCount) {
    res.status(400).json({
      error: `Only ${uniqueVendorCount} vendor response(s) received — minimum 3 required per procurement policy. Pass overrideVendorCount:true to award anyway.`,
      vendorCount: uniqueVendorCount,
    }); return;
  }
  const [updated] = await db.update(rfqsTable).set({
    status: "awarded", awardedVendorId: b.vendorId, awardedAt: new Date(),
  }).where(eq(rfqsTable.id, rfq.id)).returning();
  res.json(sRfq(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/purchase-orders", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.projectId, req.params.projectId)) as any;
  if (status) q = db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.projectId, req.params.projectId), eq(purchaseOrdersTable.status, status)));
  const rows = await q.orderBy(desc(purchaseOrdersTable.createdAt));
  res.json(rows.map(sPo));
});

router.post("/projects/:projectId/purchase-orders", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.poNumber || !b.vendorId) { res.status(400).json({ error: "poNumber, vendorId required" }); return; }
  const [row] = await db.insert(purchaseOrdersTable).values({
    projectId: req.params.projectId, poNumber: b.poNumber,
    vendorId: b.vendorId, rfqId: b.rfqId ?? null, indentId: b.indentId ?? null,
    deliveryLocation: b.deliveryLocation ?? null,
    deliveryDeadline: b.deliveryDeadline ? new Date(b.deliveryDeadline) : null,
    paymentTerms: b.paymentTerms ?? null, notes: b.notes ?? null,
    createdById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(sPo(row));
});

router.get("/purchase-orders/:poId", requireAuth, async (req: Request, res: Response) => {
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.poId));
  if (!po) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, po.projectId)) return;
  const items = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, po.id));
  res.json({ ...sPo(po), items: items.map(sPoItem) });
});

router.get("/purchase-orders/:poId/items", requireAuth, async (req: Request, res: Response) => {
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.poId));
  if (!po) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, po.projectId)) return;
  const items = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, po.id));
  res.json(items.map(sPoItem));
});

router.post("/purchase-orders/:poId/items", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.itemName || b.orderedQty === undefined || b.unitRate === undefined) {
    res.status(400).json({ error: "itemName, orderedQty, unitRate required" }); return;
  }
  const [poCheck] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.poId));
  if (!poCheck) { res.status(404).json({ error: "PO not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, poCheck.projectId)) return;
  const orderedQty = n(b.orderedQty);
  const unitRate = n(b.unitRate);
  const gstRate = n(b.gstRate ?? 18);
  const amount = Math.round(orderedQty * unitRate * 100) / 100;
  const gstAmount = Math.round(amount * gstRate / 100 * 100) / 100;
  const [item] = await db.insert(poItemsTable).values({
    poId: req.params.poId, inventoryItemId: b.inventoryItemId ?? null,
    itemName: b.itemName, unit: b.unit ?? "nos",
    orderedQty: String(orderedQty), unitRate: String(unitRate),
    gstRate: String(gstRate), amount: String(amount), gstAmount: String(gstAmount),
    specification: b.specification ?? null, hsnCode: b.hsnCode ?? null,
  }).returning();
  // Recompute PO totals
  const allItems = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, req.params.poId));
  const totalAmount = allItems.reduce((s, i) => s + n(i.amount), 0);
  const totalGst = allItems.reduce((s, i) => s + n(i.gstAmount), 0);
  await db.update(purchaseOrdersTable).set({
    totalAmount: String(totalAmount), gstAmount: String(totalGst),
    grandTotal: String(totalAmount + totalGst),
  }).where(eq(purchaseOrdersTable.id, req.params.poId));
  res.status(201).json(sPoItem(item));
});

router.post("/purchase-orders/:poId/approve", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.poId));
  if (!po) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, po.projectId)) return;
  const [updated] = await db.update(purchaseOrdersTable).set({
    status: "approved", approvedById: req.user?.id ?? null, approvedAt: new Date(),
  }).where(eq(purchaseOrdersTable.id, po.id)).returning();
  // Update vendor order count
  await db.update(vendorsTable)
    .set({ totalOrders: sql`total_orders + 1` })
    .where(eq(vendorsTable.id, po.vendorId));
  res.json(sPo(updated));
});

router.patch("/purchase-orders/:poId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.poId));
  if (!po) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, po.projectId)) return;
  const patch: Record<string, any> = {};
  if (b.status !== undefined) patch.status = b.status;
  if (b.amendmentReason !== undefined) { patch.amendmentReason = b.amendmentReason; patch.version = po.version + 1; }
  if (b.notes !== undefined) patch.notes = b.notes;
  if (b.deliveryDeadline !== undefined) patch.deliveryDeadline = new Date(b.deliveryDeadline);
  const [updated] = await db.update(purchaseOrdersTable).set(patch)
    .where(eq(purchaseOrdersTable.id, po.id)).returning();
  res.json(sPo(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// GRN
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/grns", requireAuth, async (req: Request, res: Response) => {
  const { status, poId } = req.query as Record<string, string>;
  let cond: any = eq(grnsTable.projectId, req.params.projectId);
  if (status) cond = and(cond, eq(grnsTable.status, status));
  if (poId)   cond = and(cond, eq(grnsTable.poId, poId));
  const rows = await db.select().from(grnsTable).where(cond).orderBy(desc(grnsTable.createdAt));
  res.json(rows.map(sGrn));
});

router.post("/projects/:projectId/grns", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.grnNumber) { res.status(400).json({ error: "grnNumber required" }); return; }
  const [row] = await db.insert(grnsTable).values({
    projectId: req.params.projectId, grnNumber: b.grnNumber,
    poId: b.poId ?? null, vendorId: b.vendorId ?? null, storeId: b.storeId ?? null,
    vehicleNumber: b.vehicleNumber ?? null, dcNumber: b.dcNumber ?? null,
    invoiceNumber: b.invoiceNumber ?? null, invoiceAmount: b.invoiceAmount ? String(n(b.invoiceAmount)) : null,
    receivedById: req.user?.id ?? null,
  }).returning();
  res.status(201).json(sGrn(row));
});

router.get("/grns/:grnId", requireAuth, async (req: Request, res: Response) => {
  const [grn] = await db.select().from(grnsTable).where(eq(grnsTable.id, req.params.grnId));
  if (!grn) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, grn.projectId)) return;
  const items = await db.select().from(grnItemsTable).where(eq(grnItemsTable.grnId, grn.id));
  res.json({ ...sGrn(grn), items: items.map(sGrnItem) });
});

router.post("/grns/:grnId/items", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (b.receivedQty === undefined) { res.status(400).json({ error: "receivedQty required" }); return; }
  const [grn] = await db.select().from(grnsTable).where(eq(grnsTable.id, req.params.grnId));
  if (!grn) { res.status(404).json({ error: "GRN not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, grn.projectId)) return;
  // Infer itemName, unit, orderedQty, inventoryItemId from poItemId when not explicitly provided
  let itemName = b.itemName ?? null;
  let unit = b.unit ?? "nos";
  let orderedQty = n(b.orderedQty ?? 0);
  let inventoryItemId = b.inventoryItemId ?? null;
  let unitRate = n(b.unitRate ?? 0);
  if (b.poItemId && (!itemName || !b.unit || !b.unitRate)) {
    const [poi] = await db.select().from(poItemsTable).where(eq(poItemsTable.id, b.poItemId));
    if (poi) {
      if (!itemName) itemName = poi.itemName;
      if (!b.unit) unit = poi.unit ?? "nos";
      if (!b.orderedQty) orderedQty = n(poi.orderedQty);
      if (!inventoryItemId) inventoryItemId = poi.inventoryItemId ?? null;
      if (!b.unitRate) unitRate = n(poi.unitRate);
    }
  }
  if (!itemName) { res.status(400).json({ error: "itemName required (or provide poItemId to infer)" }); return; }
  const receivedQty = n(b.receivedQty);
  const acceptedQty = n(b.acceptedQty ?? receivedQty);
  const rejectedQty = Math.max(0, receivedQty - acceptedQty);
  const [item] = await db.insert(grnItemsTable).values({
    grnId: req.params.grnId, poItemId: b.poItemId ?? null,
    inventoryItemId, itemName, unit, orderedQty: String(orderedQty),
    receivedQty: String(receivedQty), acceptedQty: String(acceptedQty),
    rejectedQty: String(rejectedQty), unitRate: String(unitRate),
    batchNumber: b.batchNumber ?? null, gradeSpecification: b.gradeSpecification ?? null,
    condition: b.condition ?? "good", qcHold: b.qcHold ?? false, remarks: b.remarks ?? null,
  }).returning();
  res.status(201).json(sGrnItem(item));
});

// Submit GRN: run 3-way match and update inventory
router.post("/grns/:grnId/submit", requireAuth, async (req: Request, res: Response) => {
  const [grn] = await db.select().from(grnsTable).where(eq(grnsTable.id, req.params.grnId));
  if (!grn || grn.status !== "draft") { res.status(409).json({ error: "Only draft GRNs can be submitted" }); return; }
  if (await denyIfNoProjectAccess(req, res, grn.projectId)) return;

  const grnItems = await db.select().from(grnItemsTable).where(eq(grnItemsTable.grnId, grn.id));
  const qcHoldCount = grnItems.filter(i => i.qcHold).length;

  // 3-way match: compare total received vs ordered (partial receipt is OK; over-delivery is a mismatch)
  let matchStatus = "matched";
  const matchNotes: string[] = [];
  if (grn.poId) {
    const poItems = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, grn.poId));
    for (const gi of grnItems) {
      const poi = poItems.find(p => p.id === gi.poItemId);
      if (poi) {
        // Only flag over-delivery — partial receipts are legitimate
        const totalReceived = n(poi.receivedQty) + n(gi.receivedQty);
        const overDelivery = totalReceived - n(poi.orderedQty);
        if (overDelivery > 0.01) {
          matchStatus = "qty_mismatch";
          matchNotes.push(`${gi.itemName}: over-delivered by ${overDelivery.toFixed(2)} ${gi.unit ?? ""}`);
        }
        const rateDiff = Math.abs(n(gi.unitRate) - n(poi.unitRate));
        if (rateDiff > 0.01 && matchStatus === "matched") {
          matchStatus = "rate_mismatch";
          matchNotes.push(`${gi.itemName}: rate mismatch (PO ₹${n(poi.unitRate)} vs GRN ₹${n(gi.unitRate)})`);
        }
        // Update PO item with this GRN's accepted qty (accepted only — qc-hold items excluded)
        const acceptedNow = n(gi.qcHold ? 0 : gi.acceptedQty);
        await db.update(poItemsTable)
          .set({ receivedQty: String(n(poi.receivedQty) + acceptedNow) })
          .where(eq(poItemsTable.id, poi.id));
      }
    }
  }

  // Update inventory stock for accepted items
  for (const gi of grnItems.filter(i => !i.qcHold)) {
    if (!gi.inventoryItemId) continue;
    const [inv] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, gi.inventoryItemId));
    if (!inv) continue;
    const addedQty = n(gi.acceptedQty);
    const newStock = n(inv.currentStock) + addedQty;
    // WAC rate update
    const oldValue = n(inv.currentStock) * n(inv.avgRate);
    const addedValue = addedQty * n(gi.unitRate);
    const newAvgRate = newStock > 0 ? (oldValue + addedValue) / newStock : n(gi.unitRate);
    await db.update(inventoryItemsTable).set({
      currentStock: String(newStock), avgRate: String(Math.round(newAvgRate * 10000) / 10000),
      lastPurchaseRate: String(n(gi.unitRate)),
      isReorderTriggered: false, // reset on receipt
    }).where(eq(inventoryItemsTable.id, gi.inventoryItemId));
    // Stock ledger entry
    await db.insert(stockLedgerTable).values({
      projectId: grn.projectId, inventoryItemId: gi.inventoryItemId, storeId: grn.storeId,
      transactionType: "grn_receipt", entityType: "grn", entityId: grn.id,
      qty: String(addedQty), rate: String(n(gi.unitRate)),
      amount: String(Math.round(addedQty * n(gi.unitRate) * 100) / 100),
      balanceQty: String(newStock),
      narration: `GRN ${grn.grnNumber} — ${gi.itemName}`,
      createdById: req.user?.id ?? null,
    });
  }

  // Invoice 3-way match: compare invoice amount vs computed GRN value (leg 3)
  if (grn.invoiceAmount && n(grn.invoiceAmount) > 0) {
    const grnValue = grnItems.filter(i => !i.qcHold)
      .reduce((s, gi) => s + n(gi.acceptedQty) * n(gi.unitRate), 0);
    const invoiceAmt = n(grn.invoiceAmount);
    const invoiceDiff = Math.abs(invoiceAmt - grnValue);
    // Allow 2% tolerance for GST rounding / freight charges
    if (invoiceDiff > grnValue * 0.02 && matchStatus === "matched") {
      matchStatus = "rate_mismatch";
      matchNotes.push(`Invoice ₹${invoiceAmt.toFixed(0)} vs GRN value ₹${grnValue.toFixed(0)} — diff ₹${invoiceDiff.toFixed(0)}`);
    }
  }

  const newStatus = qcHoldCount > 0 ? "qc_pending" : "accepted";
  const [updated] = await db.update(grnsTable).set({
    status: newStatus, qcHoldCount, threeWayMatchStatus: matchStatus,
    threeWayMatchNotes: matchNotes.join("; ") || null,
  }).where(eq(grnsTable.id, grn.id)).returning();

  res.json(sGrn(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// QC RESULT HELPER — pass releases stock + ledger; fail marks rejected + debit note
// ─────────────────────────────────────────────────────────────────────────────

async function applyQcResult(projectId: string, grnItemId: string, result: "pass" | "fail", userId: string | null) {
  const [grnItem] = await db.select().from(grnItemsTable).where(eq(grnItemsTable.id, grnItemId));
  if (!grnItem || !grnItem.qcHold) return; // already processed or not on hold

  if (result === "pass") {
    // Release to stock: use WAC update identical to GRN submit flow
    if (grnItem.inventoryItemId) {
      const [inv] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, grnItem.inventoryItemId));
      if (inv) {
        const addedQty = n(grnItem.acceptedQty);
        const newStock = n(inv.currentStock) + addedQty;
        const oldValue = n(inv.currentStock) * n(inv.avgRate);
        const addedValue = addedQty * n(grnItem.unitRate);
        const newAvgRate = newStock > 0 ? (oldValue + addedValue) / newStock : n(grnItem.unitRate);
        await db.update(inventoryItemsTable).set({
          currentStock: String(newStock),
          avgRate: String(Math.round(newAvgRate * 10000) / 10000),
          lastPurchaseRate: String(n(grnItem.unitRate)),
          isReorderTriggered: false,
        }).where(eq(inventoryItemsTable.id, grnItem.inventoryItemId));
        // Write stock ledger entry for QC release
        await db.insert(stockLedgerTable).values({
          projectId, inventoryItemId: grnItem.inventoryItemId, storeId: null,
          transactionType: "grn_receipt", entityType: "grn_item", entityId: grnItem.id,
          qty: String(addedQty), rate: String(n(grnItem.unitRate)),
          amount: String(Math.round(addedQty * n(grnItem.unitRate) * 100) / 100),
          balanceQty: String(newStock),
          narration: `QC pass — ${grnItem.itemName} released from hold`,
          createdById: userId,
        });
        // Update PO received qty for the released qty (was skipped at GRN submit)
        if (grnItem.poItemId) {
          const [poi] = await db.select().from(poItemsTable).where(eq(poItemsTable.id, grnItem.poItemId));
          if (poi) {
            await db.update(poItemsTable)
              .set({ receivedQty: String(n(poi.receivedQty) + addedQty) })
              .where(eq(poItemsTable.id, poi.id));
          }
        }
      }
    }
    // Clear QC hold flag on GRN item
    await db.update(grnItemsTable).set({ qcHold: false }).where(eq(grnItemsTable.id, grnItemId));
  } else {
    // Fail: zero out accepted qty, mark rejected, flag debit note required
    // Material was never added to stock (held), so no stock reversal needed
    const receivedQty = n(grnItem.receivedQty);
    await db.update(grnItemsTable).set({
      acceptedQty: "0",
      rejectedQty: String(receivedQty),
      condition: "rejected",
      qcHold: false, // hold resolved — definitively rejected
      remarks: (grnItem.remarks ? grnItem.remarks + " | " : "") + "QC FAIL — pending debit note",
    }).where(eq(grnItemsTable.id, grnItemId));
    // Write a zero-qty ledger entry for traceability
    if (grnItem.inventoryItemId) {
      await db.insert(stockLedgerTable).values({
        projectId, inventoryItemId: grnItem.inventoryItemId, storeId: null,
        transactionType: "material_return", entityType: "grn_item", entityId: grnItem.id,
        qty: "0", rate: String(n(grnItem.unitRate)), amount: "0",
        balanceQty: "0", // balance unchanged — item never entered stock
        narration: `QC fail — ${grnItem.itemName} rejected, debit note required (qty ${receivedQty})`,
        createdById: userId,
      });
    }
  }

  // If all QC holds on the parent GRN are now resolved, move GRN to accepted
  const [grn] = await db.select().from(grnsTable).where(eq(grnsTable.id, grnItem.grnId));
  if (grn && grn.status === "qc_pending") {
    const remainingHolds = await db.select().from(grnItemsTable)
      .where(and(eq(grnItemsTable.grnId, grn.id), eq(grnItemsTable.qcHold, true)));
    if (remainingHolds.length === 0) {
      await db.update(grnsTable).set({ status: "accepted", qcHoldCount: 0 })
        .where(eq(grnsTable.id, grn.id));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL TESTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/material-tests", requireAuth, async (req: Request, res: Response) => {
  const { result } = req.query as Record<string, string>;
  let cond: any = eq(materialTestsTable.projectId, req.params.projectId);
  if (result) cond = and(cond, eq(materialTestsTable.testResult, result));
  const rows = await db.select().from(materialTestsTable).where(cond).orderBy(desc(materialTestsTable.createdAt));
  res.json(rows.map(sTest));
});

router.post("/projects/:projectId/material-tests", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.testType) { res.status(400).json({ error: "testType required" }); return; }
  const [row] = await db.insert(materialTestsTable).values({
    projectId: req.params.projectId, grnItemId: b.grnItemId ?? null,
    inventoryItemId: b.inventoryItemId ?? null, testType: b.testType,
    isCode: b.isCode ?? null, sampleDate: b.sampleDate ? new Date(b.sampleDate) : null,
    testDate: b.testDate ? new Date(b.testDate) : null,
    requiredValue: b.requiredValue ? String(n(b.requiredValue)) : null,
    actualValue: b.actualValue ? String(n(b.actualValue)) : null,
    unit: b.unit ?? null, testedById: req.user?.id ?? null,
    remarks: b.remarks ?? null, testResult: b.testResult ?? "pending",
  }).returning();
  // If result already known at creation time, apply pass/fail side-effects
  if (b.grnItemId && (b.testResult === "pass" || b.testResult === "fail")) {
    await applyQcResult(req.params.projectId, b.grnItemId, b.testResult, req.user?.id ?? null);
  }
  if (row.testResult === "pass" || row.testResult === "fail") {
    notifyMaterialTestFinalised(row.id).catch(() => {});
  }
  res.status(201).json(sTest(row));
});

router.patch("/material-tests/:testId", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const [test] = await db.select().from(materialTestsTable).where(eq(materialTestsTable.id, req.params.testId));
  if (!test) { res.status(404).json({ error: "Not found" }); return; }
  if (await denyIfNoProjectAccess(req, res, test.projectId)) return;
  if (test.testResult !== "pending" && b.testResult && b.testResult !== test.testResult) {
    res.status(409).json({ error: "Test result already finalised" }); return;
  }
  const patch: Record<string, any> = {};
  if (b.testResult !== undefined) patch.testResult = b.testResult;
  if (b.actualValue !== undefined) patch.actualValue = String(n(b.actualValue));
  if (b.certificateUrl !== undefined) patch.certificateUrl = b.certificateUrl;
  if (b.remarks !== undefined) patch.remarks = b.remarks;
  if (b.debitNoteIssued !== undefined) patch.debitNoteIssued = b.debitNoteIssued;
  const [updated] = await db.update(materialTestsTable).set(patch).where(eq(materialTestsTable.id, test.id)).returning();
  // Apply pass/fail side-effects only when transitioning from pending
  if (test.testResult === "pending" && test.grnItemId && (b.testResult === "pass" || b.testResult === "fail")) {
    await applyQcResult(test.projectId, test.grnItemId, b.testResult, req.user?.id ?? null);
  }
  if (test.testResult === "pending" && (updated.testResult === "pass" || updated.testResult === "fail")) {
    notifyMaterialTestFinalised(updated.id).catch(() => {});
  }
  res.json(sTest(updated));
});

// ─────────────────────────────────────────────────────────────────────────────
// STOCK ISSUES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/stock-issues", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(stockIssuesTable)
    .where(eq(stockIssuesTable.projectId, req.params.projectId))
    .orderBy(desc(stockIssuesTable.createdAt));
  res.json(rows.map(sIssue));
});

router.post("/projects/:projectId/stock-issues", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.issueNumber) { res.status(400).json({ error: "issueNumber required" }); return; }
  // Pre-validate stock for ALL line items BEFORE any writes, then wrap the
  // whole flow in a transaction so errors roll back the issue header too.
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  try {
    const result = await db.transaction(async (tx) => {
      // 1) Insert header
      const [row] = await tx.insert(stockIssuesTable).values({
        projectId: req.params.projectId, issueNumber: b.issueNumber,
        indentId: b.indentId ?? null, storeId: b.storeId ?? null,
        issuedToName: b.issuedToName ?? null, issuedToContractor: b.issuedToContractor ?? null,
        wbsActivityId: b.wbsActivityId ?? null, notes: b.notes ?? null,
        contractorSignature: b.contractorSignature ?? null,
        issuedById: req.user?.id ?? null,
      }).returning();
      // 2) Process line items
      for (const it of items) {
        const issuedQty = n(it.issuedQty ?? 0);
        if (issuedQty <= 0) continue;
        const [inv] = await tx.select().from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.id, it.inventoryItemId ?? ""));
        if (!inv) continue;
        const currentStock = n(inv.currentStock);
        if (issuedQty > currentStock + 0.001) {
          // Throw to abort transaction; caller maps to HTTP 400
          throw Object.assign(new Error("insufficient_stock"), {
            httpStatus: 400,
            body: {
              error: `Insufficient stock for ${inv.itemName}: requested ${issuedQty} ${inv.unit} but only ${currentStock} ${inv.unit} available`,
              itemName: inv.itemName, available: currentStock, requested: issuedQty,
            },
          });
        }
        const rate = n(inv.avgRate);
        const amount = Math.round(issuedQty * rate * 100) / 100;
        await tx.insert(issueItemsTable).values({
          issueId: row.id, inventoryItemId: it.inventoryItemId ?? null,
          indentItemId: it.indentItemId ?? null, itemName: inv.itemName,
          unit: inv.unit, issuedQty: String(issuedQty), rate: String(rate), amount: String(amount),
        });
        const newStock = currentStock - issuedQty;
        await tx.update(inventoryItemsTable).set({
          currentStock: String(newStock),
          isReorderTriggered: newStock <= n(inv.minStockLevel),
        }).where(eq(inventoryItemsTable.id, inv.id));
        await tx.insert(stockLedgerTable).values({
          projectId: req.params.projectId, inventoryItemId: inv.id, storeId: b.storeId ?? null,
          transactionType: "issue", entityType: "stock_issue", entityId: row.id,
          qty: String(-issuedQty), rate: String(rate), amount: String(-amount), balanceQty: String(newStock),
          narration: `Issue ${b.issueNumber} — ${inv.itemName}`, createdById: req.user?.id ?? null,
        });
      }
      // 3) Cumulative indent fulfillment — historical query runs AFTER inserts,
      // so it already includes the just-inserted issue_items. Do NOT add current
      // request qty again (would double-count).
      if (b.indentId) {
        const [indentRow] = await tx.select().from(materialIndentsTable)
          .where(eq(materialIndentsTable.id, b.indentId));
        if (indentRow?.status === "approved") {
          const indentItems = await tx.select().from(indentItemsTable)
            .where(eq(indentItemsTable.indentId, b.indentId));
          const indentItemIds = indentItems.map(ii => ii.id).filter(Boolean);
          const allIssued = indentItemIds.length > 0
            ? await tx.select().from(issueItemsTable)
                .where(inArray(issueItemsTable.indentItemId, indentItemIds))
            : [];
          const isFullyFulfilled = indentItems.every(ii => {
            const approvedQty = n(ii.approvedQty ?? ii.requiredQty);
            const total = allIssued
              .filter(h => h.indentItemId === ii.id)
              .reduce((s, h) => s + n(h.issuedQty), 0);
            return total >= approvedQty - 0.01;
          });
          if (isFullyFulfilled) {
            await tx.update(materialIndentsTable).set({ status: "fulfilled" })
              .where(eq(materialIndentsTable.id, b.indentId));
          }
        }
      }
      return row;
    });
    res.status(201).json(sIssue(result));
  } catch (err: any) {
    if (err?.httpStatus === 400 && err?.body) {
      res.status(400).json(err.body); return;
    }
    throw err;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WASTAGE LOGS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/wastage-logs", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(wastageLogsTable)
    .where(eq(wastageLogsTable.projectId, req.params.projectId))
    .orderBy(desc(wastageLogsTable.createdAt));
  res.json(rows.map(sWaste));
});

router.post("/projects/:projectId/wastage-logs", requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.qty || !b.reasonCode) { res.status(400).json({ error: "qty, reasonCode required" }); return; }
  const qty = n(b.qty);
  const normQty = b.normQty ? n(b.normQty) : null;
  const aboveNorm = normQty !== null && qty > normQty;
  let rate = n(b.rate ?? 0);
  if (b.inventoryItemId && rate === 0) {
    const [inv] = await db.select({ avgRate: inventoryItemsTable.avgRate })
      .from(inventoryItemsTable).where(eq(inventoryItemsTable.id, b.inventoryItemId));
    if (inv) rate = n(inv.avgRate);
  }
  const amount = Math.round(qty * rate * 100) / 100;
  const [row] = await db.insert(wastageLogsTable).values({
    projectId: req.params.projectId, inventoryItemId: b.inventoryItemId ?? null,
    storeId: b.storeId ?? null, qty: String(qty), unit: b.unit ?? "nos",
    rate: String(rate), amount: String(amount), reasonCode: b.reasonCode,
    description: b.description ?? null, normQty: normQty ? String(normQty) : null,
    aboveNorm, alertSentToPm: aboveNorm, loggedById: req.user?.id ?? null,
  }).returning();
  // Deduct from stock
  if (b.inventoryItemId) {
    const [inv] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, b.inventoryItemId));
    if (inv) {
      const newStock = Math.max(0, n(inv.currentStock) - qty);
      await db.update(inventoryItemsTable).set({ currentStock: String(newStock) }).where(eq(inventoryItemsTable.id, inv.id));
      await db.insert(stockLedgerTable).values({
        projectId: req.params.projectId, inventoryItemId: inv.id, storeId: b.storeId ?? null,
        transactionType: "wastage", entityType: "wastage_log", entityId: row.id,
        qty: String(-qty), rate: String(rate), amount: String(-amount), balanceQty: String(newStock),
        narration: `Wastage — ${b.reasonCode}`, createdById: req.user?.id ?? null,
      });
    }
  }
  res.status(201).json(sWaste(row));
});

// ─────────────────────────────────────────────────────────────────────────────
// RATE CONTRACTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/rate-contracts", requireAuth, async (req: Request, res: Response) => {
  const rows = await db.select().from(rateContractsTable)
    .where(eq(rateContractsTable.projectId, req.params.projectId))
    .orderBy(desc(rateContractsTable.createdAt));
  res.json(rows.map(sRc));
});

router.post("/projects/:projectId/rate-contracts", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.vendorId || !b.contractNumber || !b.agreedRate || !b.validFrom || !b.validTo || !b.itemName) {
    res.status(400).json({ error: "vendorId, contractNumber, agreedRate, validFrom, validTo, itemName required" }); return;
  }
  const [row] = await db.insert(rateContractsTable).values({
    projectId: req.params.projectId, vendorId: b.vendorId, contractNumber: b.contractNumber,
    validFrom: new Date(b.validFrom), validTo: new Date(b.validTo),
    inventoryItemId: b.inventoryItemId ?? null, itemName: b.itemName, unit: b.unit ?? "nos",
    agreedRate: String(n(b.agreedRate)), gstRate: String(n(b.gstRate ?? 18)),
    maxQty: b.maxQty ? String(n(b.maxQty)) : null, notes: b.notes ?? null,
  }).returning();
  res.status(201).json(sRc(row));
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/inventory-summary", requireAuth, async (req: Request, res: Response) => {
  const pid = req.params.projectId;
  const [items, wastage, issues] = await Promise.all([
    db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.projectId, pid)),
    db.select().from(wastageLogsTable).where(eq(wastageLogsTable.projectId, pid)),
    db.select().from(stockIssuesTable).where(eq(stockIssuesTable.projectId, pid)),
  ]);
  const totalItems = items.length;
  const reorderItems = items.filter(i => n(i.currentStock) <= n(i.minStockLevel)).length;
  const totalStockValue = items.reduce((s, i) => s + n(i.currentStock) * n(i.avgRate), 0);
  const totalWastageValue = wastage.reduce((s, w) => s + n(w.amount), 0);
  const aboveNormWastage = wastage.filter(w => w.aboveNorm).length;
  const categoryBreakdown = items.reduce((acc: Record<string, number>, i) => {
    const cat = i.category ?? "other";
    acc[cat] = (acc[cat] ?? 0) + n(i.currentStock) * n(i.avgRate);
    return acc;
  }, {});
  res.json({
    totalItems, reorderItems, totalStockValue, totalWastageValue, aboveNormWastage,
    totalIssues: issues.length, categoryBreakdown,
    reorderAlerts: items.filter(i => n(i.currentStock) <= n(i.minStockLevel)).map(i => ({
      id: i.id, itemName: i.itemName, currentStock: n(i.currentStock),
      minStockLevel: n(i.minStockLevel), unit: i.unit,
    })),
  });
});

// Monthly reconciliation report
router.get("/projects/:projectId/reconciliation", requireAuth, async (req: Request, res: Response) => {
  const { month, year } = req.query as Record<string, string>;
  const pid = req.params.projectId;
  const startDate = new Date(parseInt(year ?? String(new Date().getFullYear())), parseInt(month ?? "0") - 1, 1);
  const endDate   = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

  const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.projectId, pid));
  const ledger = await db.select().from(stockLedgerTable)
    .where(and(
      eq(stockLedgerTable.projectId, pid),
      gte(stockLedgerTable.createdAt, startDate),
      lte(stockLedgerTable.createdAt, endDate),
    ));

  const report = items.map(item => {
    const entries = ledger.filter(l => l.inventoryItemId === item.id);
    const received = entries.filter(l => l.transactionType === "grn_receipt").reduce((s, l) => s + n(l.qty), 0);
    const issued   = entries.filter(l => l.transactionType === "issue").reduce((s, l) => s + Math.abs(n(l.qty)), 0);
    const wastage  = entries.filter(l => l.transactionType === "wastage").reduce((s, l) => s + Math.abs(n(l.qty)), 0);
    const balance  = n(item.currentStock);
    return { itemId: item.id, itemName: item.itemName, unit: item.unit, category: item.category ?? "other", received, issued, wastage, balance, avgRate: n(item.avgRate), stockValue: balance * n(item.avgRate) };
  });
  res.json({ projectId: pid, period: { month: parseInt(month ?? "0"), year: parseInt(year ?? String(new Date().getFullYear())) }, items: report });
});

export default router;
