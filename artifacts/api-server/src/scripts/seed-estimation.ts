import {
  db,
  projectsTable,
  dsrRatesTable,
  estimatesTable,
  estimateCostHeadsTable,
  boqItemsTable,
  rateAnalysisComponentsTable,
  variationOrdersTable,
  workOrderEstimatesTable,
  workOrderEstimateItemsTable,
} from "@workspace/db";
import { sql, eq, asc } from "drizzle-orm";

async function resetEstimation() {
  await db.execute(sql`
    TRUNCATE TABLE work_order_estimate_items, work_order_estimates,
      variation_orders, rate_analysis_components, boq_items,
      estimate_cost_heads, estimates, dsr_rates RESTART IDENTITY CASCADE;
  `);
}

const DSR_RATES = [
  // Earthwork
  { code: "DSR-2.1.1", description: "Excavation in ordinary soil, lead upto 50m", trade: "Earthwork", unit: "cum", state: "Delhi", cityTier: "T1", rate: 185, source: "DSR" },
  { code: "DSR-2.1.2", description: "Excavation in hard rock, blasting not required", trade: "Earthwork", unit: "cum", state: "Delhi", cityTier: "T1", rate: 520, source: "DSR" },
  { code: "DSR-2.2.1", description: "Earthwork in filling and compaction in 250mm layers", trade: "Earthwork", unit: "cum", state: "Haryana", cityTier: "T2", rate: 145, source: "DSR" },
  { code: "DSR-2.3.1", description: "PCC M10 grade for levelling course", trade: "Earthwork", unit: "cum", state: "Haryana", cityTier: "T2", rate: 4850, source: "DSR" },

  // RCC
  { code: "DSR-5.1.1", description: "Providing and placing RCC M25 in raft foundation including formwork", trade: "RCC", unit: "cum", state: "Delhi", cityTier: "T1", rate: 9200, source: "DSR" },
  { code: "DSR-5.1.2", description: "Providing and placing RCC M30 in columns including formwork", trade: "RCC", unit: "cum", state: "Delhi", cityTier: "T1", rate: 11500, source: "DSR" },
  { code: "DSR-5.1.3", description: "Providing and placing RCC M30 in beams and slabs including formwork", trade: "RCC", unit: "cum", state: "Delhi", cityTier: "T1", rate: 10800, source: "DSR" },
  { code: "DSR-5.2.1", description: "Providing and placing RCC M25 in raft foundation", trade: "RCC", unit: "cum", state: "Maharashtra", cityTier: "T1", rate: 9600, source: "SSR" },
  { code: "DSR-5.2.2", description: "Providing and placing RCC M30 in columns", trade: "RCC", unit: "cum", state: "Maharashtra", cityTier: "T1", rate: 11900, source: "SSR" },
  { code: "DSR-5.2.3", description: "Providing and placing RCC M30 in beams and slabs", trade: "RCC", unit: "cum", state: "Maharashtra", cityTier: "T1", rate: 11200, source: "SSR" },
  { code: "DSR-5.3.1", description: "Steel reinforcement TMT Fe-500 supply and placing", trade: "RCC", unit: "MT", state: "Delhi", cityTier: "T1", rate: 78000, source: "Market" },
  { code: "DSR-5.3.2", description: "Steel reinforcement TMT Fe-500 supply and placing", trade: "RCC", unit: "MT", state: "Maharashtra", cityTier: "T1", rate: 80000, source: "Market" },
  { code: "DSR-5.3.3", description: "Steel reinforcement TMT Fe-500 supply and placing", trade: "RCC", unit: "MT", state: "Chhattisgarh", cityTier: "T2", rate: 76000, source: "Market" },

  // Masonry
  { code: "DSR-6.1.1", description: "Brick masonry in CM 1:6 in superstructure walls", trade: "Masonry", unit: "cum", state: "Delhi", cityTier: "T1", rate: 5800, source: "DSR" },
  { code: "DSR-6.1.2", description: "AAC block masonry 200mm thick in CM 1:4", trade: "Masonry", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 720, source: "DSR" },
  { code: "DSR-6.1.3", description: "AAC block masonry 100mm thick in CM 1:4 for partition walls", trade: "Masonry", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 480, source: "SSR" },
  { code: "DSR-6.2.1", description: "Cavity wall brick masonry for external facade", trade: "Masonry", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 1850, source: "DSR" },

  // Plaster
  { code: "DSR-7.1.1", description: "Internal plastering 12mm thick in CM 1:4", trade: "Plaster", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 185, source: "DSR" },
  { code: "DSR-7.1.2", description: "External plastering 20mm thick in CM 1:4 with chicken mesh", trade: "Plaster", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 260, source: "DSR" },
  { code: "DSR-7.2.1", description: "Gypsum plaster 10mm thick for internal walls", trade: "Plaster", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 210, source: "Market" },
  { code: "DSR-7.2.2", description: "False ceiling POP 12mm thick including finishing", trade: "Plaster", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 380, source: "DSR" },

  // Flooring
  { code: "DSR-8.1.1", description: "Vitrified tile flooring 600x600mm thickness 8mm", trade: "Flooring", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 680, source: "DSR" },
  { code: "DSR-8.1.2", description: "Marble flooring 18mm thick polished in CM 1:3", trade: "Flooring", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 1850, source: "DSR" },
  { code: "DSR-8.2.1", description: "Epoxy flooring 3mm industrial grade for basement", trade: "Flooring", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 420, source: "Market" },
  { code: "DSR-8.3.1", description: "Kota stone flooring 25mm thick in CM 1:3", trade: "Flooring", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 850, source: "DSR" },
  { code: "DSR-8.3.2", description: "Ceramic tile flooring 300x300mm for wet areas", trade: "Flooring", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 450, source: "DSR" },

  // Waterproofing
  { code: "DSR-9.1.1", description: "Waterproofing with SBR modified mortar 3 coats on raft/basement", trade: "Waterproofing", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 480, source: "DSR" },
  { code: "DSR-9.1.2", description: "Crystalline waterproofing treatment for basement walls", trade: "Waterproofing", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 620, source: "Market" },
  { code: "DSR-9.2.1", description: "Bituminous felt waterproofing 2 layers for roof", trade: "Waterproofing", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 280, source: "DSR" },
  { code: "DSR-9.2.2", description: "APP membrane 4mm thick torch applied waterproofing", trade: "Waterproofing", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 520, source: "Market" },

  // Painting
  { code: "DSR-10.1.1", description: "Exterior acrylic emulsion paint 2 coats over primer", trade: "Painting", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 95, source: "DSR" },
  { code: "DSR-10.1.2", description: "Interior OBD paint 2 coats over wall putty and primer", trade: "Painting", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 68, source: "DSR" },
  { code: "DSR-10.2.1", description: "Enamel paint on MS grills, doors and window frames", trade: "Painting", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 110, source: "DSR" },

  // Piling
  { code: "DSR-3.1.1", description: "Bored cast-in-situ RCC piles 600mm dia M30 including boring", trade: "Piling", unit: "Rm", state: "Delhi", cityTier: "T1", rate: 8500, source: "Market" },
  { code: "DSR-3.1.2", description: "Bored cast-in-situ RCC piles 800mm dia M30 including boring", trade: "Piling", unit: "Rm", state: "Maharashtra", cityTier: "T1", rate: 12000, source: "Market" },
  { code: "DSR-3.2.1", description: "Precast driven piles 300x300mm M45 including driving", trade: "Piling", unit: "Rm", state: "Haryana", cityTier: "T2", rate: 5800, source: "DSR" },
  { code: "DSR-3.3.1", description: "Pile cap in RCC M30 including formwork and reinforcement", trade: "Piling", unit: "cum", state: "Delhi", cityTier: "T1", rate: 14500, source: "DSR" },

  // MEP-Electrical
  { code: "DSR-15.1.1", description: "PVC conduit 25mm dia concealed wiring including all accessories", trade: "MEP-Electrical", unit: "Rm", state: "Delhi", cityTier: "T1", rate: 185, source: "DSR" },
  { code: "DSR-15.1.2", description: "1.5 sqmm FR copper wiring in conduits", trade: "MEP-Electrical", unit: "Rm", state: "Haryana", cityTier: "T2", rate: 42, source: "DSR" },
  { code: "DSR-15.2.1", description: "HT cable laying 11kV armoured XLPE 3x300 sqmm", trade: "MEP-Electrical", unit: "Rm", state: "Maharashtra", cityTier: "T1", rate: 1850, source: "Market" },
  { code: "DSR-15.3.1", description: "DG set 500 kVA including AMF panel and fuel tank", trade: "MEP-Electrical", unit: "Nos", state: "Delhi", cityTier: "T1", rate: 3850000, source: "Quoted" },

  // MEP-Plumbing
  { code: "DSR-16.1.1", description: "CPVC pipe 25mm dia hot & cold water supply", trade: "MEP-Plumbing", unit: "Rm", state: "Delhi", cityTier: "T1", rate: 280, source: "DSR" },
  { code: "DSR-16.1.2", description: "SWR pipe 110mm dia soil and waste drainage", trade: "MEP-Plumbing", unit: "Rm", state: "Haryana", cityTier: "T2", rate: 380, source: "DSR" },
  { code: "DSR-16.2.1", description: "Firefighting — GI pipe 100mm dia sprinkler main", trade: "MEP-Plumbing", unit: "Rm", state: "Maharashtra", cityTier: "T1", rate: 1250, source: "DSR" },
  { code: "DSR-16.3.1", description: "STP package plant 100 KLD including civil works", trade: "MEP-Plumbing", unit: "LS", state: "Delhi", cityTier: "T1", rate: 6500000, source: "Quoted" },

  // MEP-HVAC
  { code: "DSR-17.1.1", description: "Ducted AC system AHU including ductwork per TR", trade: "MEP-HVAC", unit: "TR", state: "Delhi", cityTier: "T1", rate: 28000, source: "Market" },
  { code: "DSR-17.1.2", description: "VRF system outdoor unit 10 HP including copper piping", trade: "MEP-HVAC", unit: "HP", state: "Maharashtra", cityTier: "T1", rate: 42000, source: "Quoted" },

  // Facade
  { code: "DSR-12.1.1", description: "Structural glazing unitised curtain wall system aluminium + glass", trade: "Facade", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 7800, source: "Quoted" },
  { code: "DSR-12.1.2", description: "EIFS external insulation finish system 80mm EPS", trade: "Facade", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 1850, source: "Market" },
  { code: "DSR-12.2.1", description: "Aluminium composite panel cladding 4mm ACP with subframe", trade: "Facade", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 2800, source: "Market" },

  // Structural Steel
  { code: "DSR-4.1.1", description: "Structural steel fabrication IS2062 including primer painting", trade: "Structural Steel", unit: "MT", state: "Delhi", cityTier: "T1", rate: 95000, source: "Market" },
  { code: "DSR-4.1.2", description: "Structural steel erection including bolting and grouting", trade: "Structural Steel", unit: "MT", state: "Maharashtra", cityTier: "T1", rate: 12000, source: "DSR" },

  // Roads
  { code: "DSR-14.1.1", description: "Flexible pavement WBM 75mm thick compacted", trade: "Roads", unit: "sqm", state: "Delhi", cityTier: "T1", rate: 320, source: "MoRTH" },
  { code: "DSR-14.1.2", description: "Bituminous concrete 40mm dense graded BC Grade II", trade: "Roads", unit: "sqm", state: "Haryana", cityTier: "T2", rate: 280, source: "MoRTH" },
  { code: "DSR-14.2.1", description: "Interlocking paver block 80mm thick including base", trade: "Roads", unit: "sqm", state: "Maharashtra", cityTier: "T1", rate: 380, source: "DSR" },

  // Prelims
  { code: "DSR-1.1.1", description: "Site mobilisation, offices, barricading, signboards etc", trade: "Prelims", unit: "LS", state: "Delhi", cityTier: "T1", rate: 2500000, source: "DSR" },
  { code: "DSR-1.2.1", description: "Tower crane rental (50T) per month including erection", trade: "Prelims", unit: "Month", state: "Delhi", cityTier: "T1", rate: 420000, source: "Market" },
  { code: "DSR-1.2.2", description: "Concrete pump + boom placer per month including operator", trade: "Prelims", unit: "Month", state: "Haryana", cityTier: "T2", rate: 185000, source: "Market" },
  { code: "DSR-1.3.1", description: "Safety consumables — helmets, harnesses, nets per month", trade: "Prelims", unit: "Month", state: "Maharashtra", cityTier: "T1", rate: 85000, source: "Market" },
];

async function seedDsrRates() {
  const rows = await db.insert(dsrRatesTable).values(
    DSR_RATES.map(r => ({
      code: r.code,
      description: r.description,
      trade: r.trade,
      unit: r.unit,
      state: r.state,
      cityTier: r.cityTier,
      rate: String(r.rate),
      effectiveYear: 2024,
      source: r.source,
    }))
  ).returning({ id: dsrRatesTable.id, code: dsrRatesTable.code });
  console.log(`  Seeded ${rows.length} DSR/SSR rates`);
  return rows;
}

async function seedProjectEstimation(project: { id: string; name: string; contractValue: number }) {
  const cv = project.contractValue;

  const L0_HEADS_PCT = [40, 35, 15, 10];
  const L0_HEADS = ["Civil & Structure", "Finishing & MEP", "Prelims & Fees", "Contingency"];

  const [l0] = await db.insert(estimatesTable).values({
    projectId: project.id,
    level: "L0",
    name: `${project.name.split("—")[0].trim()} — L0 Concept Estimate`,
    status: "approved",
    totalAmount: String(cv * 0.95),
    notes: "Concept estimate based on benchmarked rates from comparable projects",
    metadata: {
      projectType: "Residential/Institutional",
      cityTier: "T1",
      builtUpArea: Math.round(cv / 22000),
      floors: 18,
    },
  }).returning();

  const [l1] = await db.insert(estimatesTable).values({
    projectId: project.id,
    level: "L1",
    name: `${project.name.split("—")[0].trim()} — L1 Preliminary Cost Plan`,
    status: "approved",
    totalAmount: String(cv),
    notes: "Preliminary cost plan apportioned across 10 standard cost heads",
  }).returning();

  const L1_HEADS = [
    { code: "CIV", name: "Civil Works", pct: 35 },
    { code: "FIN", name: "Finishing", pct: 18 },
    { code: "MEP", name: "MEP Services", pct: 15 },
    { code: "EXT", name: "External Development", pct: 5 },
    { code: "PRE", name: "Preliminaries", pct: 7 },
    { code: "FEE", name: "Professional Fees", pct: 4 },
    { code: "STA", name: "Statutory Charges", pct: 3 },
    { code: "IDC", name: "Interest During Construction", pct: 4 },
    { code: "CON", name: "Contingency", pct: 5 },
    { code: "GST", name: "GST", pct: 4 },
  ];
  await db.insert(estimateCostHeadsTable).values(
    L1_HEADS.map((h, i) => ({
      estimateId: l1.id,
      headCode: h.code,
      headName: h.name,
      percentage: String(h.pct),
      amount: String(cv * h.pct / 100),
      sortOrder: i,
    }))
  );

  // ── L2 Abstract Estimate ──────────────────────────────────────
  const [l2] = await db.insert(estimatesTable).values({
    projectId: project.id,
    level: "L2",
    name: `${project.name.split("—")[0].trim()} — L2 Abstract Estimate`,
    status: "approved",
    totalAmount: String(cv * 0.90),
    notes: "Trade-wise abstract estimate using DSR/SSR benchmark rates — approved pre-tender",
  }).returning();

  const L2_ITEMS = [
    { trade: "Earthwork", desc: "Earthwork and site preparation — DSR benchmark", unit: "sqm", qty: 18000, rate: 320 },
    { trade: "Piling", desc: "Piling works — bored cast-in-situ — DSR benchmark", unit: "sqm", qty: 18000, rate: 1850 },
    { trade: "RCC", desc: "RCC structural works incl. formwork — DSR benchmark", unit: "sqm", qty: 18000, rate: 4800 },
    { trade: "Masonry", desc: "Masonry and blockwork — DSR benchmark", unit: "sqm", qty: 18000, rate: 680 },
    { trade: "Waterproofing", desc: "Waterproofing and tanking works — DSR benchmark", unit: "sqm", qty: 18000, rate: 420 },
    { trade: "MEP-Electrical", desc: "Electrical and ELV services — DSR benchmark", unit: "sqm", qty: 18000, rate: 2100 },
    { trade: "MEP-Plumbing", desc: "Plumbing, drainage and fire-fighting — DSR benchmark", unit: "sqm", qty: 18000, rate: 1400 },
    { trade: "Finishing & MEP", desc: "Finishing, fixtures and fittings — DSR benchmark", unit: "sqm", qty: 18000, rate: 3200 },
    { trade: "Prelims", desc: "Preliminaries, site establishment and overheads — DSR benchmark", unit: "sqm", qty: 18000, rate: 1100 },
  ];
  await db.insert(boqItemsTable).values(
    L2_ITEMS.map((item, i) => ({
      estimateId: l2.id,
      projectId: project.id,
      levelType: "L2",
      trade: item.trade,
      description: item.desc,
      unit: item.unit,
      quantity: String(item.qty),
      rate: String(item.rate),
      amount: String(item.qty * item.rate),
      actualQuantity: "0",
      actualAmount: "0",
      gstRate: "18",
      sortOrder: i,
    }))
  );

  // ── L3 Detailed BOQ ───────────────────────────────────────────
  const [l3] = await db.insert(estimatesTable).values({
    projectId: project.id,
    level: "L3",
    name: `${project.name.split("—")[0].trim()} — L3 Detailed BOQ Rev 1`,
    status: "locked",
    totalAmount: String(cv * 0.82),
    notes: "Detailed BOQ for civil and structural works — Rev 1 locked post-award",
  }).returning();

  const civilValue = cv * 0.35;
  const BOQ_ITEMS = [
    { trade: "Earthwork", itemCode: "E-01", desc: "Excavation in ordinary/hard soil including shoring, dewatering and disposal", unit: "cum", qty: 18500, rate: 185, levelType: "L3", gst: 18 },
    { trade: "Earthwork", itemCode: "E-02", desc: "Earthwork filling and compaction below ground floor slab in layers", unit: "cum", qty: 4200, rate: 145, levelType: "L3", gst: 18 },
    { trade: "Piling", itemCode: "P-01", desc: "Bored cast-in-situ RCC piles 600mm dia M30 including boring, concreting and testing", unit: "Rm", qty: 6240, rate: 8500, levelType: "L3", gst: 12 },
    { trade: "Piling", itemCode: "P-02", desc: "Pile cap in RCC M30 including formwork, reinforcement and blinding", unit: "cum", qty: 1850, rate: 14500, levelType: "L3", gst: 12 },
    { trade: "RCC", itemCode: "R-01", desc: "RCC M30 in raft foundation including formwork, reinforcement and curing", unit: "cum", qty: 2400, rate: 9200, levelType: "L3", gst: 12 },
    { trade: "RCC", itemCode: "R-02", desc: "RCC M30 in columns and shear walls including formwork and reinforcement", unit: "cum", qty: 3800, rate: 11500, levelType: "L3", gst: 12 },
    { trade: "RCC", itemCode: "R-03", desc: "RCC M30 in beams, slabs and staircases including formwork and reinforcement", unit: "cum", qty: 6200, rate: 10800, levelType: "L3", gst: 12 },
    { trade: "RCC", itemCode: "R-04", desc: "Steel reinforcement TMT Fe-500 supply, cutting, bending and placing", unit: "MT", qty: 1850, rate: 78000, levelType: "L3", gst: 18 },
    { trade: "Masonry", itemCode: "M-01", desc: "AAC block masonry 200mm thick in CM 1:4 for external walls", unit: "sqm", qty: 14500, rate: 720, levelType: "L3", gst: 5 },
    { trade: "Masonry", itemCode: "M-02", desc: "AAC block masonry 100mm thick in CM 1:4 for internal partitions", unit: "sqm", qty: 8200, rate: 480, levelType: "L3", gst: 5 },
    { trade: "Waterproofing", itemCode: "W-01", desc: "SBR modified mortar waterproofing 3 coats for basement walls and raft", unit: "sqm", qty: 6800, rate: 480, levelType: "L3", gst: 18 },
    { trade: "Waterproofing", itemCode: "W-02", desc: "APP membrane 4mm torch applied for roof waterproofing with protection screed", unit: "sqm", qty: 4200, rate: 520, levelType: "L3", gst: 18 },
  ];

  for (const [i, item] of BOQ_ITEMS.entries()) {
    const actualQty = item.qty * (0.8 + Math.random() * 0.35);
    const actualRate = item.rate * (0.9 + Math.random() * 0.3);
    await db.insert(boqItemsTable).values({
      estimateId: l3.id,
      projectId: project.id,
      trade: item.trade,
      itemCode: item.itemCode,
      description: item.desc,
      unit: item.unit,
      quantity: String(item.qty),
      rate: String(item.rate),
      amount: String(item.qty * item.rate),
      actualQuantity: String(Math.round(actualQty * 10) / 10),
      actualAmount: String(Math.round(actualQty * actualRate)),
      hsnCode: item.gst === 18 ? "9954" : "9954",
      gstRate: String(item.gst),
      levelType: item.levelType,
      locked: true,
      sortOrder: i,
    });
  }

  // ── L4 Rate Analysis Estimate ─────────────────────────────────
  const [l4] = await db.insert(estimatesTable).values({
    projectId: project.id,
    level: "L4",
    name: `${project.name.split("—")[0].trim()} — L4 Rate Analysis`,
    status: "approved",
    totalAmount: String(cv * 0.85),
    notes: "Detailed rate analysis for key civil and structural items — DSR-based breakdown",
  }).returning();

  const L4_ITEMS = [
    { trade: "RCC", itemCode: "RA-01", desc: "RCC M30 in columns and shear walls incl. formwork and reinforcement — detailed rate analysis", unit: "cum", qty: 100, rate: 11500, gst: 12 },
    { trade: "Piling", itemCode: "RA-02", desc: "Bored cast-in-situ RCC piles 600mm dia M30 incl. boring, concreting and testing — detailed rate analysis", unit: "Rm", qty: 100, rate: 8500, gst: 12 },
    { trade: "Masonry", itemCode: "RA-03", desc: "AAC block masonry 200mm thick in CM 1:4 for external walls — detailed rate analysis", unit: "sqm", qty: 200, rate: 720, gst: 5 },
  ];
  const l4Items: { id: string }[] = [];
  for (const [i, item] of L4_ITEMS.entries()) {
    const [l4Item] = await db.insert(boqItemsTable).values({
      estimateId: l4.id,
      projectId: project.id,
      levelType: "L3",
      trade: item.trade,
      itemCode: item.itemCode,
      description: item.desc,
      unit: item.unit,
      quantity: String(item.qty),
      rate: String(item.rate),
      amount: String(item.qty * item.rate),
      actualQuantity: "0",
      actualAmount: "0",
      gstRate: String(item.gst),
      sortOrder: i,
    }).returning({ id: boqItemsTable.id });
    l4Items.push(l4Item);
  }
  // Rate analysis components for the first L4 BOQ item (RCC columns)
  if (l4Items.length > 0) {
    await db.insert(rateAnalysisComponentsTable).values([
      { boqItemId: l4Items[0].id, componentType: "material", description: "RMC M30 ready-mix concrete (supply, pouring and curing)", unit: "cum", quantity: "1.03", marketRate: "6200", dsrRate: "5800" },
      { boqItemId: l4Items[0].id, componentType: "material", description: "Steel formwork hire and erection (columns, walls)", unit: "sqm", quantity: "4.50", marketRate: "185", dsrRate: "165" },
      { boqItemId: l4Items[0].id, componentType: "labour", description: "Labour — concrete placing, vibrating and finishing gang", unit: "cum", quantity: "1.00", marketRate: "1800", dsrRate: "1600" },
      { boqItemId: l4Items[0].id, componentType: "plant", description: "Tower crane, concrete pump and vibrator hire", unit: "cum", quantity: "1.00", marketRate: "950", dsrRate: "900" },
      { boqItemId: l4Items[0].id, componentType: "overhead", description: "Contractor overhead, profit and supervision (15%)", unit: "LS", quantity: "1.00", marketRate: "1350", dsrRate: "1250" },
    ]);
  }

  // ── L5 Work Order Estimates ───────────────────────────────────
  const boqRows = await db
    .select()
    .from(boqItemsTable)
    .where(eq(boqItemsTable.estimateId, l3.id))
    .orderBy(asc(boqItemsTable.sortOrder));

  const rccItems = boqRows.filter(i => i.trade === "RCC");
  const pilingItems = boqRows.filter(i => i.trade === "Piling");

  const [wo1] = await db.insert(workOrderEstimatesTable).values({
    projectId: project.id,
    l3EstimateId: l3.id,
    subcontractor: "Shree Balaji Construction Pvt Ltd",
    workPackage: "RCC Civil Works — Basement to Terrace",
    status: "awarded",
    notes: "Back-to-back sub-contract for all RCC items at 5% saving vs BOQ",
  }).returning();

  if (rccItems.length > 0) {
    await db.insert(workOrderEstimateItemsTable).values(
      rccItems.map((item, i) => {
        const boqRate = Number(item.rate);
        const negotiatedRate = boqRate * 0.95;
        const qty = Number(item.quantity);
        return {
          workOrderEstimateId: wo1.id,
          boqItemId: item.id,
          description: item.description,
          unit: item.unit,
          quantity: String(qty),
          boqRate: String(boqRate),
          negotiatedRate: String(Math.round(negotiatedRate)),
          negotiatedAmount: String(Math.round(qty * negotiatedRate)),
          sortOrder: i,
        };
      })
    );
    const totalBoq = rccItems.reduce((s, i) => s + Number(i.quantity) * Number(i.rate), 0);
    await db.update(workOrderEstimatesTable).set({
      totalBoqAmount: String(Math.round(totalBoq)),
      totalNegotiatedAmount: String(Math.round(totalBoq * 0.95)),
    }).where(eq(workOrderEstimatesTable.id, wo1.id));
  }

  const [wo2] = await db.insert(workOrderEstimatesTable).values({
    projectId: project.id,
    l3EstimateId: l3.id,
    subcontractor: "Franki Foundations India Ltd",
    workPackage: "Piling Works — Bored Cast-in-situ Piles",
    status: "draft",
    notes: "Specialist piling contractor — quotes under negotiation",
  }).returning();

  if (pilingItems.length > 0) {
    await db.insert(workOrderEstimateItemsTable).values(
      pilingItems.map((item, i) => {
        const boqRate = Number(item.rate);
        const negotiatedRate = boqRate * 0.92;
        const qty = Number(item.quantity);
        return {
          workOrderEstimateId: wo2.id,
          boqItemId: item.id,
          description: item.description,
          unit: item.unit,
          quantity: String(qty),
          boqRate: String(boqRate),
          negotiatedRate: String(Math.round(negotiatedRate)),
          negotiatedAmount: String(Math.round(qty * negotiatedRate)),
          sortOrder: i,
        };
      })
    );
    const totalBoq = pilingItems.reduce((s, i) => s + Number(i.quantity) * Number(i.rate), 0);
    await db.update(workOrderEstimatesTable).set({
      totalBoqAmount: String(Math.round(totalBoq)),
      totalNegotiatedAmount: String(Math.round(totalBoq * 0.92)),
    }).where(eq(workOrderEstimatesTable.id, wo2.id));
  }

  // ── Variation Orders ──────────────────────────────────────────
  await db.insert(variationOrdersTable).values([
    {
      projectId: project.id,
      estimateId: l3.id,
      voNumber: "VO-001",
      title: "Foundation depth increase — bedrock deeper than anticipated",
      description: "Borehole data revealed bedrock 1.5m deeper than design assumption. Pile lengths increased from 16m to 17.5m.",
      scopeChange: "600mm dia piles: length increased from 16m to 17.5m. Additional 1.5 Rm × 320 nos = 480 Rm extra",
      costImpact: String(480 * 8500),
      programmeImpactDays: 12,
      status: "approved",
      approvedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
    {
      projectId: project.id,
      estimateId: l3.id,
      voNumber: "VO-002",
      title: "Slab thickness upgrade from 200mm to 220mm — structural review",
      description: "Structural engineer revised slab thickness following load recalculation for revised floor plan.",
      scopeChange: "All 18 floor slabs: 200mm → 220mm. Additional 10% concrete volume",
      costImpact: String(6200 * 0.10 * 10800),
      programmeImpactDays: 0,
      status: "submitted",
    },
    {
      projectId: project.id,
      voNumber: "VO-003",
      title: "Client-requested floor plan modification — Tower A, L4-L8",
      description: "Client instructed deletion of internal partitions on levels 4-8 and replacement with sliding glass doors.",
      scopeChange: "Delete 1,200 sqm of 100mm blockwork. Add 320 Rm of aluminium sliding glass partition.",
      costImpact: String(-1200 * 480 + 320 * 4200),
      programmeImpactDays: 5,
      status: "draft",
    },
  ]);

  return { l0, l1, l2, l3, l4 };
}

async function main() {
  await resetEstimation();
  console.log("Seeding DSR/SSR rates…");
  await seedDsrRates();

  console.log("Fetching seeded projects…");
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name, contractValue: projectsTable.contractValue }).from(projectsTable);

  if (projects.length === 0) {
    console.log("No projects found — run the main seed first: pnpm --filter @workspace/api-server run seed");
    process.exit(1);
  }

  for (const project of projects) {
    console.log(`  Seeding estimation for: ${project.name}…`);
    await seedProjectEstimation({ id: project.id, name: project.name, contractValue: Number(project.contractValue) });
  }

  console.log(`✓ Phase 2 seed complete: ${DSR_RATES.length} DSR rates + estimates + BOQ for ${projects.length} projects.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
