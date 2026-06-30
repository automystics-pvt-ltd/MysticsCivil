import {
  db,
  organisationsTable,
  projectsTable,
  wbsActivitiesTable,
  milestonesTable,
  dprsTable,
  dprItemsTable,
  sitePhotosTable,
  documentsTable,
  issuesTable,
  approvalsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

async function reset() {
  await db.execute(sql`
    TRUNCATE TABLE approvals, issues, documents, site_photos, dpr_items, dprs,
      milestones, wbs_activities, projects, organisations RESTART IDENTITY CASCADE;
  `);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

const photoUrls = [
  "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200",
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200",
  "https://images.unsplash.com/photo-1517089596392-fb9a9033e05b?w=1200",
  "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200",
  "https://images.unsplash.com/photo-1590725140246-20acdee442be?w=1200",
  "https://images.unsplash.com/photo-1429497419816-9ca5cfb4571a?w=1200",
  "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=1200",
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200",
];

async function seedProject(args: {
  orgId: string;
  code: string;
  name: string;
  client: string;
  location: string;
  lat: number;
  lng: number;
  contractValue: number;
  status: string;
  plannedPercent: number;
  actualPercent: number;
  costToDate: number;
  budgetToDate: number;
  cpi: number;
  spi: number;
  startOffset: number;
  durationDays: number;
  cover: string;
}) {
  const [project] = await db
    .insert(projectsTable)
    .values({
      organisationId: args.orgId,
      code: args.code,
      name: args.name,
      clientName: args.client,
      description: `${args.name} — large civil engineering scope including substructure, RCC frame, MEP, finishes.`,
      location: args.location,
      latitude: String(args.lat),
      longitude: String(args.lng),
      reraNumber: `RERA-${args.code}-2024`,
      contractValue: String(args.contractValue),
      startDate: daysAgo(args.startOffset),
      targetEndDate: daysFromNow(args.durationDays - args.startOffset),
      forecastEndDate: daysFromNow(args.durationDays - args.startOffset + 14),
      status: args.status,
      plannedPercent: String(args.plannedPercent),
      actualPercent: String(args.actualPercent),
      costToDate: String(args.costToDate),
      budgetToDate: String(args.budgetToDate),
      cpi: String(args.cpi),
      spi: String(args.spi),
      coverImageUrl: args.cover,
    })
    .returning();

  const wbsDefs = [
    { code: "1", name: "Site Mobilisation", unit: "LS", plannedQty: 1, actualQty: 1, plannedPct: 100, actualPct: 100, plannedCost: 4500000, actualCost: 4380000, status: "completed", weight: 1, days: [-args.startOffset, -args.startOffset + 14] },
    { code: "2", name: "Excavation & Earthwork", unit: "cum", plannedQty: 18500, actualQty: 17900, plannedPct: 100, actualPct: 97, plannedCost: 12500000, actualCost: 12800000, status: "completed", weight: 2, days: [-args.startOffset + 10, -args.startOffset + 45] },
    { code: "3", name: "Pile Foundations", unit: "Nos", plannedQty: 320, actualQty: 305, plannedPct: 100, actualPct: 95, plannedCost: 32000000, actualCost: 33200000, status: "completed", weight: 3, days: [-args.startOffset + 30, -args.startOffset + 85] },
    { code: "4", name: "Pile Cap & Raft RCC", unit: "cum", plannedQty: 2400, actualQty: 2250, plannedPct: 100, actualPct: 94, plannedCost: 21000000, actualCost: 21500000, status: "completed", weight: 3, days: [-args.startOffset + 60, -args.startOffset + 110] },
    { code: "5", name: "RCC Columns & Beams (Tower A)", unit: "cum", plannedQty: 3800, actualQty: 2100, plannedPct: 70, actualPct: 55, plannedCost: 48000000, actualCost: 39500000, status: args.status === "delayed" ? "delayed" : "at_risk", weight: 4, days: [-args.startOffset + 90, -args.startOffset + 220] },
    { code: "6", name: "Slab Casting L1-L8", unit: "sqm", plannedQty: 14000, actualQty: 7200, plannedPct: 60, actualPct: 51, plannedCost: 54000000, actualCost: 47000000, status: "on_track", weight: 4, days: [-args.startOffset + 120, -args.startOffset + 260] },
    { code: "7", name: "Block Work & Plastering", unit: "sqm", plannedQty: 28000, actualQty: 4500, plannedPct: 30, actualPct: 16, plannedCost: 18000000, actualCost: 4200000, status: "on_track", weight: 2, days: [-args.startOffset + 180, -args.startOffset + 320] },
    { code: "8", name: "MEP Rough-in", unit: "LS", plannedQty: 1, actualQty: 0.25, plannedPct: 25, actualPct: 22, plannedCost: 22000000, actualCost: 5400000, status: "on_track", weight: 3, days: [-args.startOffset + 200, -args.startOffset + 340] },
    { code: "9", name: "Facade & Glazing", unit: "sqm", plannedQty: 9500, actualQty: 0, plannedPct: 0, actualPct: 0, plannedCost: 38000000, actualCost: 0, status: "not_started", weight: 3, days: [-args.startOffset + 260, -args.startOffset + 380] },
    { code: "10", name: "Internal Finishes & Handover", unit: "sqm", plannedQty: 16000, actualQty: 0, plannedPct: 0, actualPct: 0, plannedCost: 28000000, actualCost: 0, status: "not_started", weight: 2, days: [-args.startOffset + 320, -args.startOffset + 420] },
  ];

  const activities = [];
  for (const [i, w] of wbsDefs.entries()) {
    const [a] = await db
      .insert(wbsActivitiesTable)
      .values({
        projectId: project.id,
        code: w.code,
        name: w.name,
        unit: w.unit,
        plannedQuantity: String(w.plannedQty),
        actualQuantity: String(w.actualQty),
        plannedStart: daysFromNow(w.days[0]),
        plannedEnd: daysFromNow(w.days[1]),
        actualStart: w.actualPct > 0 ? daysFromNow(w.days[0]) : null,
        actualEnd: w.actualPct >= 100 ? daysFromNow(w.days[1] - 2) : null,
        plannedPercent: String(w.plannedPct),
        actualPercent: String(w.actualPct),
        plannedCost: String(w.plannedCost),
        actualCost: String(w.actualCost),
        status: w.status,
        weight: String(w.weight),
        sortOrder: i,
      })
      .returning();
    activities.push(a);
  }

  const msDefs = [
    { name: "Mobilisation Complete", offset: -args.startOffset + 14, status: "completed" },
    { name: "Foundation Handover", offset: -args.startOffset + 110, status: "completed" },
    { name: "Superstructure 50%", offset: -args.startOffset + 220, status: args.status === "delayed" ? "delayed" : "at_risk" },
    { name: "Topping Out", offset: -args.startOffset + 300, status: "pending" },
    { name: "MEP Energisation", offset: -args.startOffset + 360, status: "pending" },
    { name: "Final Handover", offset: args.durationDays - args.startOffset, status: "pending" },
  ];
  for (const [i, m] of msDefs.entries()) {
    await db.insert(milestonesTable).values({
      projectId: project.id,
      name: m.name,
      description: `Contractual milestone: ${m.name}`,
      targetDate: daysFromNow(m.offset),
      forecastDate: daysFromNow(m.offset + (m.status === "at_risk" ? 21 : m.status === "delayed" ? 45 : 0)),
      actualDate: m.status === "completed" ? daysFromNow(m.offset - 3) : null,
      status: m.status,
      certificateIssued: m.status === "completed",
      sortOrder: i,
    });
  }

  for (let i = 0; i < 6; i++) {
    const [dpr] = await db
      .insert(dprsTable)
      .values({
        projectId: project.id,
        reportDate: daysAgo(i + 1),
        weather: ["Clear", "Overcast", "Light Rain", "Hot & Humid", "Clear", "Hazy"][i % 6],
        temperature: String(28 + (i % 6)),
        manpowerCount: 110 + ((i * 11) % 40),
        summary:
          `Pour completed at L${5 + (i % 4)}, slab area approx ${280 + i * 8} sqm. Steel offloaded ${22 + i} MT. ` +
          `Concrete cubes cast and labelled. QC sign-off pending for column C-14.`,
        status: i === 0 ? "submitted" : i === 1 ? "approved" : i === 2 ? "submitted" : "approved",
      })
      .returning();

    const itemActs = activities.slice(4, 7);
    for (const a of itemActs) {
      await db.insert(dprItemsTable).values({
        dprId: dpr.id,
        activityId: a.id,
        quantityToday: String(20 + (i * 7) % 40),
        cumulativeQuantity: String(0),
        remarks: "Within tolerance, slump 110mm.",
      });
    }
  }

  for (let i = 0; i < 6; i++) {
    await db.insert(sitePhotosTable).values({
      projectId: project.id,
      url: photoUrls[(i + args.code.length) % photoUrls.length],
      caption: [
        "Slab pour L6 — north wing",
        "Column reinforcement pre-pour inspection",
        "Excavation for raft foundation",
        "Tower crane erection complete",
        "Block work progress — Wing B",
        "Facade mock-up panel installed",
      ][i],
      capturedAt: daysAgo(i),
      latitude: String(args.lat + (Math.random() - 0.5) * 0.001),
      longitude: String(args.lng + (Math.random() - 0.5) * 0.001),
      tag: ["progress", "qc", "safety", "milestone", "progress", "milestone"][i],
    });
  }

  const docs = [
    { name: "GFC Structural Drawings R3", category: "Drawing" },
    { name: "BoQ Rev 2.1", category: "BoQ" },
    { name: "EHS Plan v4", category: "EHS" },
    { name: "Method Statement — Pile Cap", category: "Method Statement" },
    { name: "Concrete Mix Design M35", category: "QA/QC" },
  ];
  for (const d of docs) {
    await db.insert(documentsTable).values({
      projectId: project.id,
      name: d.name,
      category: d.category,
      url: "https://example.com/docs/" + d.name.toLowerCase().replace(/\s+/g, "-") + ".pdf",
      version: 1,
    });
  }

  const issues = [
    { title: "Water seepage at raft level B2", severity: "high", status: "open" },
    { title: "Steel bar TMT 16mm shortfall — vendor delay", severity: "medium", status: "in_progress" },
    { title: "Permit renewal for tower crane operator", severity: "critical", status: "open" },
    { title: "Curing water source contamination flagged", severity: "low", status: "resolved" },
  ];
  for (const i of issues) {
    await db.insert(issuesTable).values({
      projectId: project.id,
      title: i.title,
      description: `${i.title}. Action plan in progress, see EHS log.`,
      severity: i.severity,
      status: i.status,
      raisedAt: daysAgo(Math.floor(Math.random() * 8) + 1),
      resolvedAt: i.status === "resolved" ? daysAgo(1) : null,
    });
  }

  await db.insert(approvalsTable).values([
    {
      projectId: project.id,
      entityType: "dpr",
      entityId: "pending-1",
      title: `DPR for ${daysAgo(1).toISOString().slice(0, 10)} awaiting PM sign-off`,
      assignedToRole: "pm",
      status: "pending",
      createdAt: daysAgo(2),
    },
    {
      projectId: project.id,
      entityType: "variation_order",
      entityId: "vo-1",
      title: "Variation Order #07 — Facade revision",
      assignedToRole: "owner",
      status: "pending",
      createdAt: daysAgo(5),
    },
  ]);

  return project;
}

async function main() {
  await reset();

  const [org] = await db
    .insert(organisationsTable)
    .values({
      name: "Aravali Constructions Pvt Ltd",
      legalName: "Aravali Constructions Private Limited",
      gstin: "07AABCA1234L1Z5",
      pan: "AABCA1234L",
      address: "Plot 14, Sector 44",
      city: "Gurugram",
      state: "Haryana",
      pincode: "122003",
    })
    .returning();

  const [org2] = await db
    .insert(organisationsTable)
    .values({
      name: "Konkan Infra Builders",
      legalName: "Konkan Infra Builders LLP",
      gstin: "27AAFCK5566P1Z0",
      pan: "AAFCK5566P",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    })
    .returning();

  await seedProject({
    orgId: org.id,
    code: "DLF-OAK",
    name: "DLF Oakwood Heights — Tower A",
    client: "DLF Home Developers Ltd",
    location: "Sector 86, Gurugram, HR",
    lat: 28.4089,
    lng: 76.9854,
    contractValue: 1_280_000_000,
    status: "at_risk",
    plannedPercent: 48,
    actualPercent: 42,
    costToDate: 540_000_000,
    budgetToDate: 510_000_000,
    cpi: 0.944,
    spi: 0.875,
    startOffset: 200,
    durationDays: 540,
    cover:
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600",
  });

  await seedProject({
    orgId: org.id,
    code: "AIIMS-RAI",
    name: "AIIMS Raipur — Trauma Block Expansion",
    client: "CPWD / AIIMS Raipur",
    location: "Tatibandh, Raipur, CG",
    lat: 21.2399,
    lng: 81.5697,
    contractValue: 860_000_000,
    status: "on_track",
    plannedPercent: 62,
    actualPercent: 64,
    costToDate: 510_000_000,
    budgetToDate: 525_000_000,
    cpi: 1.029,
    spi: 1.032,
    startOffset: 280,
    durationDays: 500,
    cover:
      "https://images.unsplash.com/photo-1503387837-b154d5074bd2?w=1600",
  });

  await seedProject({
    orgId: org2.id,
    code: "MUM-MET3",
    name: "Mumbai Metro Line 3 — Station Box, Worli",
    client: "MMRCL",
    location: "Worli, Mumbai, MH",
    lat: 19.0176,
    lng: 72.8170,
    contractValue: 2_950_000_000,
    status: "delayed",
    plannedPercent: 55,
    actualPercent: 41,
    costToDate: 1_320_000_000,
    budgetToDate: 1_180_000_000,
    cpi: 0.894,
    spi: 0.745,
    startOffset: 380,
    durationDays: 720,
    cover:
      "https://images.unsplash.com/photo-1473445730015-841f29a9490b?w=1600",
  });

  console.log("Seeded 2 orgs, 3 projects, WBS, milestones, DPRs, photos, docs, issues, approvals.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
