import {
  db,
  vendorsTable, avlEntriesTable, storesTable, inventoryItemsTable,
  stockLedgerTable, materialIndentsTable, indentItemsTable,
  rfqsTable, rfqItemsTable, rfqVendorsTable, rfqResponsesTable,
  purchaseOrdersTable, poItemsTable, grnsTable, grnItemsTable,
  materialTestsTable, stockIssuesTable, issueItemsTable, wastageLogsTable,
  rateContractsTable, projectsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🌱 Seeding supply chain data...");

  // Get first project
  const [project] = await db.select().from(projectsTable).limit(1);
  if (!project) { console.error("No project found — run main seed first."); process.exit(1); }
  const pid = project.id;
  console.log(`Using project: ${project.name} (${pid})`);

  // ── Vendors ─────────────────────────────────────────────────────────────────
  const vendorData = [
    { name: "Ramco Cements Pvt Ltd",       code: "VND-001", contactPerson: "Ravi Kumar",     email: "ravi@ramcocements.in",    phone: "9841000001", city: "Chennai",   state: "Tamil Nadu",    gstNumber: "33AABCR1234A1ZA", pan: "AABCR1234A", msmeCategory: "small",  status: "active" as const },
    { name: "TISCO Steel Traders",          code: "VND-002", contactPerson: "Suresh Patel",   email: "suresh@tiscosteel.com",   phone: "9322000002", city: "Mumbai",    state: "Maharashtra",   gstNumber: "27AABCT2345B1ZB", pan: "AABCT2345B", msmeCategory: "medium", status: "active" as const },
    { name: "Kaveri Aggregates & Sand",     code: "VND-003", contactPerson: "Kavitha Devi",   email: "kavitha@kaverisand.in",   phone: "9845000003", city: "Bengaluru", state: "Karnataka",     gstNumber: "29AABCK3456C1ZC", pan: "AABCK3456C", msmeCategory: "micro",  status: "active" as const },
    { name: "Ashoka Bricks & Tiles",        code: "VND-004", contactPerson: "Ashok Singh",    email: "ashok@ashokabricks.com",  phone: "9711000004", city: "Delhi",     state: "Delhi",         gstNumber: "07AABCA4567D1ZD", pan: "AABCA4567D", msmeCategory: "small",  status: "active" as const },
    { name: "National Plumbing Supplies",   code: "VND-005", contactPerson: "Nathan V",       email: "nathan@npsupplies.com",   phone: "9600000005", city: "Hyderabad", state: "Telangana",     gstNumber: "36AAACN5678E1ZE", pan: "AAACN5678E", msmeCategory: "small",  status: "active" as const },
    { name: "Electro Infra Solutions",      code: "VND-006", contactPerson: "Elango P",       email: "elango@electroinfra.in",  phone: "9944000006", city: "Coimbatore",state: "Tamil Nadu",    gstNumber: "33AAACE6789F1ZF", pan: "AAACE6789F", msmeCategory: "micro",  status: "active" as const },
    { name: "Sri Ram Hardware Mart",        code: "VND-007", contactPerson: "Ram Das",        email: "ram@sriramhardware.com",  phone: "9876000007", city: "Pune",      state: "Maharashtra",   gstNumber: "27AABCS7890G1ZG", pan: "AABCS7890G", msmeCategory: "micro",  status: "active" as const },
    { name: "Mahaveer Timber Works",        code: "VND-008", contactPerson: "Mahaveer Jain",  email: "jain@mahaveertimber.com", phone: "9871000008", city: "Jaipur",    state: "Rajasthan",     gstNumber: "08AABCM8901H1ZH", pan: "AABCM8901H", msmeCategory: "small",  status: "active" as const },
    { name: "Asian Paints Dealer (B'luru)", code: "VND-009", contactPerson: "Deepak Mehta",   email: "deepak@apdealer.in",      phone: "9845000009", city: "Bengaluru", state: "Karnataka",     gstNumber: "29AAACA9012I1ZI", pan: "AAACA9012I", msmeCategory: "medium", status: "active" as const },
    { name: "UltraTech Cement Hub",         code: "VND-010", contactPerson: "Ultra Raj",      email: "raj@ultratechhub.com",    phone: "9944000010", city: "Chennai",   state: "Tamil Nadu",    gstNumber: "33AAACU0123J1ZJ", pan: "AAACU0123J", msmeCategory: "small",  status: "active" as const },
  ];
  const vendors = await db.insert(vendorsTable).values(
    vendorData.map(v => ({ ...v, performanceScore: "85", onTimeDeliveryPct: "90", qualityAcceptancePct: "95", totalOrders: 12, bankName: "SBI", accountNumber: "1234567890", ifscCode: "SBIN0001234" }))
  ).returning();
  console.log(`✅ ${vendors.length} vendors created`);

  // ── AVL entries ─────────────────────────────────────────────────────────────
  await db.insert(avlEntriesTable).values([
    { projectId: pid, vendorId: vendors[0].id, materialCategory: "cement",     notes: "OPC 53 grade" },
    { projectId: pid, vendorId: vendors[9].id, materialCategory: "cement",     notes: "PPC grade" },
    { projectId: pid, vendorId: vendors[1].id, materialCategory: "steel",      notes: "Fe 500D TMT bars" },
    { projectId: pid, vendorId: vendors[2].id, materialCategory: "aggregates", notes: "20mm & 40mm" },
    { projectId: pid, vendorId: vendors[2].id, materialCategory: "sand",       notes: "Manufactured sand" },
    { projectId: pid, vendorId: vendors[3].id, materialCategory: "bricks",     notes: "Fly ash bricks" },
    { projectId: pid, vendorId: vendors[4].id, materialCategory: "plumbing",   notes: "CPVC & GI pipes" },
    { projectId: pid, vendorId: vendors[5].id, materialCategory: "electrical", notes: "Cables & switchgear" },
  ]);
  console.log("✅ AVL entries created");

  // ── Stores ──────────────────────────────────────────────────────────────────
  const [mainStore, subStore] = await db.insert(storesTable).values([
    { projectId: pid, name: "Main Site Store",     storeType: "main", location: "Ground floor, Block A", storeKeeperName: "Ramaiah K" },
    { projectId: pid, name: "Sub-Store Block B",   storeType: "sub",  location: "1st floor, Block B",  storeKeeperName: "Govind S" },
  ]).returning();
  console.log("✅ Stores created");

  // ── Inventory items ─────────────────────────────────────────────────────────
  const itemData = [
    { itemCode: "MAT-001", itemName: "OPC 53 Grade Cement",    category: "cement",      unit: "bags",   hsnCode: "2523", minStockLevel: "100", maxStockLevel: "2000", currentStock: "450",  avgRate: "385",    lastPurchaseRate: "385" },
    { itemCode: "MAT-002", itemName: "PPC Cement",              category: "cement",      unit: "bags",   hsnCode: "2523", minStockLevel: "50",  maxStockLevel: "1000", currentStock: "200",  avgRate: "370",    lastPurchaseRate: "370" },
    { itemCode: "MAT-003", itemName: "TMT Steel 12mm (Fe500D)", category: "steel",       unit: "MT",     hsnCode: "7213", minStockLevel: "5",   maxStockLevel: "100",  currentStock: "28",   avgRate: "58500",  lastPurchaseRate: "58500" },
    { itemCode: "MAT-004", itemName: "TMT Steel 16mm (Fe500D)", category: "steel",       unit: "MT",     hsnCode: "7213", minStockLevel: "5",   maxStockLevel: "80",   currentStock: "15",   avgRate: "57800",  lastPurchaseRate: "57800" },
    { itemCode: "MAT-005", itemName: "TMT Steel 20mm (Fe500D)", category: "steel",       unit: "MT",     hsnCode: "7213", minStockLevel: "3",   maxStockLevel: "60",   currentStock: "10",   avgRate: "57600",  lastPurchaseRate: "57600" },
    { itemCode: "MAT-006", itemName: "20mm Coarse Aggregate",   category: "aggregates",  unit: "cu.m",   hsnCode: "2517", minStockLevel: "20",  maxStockLevel: "500",  currentStock: "145",  avgRate: "1200",   lastPurchaseRate: "1200" },
    { itemCode: "MAT-007", itemName: "40mm Coarse Aggregate",   category: "aggregates",  unit: "cu.m",   hsnCode: "2517", minStockLevel: "10",  maxStockLevel: "300",  currentStock: "80",   avgRate: "1050",   lastPurchaseRate: "1050" },
    { itemCode: "MAT-008", itemName: "Manufactured Sand (M-Sand)", category: "sand",    unit: "cu.m",   hsnCode: "2505", minStockLevel: "30",  maxStockLevel: "600",  currentStock: "220",  avgRate: "900",    lastPurchaseRate: "900" },
    { itemCode: "MAT-009", itemName: "Fly Ash Bricks (9x4x3)",  category: "bricks",      unit: "nos",    hsnCode: "6901", minStockLevel: "5000",maxStockLevel: "50000",currentStock: "18000",avgRate: "6.5",    lastPurchaseRate: "6.5" },
    { itemCode: "MAT-010", itemName: "Red Bricks",               category: "bricks",      unit: "nos",    hsnCode: "6901", minStockLevel: "2000",maxStockLevel: "20000",currentStock: "8000", avgRate: "8",      lastPurchaseRate: "8" },
    { itemCode: "MAT-011", itemName: "CPVC Pipe 25mm",           category: "plumbing",    unit: "mtr",    hsnCode: "3917", minStockLevel: "100", maxStockLevel: "2000", currentStock: "560",  avgRate: "145",    lastPurchaseRate: "145" },
    { itemCode: "MAT-012", itemName: "GI Pipe 50mm",             category: "plumbing",    unit: "mtr",    hsnCode: "7306", minStockLevel: "50",  maxStockLevel: "1000", currentStock: "280",  avgRate: "320",    lastPurchaseRate: "320" },
    { itemCode: "MAT-013", itemName: "PVC Conduit 25mm",         category: "electrical",  unit: "mtr",    hsnCode: "3917", minStockLevel: "200", maxStockLevel: "3000", currentStock: "1200", avgRate: "38",     lastPurchaseRate: "38" },
    { itemCode: "MAT-014", itemName: "XLPE Cable 6 sq.mm (4C)", category: "electrical",  unit: "mtr",    hsnCode: "8544", minStockLevel: "100", maxStockLevel: "2000", currentStock: "450",  avgRate: "185",    lastPurchaseRate: "185" },
    { itemCode: "MAT-015", itemName: "Formwork Plywood 12mm",   category: "timber",       unit: "sheet",  hsnCode: "4412", minStockLevel: "20",  maxStockLevel: "500",  currentStock: "85",   avgRate: "1650",   lastPurchaseRate: "1650" },
    { itemCode: "MAT-016", itemName: "Binding Wire",             category: "hardware",     unit: "kg",     hsnCode: "7217", minStockLevel: "50",  maxStockLevel: "500",  currentStock: "180",  avgRate: "72",     lastPurchaseRate: "72" },
    { itemCode: "MAT-017", itemName: "Reinforcement Cover Blocks",category:"hardware",     unit: "bag",    hsnCode: "6810", minStockLevel: "10",  maxStockLevel: "100",  currentStock: "35",   avgRate: "450",    lastPurchaseRate: "450" },
    { itemCode: "MAT-018", itemName: "Concrete Curing Compound", category: "chemicals",   unit: "ltr",    hsnCode: "3824", minStockLevel: "50",  maxStockLevel: "500",  currentStock: "95",   avgRate: "120",    lastPurchaseRate: "120" },
    { itemCode: "MAT-019", itemName: "Waterproofing Admixture",  category: "admixtures",  unit: "ltr",    hsnCode: "3824", minStockLevel: "20",  maxStockLevel: "200",  currentStock: "60",   avgRate: "280",    lastPurchaseRate: "280" },
    { itemCode: "MAT-020", itemName: "Primer — Asian Paints",   category: "paint",        unit: "ltr",    hsnCode: "3210", minStockLevel: "50",  maxStockLevel: "500",  currentStock: "120",  avgRate: "180",    lastPurchaseRate: "180" },
    { itemCode: "MAT-021", itemName: "Exterior Emulsion Paint",  category: "paint",        unit: "ltr",    hsnCode: "3210", minStockLevel: "50",  maxStockLevel: "600",  currentStock: "80",   avgRate: "310",    lastPurchaseRate: "310" },
    { itemCode: "MAT-022", itemName: "Ceramic Floor Tiles 600x600", category: "tiles",   unit: "sq.m",   hsnCode: "6907", minStockLevel: "50",  maxStockLevel: "1000", currentStock: "15",   avgRate: "650",    lastPurchaseRate: "650" },
    { itemCode: "MAT-023", itemName: "Vitrified Floor Tiles 800x800", category:"tiles",  unit: "sq.m",   hsnCode: "6907", minStockLevel: "30",  maxStockLevel: "500",  currentStock: "10",   avgRate: "980",    lastPurchaseRate: "980" },
    { itemCode: "MAT-024", itemName: "Glass Pane 6mm Toughened", category: "glass",       unit: "sq.m",   hsnCode: "7005", minStockLevel: "10",  maxStockLevel: "200",  currentStock: "8",    avgRate: "1200",   lastPurchaseRate: "1200" },
    { itemCode: "MAT-025", itemName: "Teak Wood Door Frame",     category: "timber",       unit: "nos",    hsnCode: "4418", minStockLevel: "5",   maxStockLevel: "100",  currentStock: "3",    avgRate: "8500",   lastPurchaseRate: "8500" },
    { itemCode: "MAT-026", itemName: "AAC Block 600x200x200",    category: "bricks",       unit: "cu.m",   hsnCode: "6810", minStockLevel: "10",  maxStockLevel: "200",  currentStock: "45",   avgRate: "4200",   lastPurchaseRate: "4200" },
    { itemCode: "MAT-027", itemName: "Plaster of Paris",         category: "chemicals",    unit: "bag",    hsnCode: "2520", minStockLevel: "20",  maxStockLevel: "300",  currentStock: "65",   avgRate: "320",    lastPurchaseRate: "320" },
    { itemCode: "MAT-028", itemName: "Anti-termite Chemical",    category: "chemicals",    unit: "ltr",    hsnCode: "3808", minStockLevel: "10",  maxStockLevel: "100",  currentStock: "4",    avgRate: "850",    lastPurchaseRate: "850" },
    { itemCode: "MAT-029", itemName: "GI Nails Assorted",        category: "hardware",     unit: "kg",     hsnCode: "7317", minStockLevel: "20",  maxStockLevel: "200",  currentStock: "55",   avgRate: "95",     lastPurchaseRate: "95" },
    { itemCode: "MAT-030", itemName: "Safety Helmets",           category: "other",        unit: "nos",    hsnCode: "6506", minStockLevel: "10",  maxStockLevel: "50",   currentStock: "22",   avgRate: "450",    lastPurchaseRate: "450" },
  ];
  const invItems = await db.insert(inventoryItemsTable).values(
    itemData.map(i => ({ ...i, projectId: pid, storeId: mainStore.id, costingMethod: "wac" as const }))
  ).returning();
  console.log(`✅ ${invItems.length} inventory items created`);

  // ── Material indents ─────────────────────────────────────────────────────────
  const indent1 = await db.insert(materialIndentsTable).values({
    projectId: pid, indentNumber: "IND-2025-001",
    indentDate: new Date("2025-04-01"), requiredByDate: new Date("2025-04-10"),
    status: "approved", approvedAt: new Date("2025-04-03"),
    remarks: "Foundation casting materials required urgently",
  }).returning().then(r => r[0]);

  const indent2 = await db.insert(materialIndentsTable).values({
    projectId: pid, indentNumber: "IND-2025-002",
    indentDate: new Date("2025-04-15"), requiredByDate: new Date("2025-04-25"),
    status: "submitted", remarks: "First floor columns — steel requirement",
  }).returning().then(r => r[0]);

  const indent3 = await db.insert(materialIndentsTable).values({
    projectId: pid, indentNumber: "IND-2025-003",
    indentDate: new Date("2025-05-01"), requiredByDate: new Date("2025-05-10"),
    status: "draft", remarks: "Plastering materials",
  }).returning().then(r => r[0]);

  await db.insert(indentItemsTable).values([
    { indentId: indent1.id, inventoryItemId: invItems[0].id, itemName: "OPC 53 Grade Cement", unit: "bags", requiredQty: "500", availableStock: "450", approvedQty: "500", specification: "IS:12269" },
    { indentId: indent1.id, inventoryItemId: invItems[5].id, itemName: "20mm Coarse Aggregate", unit: "cu.m", requiredQty: "150", availableStock: "145", approvedQty: "150" },
    { indentId: indent1.id, inventoryItemId: invItems[7].id, itemName: "Manufactured Sand (M-Sand)", unit: "cu.m", requiredQty: "80", availableStock: "220", approvedQty: "80" },
    { indentId: indent2.id, inventoryItemId: invItems[2].id, itemName: "TMT Steel 12mm (Fe500D)", unit: "MT", requiredQty: "20", availableStock: "28" },
    { indentId: indent2.id, inventoryItemId: invItems[3].id, itemName: "TMT Steel 16mm (Fe500D)", unit: "MT", requiredQty: "15", availableStock: "15" },
    { indentId: indent3.id, inventoryItemId: invItems[1].id, itemName: "PPC Cement", unit: "bags", requiredQty: "300", availableStock: "200" },
    { indentId: indent3.id, inventoryItemId: invItems[26].id, itemName: "Plaster of Paris", unit: "bag", requiredQty: "80", availableStock: "65" },
  ]);
  console.log("✅ Material indents and items created");

  // ── RFQs ────────────────────────────────────────────────────────────────────
  const rfq1 = await db.insert(rfqsTable).values({
    projectId: pid, rfqNumber: "RFQ-2025-001", rfqDate: new Date("2025-03-20"),
    indentId: indent1.id, submissionDeadline: new Date("2025-03-28"),
    deliveryDeadline: new Date("2025-04-05"), deliveryLocation: "Main Site Store",
    status: "awarded", paymentTerms: "30 days credit",
    awardedVendorId: vendors[0].id, awardedAt: new Date("2025-03-30"),
  }).returning().then(r => r[0]);

  const rfq2 = await db.insert(rfqsTable).values({
    projectId: pid, rfqNumber: "RFQ-2025-002", rfqDate: new Date("2025-04-20"),
    indentId: indent2.id, submissionDeadline: new Date("2025-04-28"),
    deliveryDeadline: new Date("2025-05-05"), deliveryLocation: "Main Site Store",
    status: "received", paymentTerms: "15 days credit",
  }).returning().then(r => r[0]);

  const [rfqItem1, rfqItem2] = await db.insert(rfqItemsTable).values([
    { rfqId: rfq1.id, itemName: "OPC 53 Grade Cement", unit: "bags", requiredQty: "500", specification: "IS:12269, 53 grade", inventoryItemId: invItems[0].id },
    { rfqId: rfq2.id, itemName: "TMT Steel 12mm (Fe500D)", unit: "MT", requiredQty: "20", specification: "IS:1786, Fe500D", inventoryItemId: invItems[2].id },
  ]).returning();

  await db.insert(rfqVendorsTable).values([
    { rfqId: rfq1.id, vendorId: vendors[0].id, sentAt: new Date("2025-03-20"), responseReceived: true },
    { rfqId: rfq1.id, vendorId: vendors[9].id, sentAt: new Date("2025-03-20"), responseReceived: true },
    { rfqId: rfq2.id, vendorId: vendors[1].id, sentAt: new Date("2025-04-20"), responseReceived: true },
  ]);

  await db.insert(rfqResponsesTable).values([
    { rfqId: rfq1.id, rfqItemId: rfqItem1.id, vendorId: vendors[0].id, unitRate: "380", gstRate: "28", leadTimeDays: 3, deliveryCharges: "0", validityDays: 30, isL1: true, remarks: "Ex-godown rate" },
    { rfqId: rfq1.id, rfqItemId: rfqItem1.id, vendorId: vendors[9].id, unitRate: "395", gstRate: "28", leadTimeDays: 5, deliveryCharges: "2000", validityDays: 30, isL1: false },
    { rfqId: rfq2.id, rfqItemId: rfqItem2.id, vendorId: vendors[1].id, unitRate: "58000", gstRate: "18", leadTimeDays: 7, deliveryCharges: "0", validityDays: 15, isL1: true },
  ]);
  console.log("✅ RFQs, items, vendors, and responses created");

  // ── Purchase Orders ──────────────────────────────────────────────────────────
  const po1 = await db.insert(purchaseOrdersTable).values({
    projectId: pid, poNumber: "PO-2025-001", poDate: new Date("2025-03-31"),
    vendorId: vendors[0].id, rfqId: rfq1.id, indentId: indent1.id,
    status: "received", deliveryLocation: "Main Site Store",
    deliveryDeadline: new Date("2025-04-10"), paymentTerms: "30 days credit",
    totalAmount: "190000", gstAmount: "53200", grandTotal: "243200",
    approvedById: undefined, approvedAt: new Date("2025-04-01"),
  }).returning().then(r => r[0]);

  const [poi1a, poi1b] = await db.insert(poItemsTable).values([
    { poId: po1.id, inventoryItemId: invItems[0].id, itemName: "OPC 53 Grade Cement", unit: "bags", orderedQty: "500", receivedQty: "500", unitRate: "380", gstRate: "28", amount: "190000", gstAmount: "53200", specification: "IS:12269", hsnCode: "2523" },
  ]).returning();

  const po2 = await db.insert(purchaseOrdersTable).values({
    projectId: pid, poNumber: "PO-2025-002", poDate: new Date("2025-04-05"),
    vendorId: vendors[2].id, indentId: indent1.id,
    status: "partial", deliveryLocation: "Main Site Store",
    deliveryDeadline: new Date("2025-04-20"), paymentTerms: "Immediate",
    totalAmount: "255000", gstAmount: "12750", grandTotal: "267750",
    approvedAt: new Date("2025-04-06"),
  }).returning().then(r => r[0]);

  const [poi2a, poi2b] = await db.insert(poItemsTable).values([
    { poId: po2.id, inventoryItemId: invItems[5].id, itemName: "20mm Coarse Aggregate", unit: "cu.m", orderedQty: "150", receivedQty: "100", unitRate: "1200", gstRate: "5", amount: "180000", gstAmount: "9000", hsnCode: "2517" },
    { poId: po2.id, inventoryItemId: invItems[7].id, itemName: "Manufactured Sand (M-Sand)", unit: "cu.m", orderedQty: "80", receivedQty: "80", unitRate: "900", gstRate: "5", amount: "72000", gstAmount: "3600", hsnCode: "2505" },
  ]).returning();

  const po3 = await db.insert(purchaseOrdersTable).values({
    projectId: pid, poNumber: "PO-2025-003", poDate: new Date("2025-04-28"),
    vendorId: vendors[1].id, rfqId: rfq2.id, indentId: indent2.id,
    status: "approved", deliveryLocation: "Main Site Store",
    deliveryDeadline: new Date("2025-05-10"), paymentTerms: "15 days credit",
    totalAmount: "2030000", gstAmount: "365400", grandTotal: "2395400",
    approvedAt: new Date("2025-04-29"),
  }).returning().then(r => r[0]);

  await db.insert(poItemsTable).values([
    { poId: po3.id, inventoryItemId: invItems[2].id, itemName: "TMT Steel 12mm (Fe500D)", unit: "MT", orderedQty: "20", receivedQty: "0", unitRate: "58000", gstRate: "18", amount: "1160000", gstAmount: "208800", specification: "IS:1786 Fe500D", hsnCode: "7213" },
    { poId: po3.id, inventoryItemId: invItems[3].id, itemName: "TMT Steel 16mm (Fe500D)", unit: "MT", orderedQty: "15", receivedQty: "0", unitRate: "57800", gstRate: "18", amount: "867000", gstAmount: "156060", specification: "IS:1786 Fe500D", hsnCode: "7213" },
  ]);
  const po4 = await db.insert(purchaseOrdersTable).values({
    projectId: pid, poNumber: "PO-2025-004", poDate: new Date("2025-05-05"),
    vendorId: vendors[3].id, indentId: indent2.id,
    status: "draft", deliveryLocation: "Main Site Store",
    deliveryDeadline: new Date("2025-05-25"), paymentTerms: "Net 45 days",
    totalAmount: "345000", gstAmount: "17250", grandTotal: "362250",
  }).returning().then(r => r[0]);
  await db.insert(poItemsTable).values([
    { poId: po4.id, inventoryItemId: invItems[8].id, itemName: "Autoclaved Aerated Concrete Blocks (AAC)", unit: "cu.m", orderedQty: "150", receivedQty: "0", unitRate: "2300", gstRate: "5", amount: "345000", gstAmount: "17250", specification: "IS:2185 Pt.4", hsnCode: "6810" },
  ]);

  const po5 = await db.insert(purchaseOrdersTable).values({
    projectId: pid, poNumber: "PO-2025-005", poDate: new Date("2025-05-10"),
    vendorId: vendors[5].id,
    status: "closed", deliveryLocation: "Paint Store",
    deliveryDeadline: new Date("2025-05-15"), paymentTerms: "Immediate",
    totalAmount: "78000", gstAmount: "14040", grandTotal: "92040",
    approvedAt: new Date("2025-05-11"),
    notes: "Interior emulsion paint — 2 coats as per BOQ",
  }).returning().then(r => r[0]);
  await db.insert(poItemsTable).values([
    { poId: po5.id, inventoryItemId: invItems[14].id, itemName: "Interior Emulsion Paint (White)", unit: "ltrs", orderedQty: "600", receivedQty: "600", unitRate: "130", gstRate: "18", amount: "78000", gstAmount: "14040", hsnCode: "3209" },
  ]);
  console.log(`✅ ${5} purchase orders with items created`);

  // ── GRNs ─────────────────────────────────────────────────────────────────────
  const grn1 = await db.insert(grnsTable).values({
    projectId: pid, grnNumber: "GRN-2025-001", grnDate: new Date("2025-04-08"),
    poId: po1.id, vendorId: vendors[0].id, storeId: mainStore.id,
    vehicleNumber: "TN-09-AB-1234", dcNumber: "DC/RCC/2025/001",
    invoiceNumber: "INV/RCC/2025/001", invoiceAmount: "243200",
    status: "accepted", threeWayMatchStatus: "matched", qcHoldCount: 0,
  }).returning().then(r => r[0]);

  await db.insert(grnItemsTable).values([
    { grnId: grn1.id, poItemId: poi1a.id, inventoryItemId: invItems[0].id, itemName: "OPC 53 Grade Cement", unit: "bags", orderedQty: "500", receivedQty: "500", acceptedQty: "500", rejectedQty: "0", unitRate: "380", condition: "good", qcHold: false, batchNumber: "RC2025/04/A" },
  ]);

  const grn2 = await db.insert(grnsTable).values({
    projectId: pid, grnNumber: "GRN-2025-002", grnDate: new Date("2025-04-12"),
    poId: po2.id, vendorId: vendors[2].id, storeId: mainStore.id,
    vehicleNumber: "KA-02-CD-5678", dcNumber: "DC/KAV/2025/012",
    status: "accepted", threeWayMatchStatus: "matched", qcHoldCount: 0,
  }).returning().then(r => r[0]);

  await db.insert(grnItemsTable).values([
    { grnId: grn2.id, poItemId: poi2a.id, inventoryItemId: invItems[5].id, itemName: "20mm Coarse Aggregate", unit: "cu.m", orderedQty: "150", receivedQty: "100", acceptedQty: "100", rejectedQty: "0", unitRate: "1200", condition: "good", qcHold: false },
    { grnId: grn2.id, poItemId: poi2b.id, inventoryItemId: invItems[7].id, itemName: "Manufactured Sand (M-Sand)", unit: "cu.m", orderedQty: "80", receivedQty: "80", acceptedQty: "80", rejectedQty: "0", unitRate: "900", condition: "good", qcHold: false },
  ]);

  // QC hold GRN
  const grn3 = await db.insert(grnsTable).values({
    projectId: pid, grnNumber: "GRN-2025-003", grnDate: new Date("2025-04-18"),
    poId: po2.id, vendorId: vendors[2].id, storeId: mainStore.id,
    vehicleNumber: "KA-02-CD-9999", dcNumber: "DC/KAV/2025/018",
    status: "qc_pending", threeWayMatchStatus: "matched", qcHoldCount: 1,
  }).returning().then(r => r[0]);

  const [grnItem3] = await db.insert(grnItemsTable).values([
    { grnId: grn3.id, inventoryItemId: invItems[8].id, itemName: "Fly Ash Bricks (9x4x3)", unit: "nos", orderedQty: "10000", receivedQty: "10000", acceptedQty: "0", rejectedQty: "0", unitRate: "6.5", condition: "good", qcHold: true, remarks: "Dimension check pending" },
  ]).returning();
  console.log(`✅ ${3} GRNs with items created`);

  // ── Material Tests ────────────────────────────────────────────────────────────
  await db.insert(materialTestsTable).values([
    { projectId: pid, grnItemId: grnItem3.id, inventoryItemId: invItems[8].id, testType: "dimension_check", isCode: "IS:12894", sampleDate: new Date("2025-04-18"), testResult: "pending", unit: "mm", remarks: "Awaiting lab results" },
    { projectId: pid, inventoryItemId: invItems[0].id, testType: "cube_strength", isCode: "IS:456", sampleDate: new Date("2025-04-10"), testDate: new Date("2025-04-17"), testResult: "pass", requiredValue: "53", actualValue: "55.6", unit: "N/mm²", remarks: "28-day cube strength — pass" },
    { projectId: pid, inventoryItemId: invItems[2].id, testType: "tensile", isCode: "IS:1786", sampleDate: new Date("2025-04-05"), testDate: new Date("2025-04-12"), testResult: "pass", requiredValue: "500", actualValue: "512", unit: "N/mm²", remarks: "Tensile strength — pass" },
    { projectId: pid, inventoryItemId: invItems[5].id, testType: "sieve_analysis", isCode: "IS:383", sampleDate: new Date("2025-04-13"), testDate: new Date("2025-04-14"), testResult: "pass", remarks: "Grading within zone II" },
  ]);
  console.log("✅ Material tests created");

  // ── Stock Ledger entries (opening) ───────────────────────────────────────────
  const ledgerEntries = invItems.map(item => ({
    projectId: pid, inventoryItemId: item.id, storeId: mainStore.id,
    transactionType: "grn_receipt", entityType: "opening", entityId: "opening_balance",
    qty: item.currentStock, rate: item.avgRate,
    amount: String(parseFloat(item.currentStock) * parseFloat(item.avgRate)),
    balanceQty: item.currentStock,
    narration: `Opening balance — ${item.itemName}`,
  }));
  await db.insert(stockLedgerTable).values(ledgerEntries);
  console.log(`✅ ${ledgerEntries.length} stock ledger opening entries`);

  // ── Stock Issues ──────────────────────────────────────────────────────────────
  const issue1 = await db.insert(stockIssuesTable).values({
    projectId: pid, issueNumber: "ISS-2025-001", issueDate: new Date("2025-04-10"),
    indentId: indent1.id, storeId: mainStore.id,
    issuedToName: "Site Engineer — Rajan M", issuedToContractor: "Vignesh Civil Works",
    notes: "Foundation casting — Batch 1",
  }).returning().then(r => r[0]);

  const [ii1, ii2, ii3] = await db.insert(issueItemsTable).values([
    { issueId: issue1.id, inventoryItemId: invItems[0].id, itemName: "OPC 53 Grade Cement",      unit: "bags",  issuedQty: "120", rate: "385", amount: "46200" },
    { issueId: issue1.id, inventoryItemId: invItems[5].id, itemName: "20mm Coarse Aggregate",   unit: "cu.m",  issuedQty: "40",  rate: "1200", amount: "48000" },
    { issueId: issue1.id, inventoryItemId: invItems[7].id, itemName: "Manufactured Sand (M-Sand)", unit: "cu.m", issuedQty: "22",  rate: "900", amount: "19800" },
  ]).returning();
  console.log("✅ Stock issues created");

  // ── Wastage Logs ──────────────────────────────────────────────────────────────
  await db.insert(wastageLogsTable).values([
    { projectId: pid, inventoryItemId: invItems[0].id, storeId: mainStore.id, wasteDate: new Date("2025-04-12"), qty: "8", unit: "bags", rate: "385", amount: "3080", reasonCode: "excess_mix", description: "Concrete mix over-poured at column C-12", normQty: "10", aboveNorm: false },
    { projectId: pid, inventoryItemId: invItems[14].id, storeId: mainStore.id, wasteDate: new Date("2025-04-15"), qty: "12", unit: "sheet", rate: "1650", amount: "19800", reasonCode: "breakage", description: "Plywood damaged during de-shuttering", normQty: "5", aboveNorm: true, alertSentToPm: true },
    { projectId: pid, inventoryItemId: invItems[8].id, storeId: mainStore.id, wasteDate: new Date("2025-04-18"), qty: "250", unit: "nos", rate: "6.5", amount: "1625", reasonCode: "breakage", description: "Bricks damaged during unloading", normQty: "300", aboveNorm: false },
    { projectId: pid, inventoryItemId: invItems[15].id, storeId: mainStore.id, wasteDate: new Date("2025-04-22"), qty: "3", unit: "kg", rate: "72", amount: "216", reasonCode: "other", description: "Binding wire offcuts", normQty: "5", aboveNorm: false },
  ]);
  console.log("✅ Wastage logs created");

  // ── Rate Contracts ────────────────────────────────────────────────────────────
  await db.insert(rateContractsTable).values([
    { projectId: pid, vendorId: vendors[2].id, contractNumber: "RC-2025-001", validFrom: new Date("2025-01-01"), validTo: new Date("2025-12-31"), inventoryItemId: invItems[5].id, itemName: "20mm Coarse Aggregate", unit: "cu.m", agreedRate: "1150", gstRate: "5", maxQty: "2000", usedQty: "100", isActive: true, notes: "Annual rate contract" },
    { projectId: pid, vendorId: vendors[2].id, contractNumber: "RC-2025-002", validFrom: new Date("2025-01-01"), validTo: new Date("2025-12-31"), inventoryItemId: invItems[7].id, itemName: "Manufactured Sand (M-Sand)", unit: "cu.m", agreedRate: "880", gstRate: "5", maxQty: "3000", usedQty: "80", isActive: true },
    { projectId: pid, vendorId: vendors[0].id, contractNumber: "RC-2025-003", validFrom: new Date("2025-04-01"), validTo: new Date("2025-09-30"), inventoryItemId: invItems[0].id, itemName: "OPC 53 Grade Cement", unit: "bags", agreedRate: "375", gstRate: "28", maxQty: "5000", usedQty: "500", isActive: true, notes: "Monsoon season contract" },
  ]);
  console.log("✅ Rate contracts created");

  console.log("\n🎉 Supply chain seed completed successfully!");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
