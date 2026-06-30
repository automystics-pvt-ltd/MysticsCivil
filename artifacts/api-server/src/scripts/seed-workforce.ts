import {
  db,
  workersTable, attendanceRecordsTable, payrollPeriodsTable, payrollLinesTable,
  itpsTable, itpItemsTable, inspectionRequestsTable, inspectionChecklistsTable,
  ncrsTable, ncrActionsTable, safetyPermitsTable, hiraEntriesTable,
  jsaEntriesTable, ppeIssuesTable, incidentsTable, incidentActionsTable,
  projectsTable, vendorsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🌱 Seeding workforce / quality / safety data...");

  const [project] = await db.select().from(projectsTable).limit(1);
  if (!project) { console.error("No project found — run main seed first."); process.exit(1); }
  const pid = project.id;
  console.log(`Using project: ${project.name} (${pid})`);

  const [contractor] = await db.select().from(vendorsTable).limit(1);
  const contractorId = contractor?.id ?? null;

  // ── Workers (20) ────────────────────────────────────────────────────────────
  const workerData = [
    { name: "Rajan Kumar",      trade: "mason",        skillLevel: "skilled",        dailyRate: "650", state: "Tamil Nadu"   },
    { name: "Suresh Babu",      trade: "mason",        skillLevel: "highly_skilled",  dailyRate: "750", state: "Tamil Nadu"   },
    { name: "Murugan P",        trade: "carpenter",    skillLevel: "skilled",        dailyRate: "600", state: "Tamil Nadu"   },
    { name: "Selvam T",         trade: "carpenter",    skillLevel: "semi_skilled",    dailyRate: "500", state: "Tamil Nadu"   },
    { name: "Anbu D",           trade: "plumber",      skillLevel: "skilled",        dailyRate: "580", state: "Tamil Nadu"   },
    { name: "Vijay K",          trade: "electrician",  skillLevel: "skilled",        dailyRate: "620", state: "Kerala"       },
    { name: "Arjun R",          trade: "electrician",  skillLevel: "highly_skilled",  dailyRate: "700", state: "Kerala"       },
    { name: "Deepak S",         trade: "welder",       skillLevel: "skilled",        dailyRate: "680", state: "Maharashtra"  },
    { name: "Ramesh G",         trade: "steel_fixer",  skillLevel: "semi_skilled",    dailyRate: "520", state: "Karnataka"    },
    { name: "Prabhu M",         trade: "steel_fixer",  skillLevel: "skilled",        dailyRate: "600", state: "Karnataka"    },
    { name: "Karthik N",        trade: "painter",      skillLevel: "semi_skilled",    dailyRate: "480", state: "Tamil Nadu"   },
    { name: "Sathish V",        trade: "painter",      skillLevel: "skilled",        dailyRate: "550", state: "Tamil Nadu"   },
    { name: "Manoj P",          trade: "helper",       skillLevel: "unskilled",      dailyRate: "380", state: "Bihar"        },
    { name: "Rahul S",          trade: "helper",       skillLevel: "unskilled",      dailyRate: "380", state: "Bihar"        },
    { name: "Suresh O",         trade: "helper",       skillLevel: "unskilled",      dailyRate: "380", state: "UP"           },
    { name: "Arun O",           trade: "operator",     skillLevel: "skilled",        dailyRate: "750", state: "Tamil Nadu"   },
    { name: "Ganesh D",         trade: "driver",       skillLevel: "semi_skilled",    dailyRate: "520", state: "Tamil Nadu"   },
    { name: "Babu S",           trade: "supervisor",   skillLevel: "highly_skilled",  dailyRate: "900", state: "Tamil Nadu"   },
    { name: "Senthil R",        trade: "mason",        skillLevel: "semi_skilled",    dailyRate: "520", state: "Tamil Nadu"   },
    { name: "Pandian K",        trade: "helper",       skillLevel: "unskilled",      dailyRate: "380", state: "Tamil Nadu"   },
  ];

  const workers = [];
  for (let i = 0; i < workerData.length; i++) {
    const wd = workerData[i];
    const [w] = await db.insert(workersTable).values({
      projectId: pid, contractorId,
      workerCode: `WRK-${String(i + 1).padStart(4, "0")}`,
      name: wd.name, trade: wd.trade, skillLevel: wd.skillLevel,
      dailyRate: wd.dailyRate, otRate: String(Math.round(parseFloat(wd.dailyRate) * 1.5 / 9 * 100) / 100),
      phone: `98${String(40000001 + i)}`,
      gender: "male", state: wd.state,
      bocwRegNumber: `BOCW-TN-${String(2024000 + i)}`,
      pfNumber: `TN/CBE/${String(100 + i)}/001`,
      esiNumber: `53/02/${String(100000 + i)}`,
      bankName: "State Bank of India",
      accountNumber: `1234567${String(100 + i)}`,
      ifscCode: "SBIN0001234",
    }).returning();
    workers.push(w);
  }
  console.log(`  ✅ ${workers.length} workers created`);

  // ── Attendance (14 days × 20 workers) ────────────────────────────────────────
  const today = new Date();
  const attendanceDays = 14;
  let attCount = 0;
  for (const w of workers) {
    for (let dayOffset = 0; dayOffset < attendanceDays; dayOffset++) {
      if (dayOffset % 7 === 6) continue; // skip Sundays
      const present = Math.random() > 0.1; // 90% attendance
      if (!present) continue;
      const attDate = new Date(today);
      attDate.setDate(attDate.getDate() - (attendanceDays - dayOffset));
      attDate.setHours(8, 0, 0, 0);
      const inTime = new Date(attDate); inTime.setMinutes(Math.floor(Math.random() * 30));
      const outTime = new Date(attDate); outTime.setHours(17 + Math.floor(Math.random() * 2), 30, 0, 0);
      const hours = (outTime.getTime() - inTime.getTime()) / 3600000;
      const hoursWorked = Math.min(hours, 9);
      const overtimeHours = Math.max(0, hours - 9);
      const hasOt = overtimeHours > 0 && Math.random() > 0.5;
      await db.insert(attendanceRecordsTable).values({
        projectId: pid, workerId: w.id, attendanceDate: attDate,
        markInTime: inTime, markOutTime: outTime, withinGeofence: true,
        hoursWorked: String(Math.round(hoursWorked * 100) / 100),
        overtimeHours: String(Math.round(overtimeHours * 100) / 100),
        otApproved: hasOt,
      });
      attCount++;
    }
  }
  console.log(`  ✅ ${attCount} attendance records created`);

  // ── Payroll Period ────────────────────────────────────────────────────────────
  const fromDate = new Date(today); fromDate.setDate(1);
  const toDate = new Date(today); toDate.setDate(14);
  const [period] = await db.insert(payrollPeriodsTable).values({
    projectId: pid, periodName: "May 2026 — First Fortnight",
    periodType: "fortnightly", fromDate, toDate,
    status: "draft",
  }).returning();
  console.log(`  ✅ Payroll period created: ${period.periodName}`);

  // ── ITPs ──────────────────────────────────────────────────────────────────────
  const itpDefs = [
    {
      title: "Reinforced Concrete Column — ITP",
      items: [
        { activityDescription: "Shuttering erection and alignment check", checkPointType: "witness", acceptanceCriteria: "Plumb < 3mm, gap < 1mm", referenceCode: "IS 456:2000 Cl 10" },
        { activityDescription: "Reinforcement placement and cover check", checkPointType: "hold",    acceptanceCriteria: "Clear cover 40mm ±5mm, dia and spacing per drawing", referenceCode: "IS 456:2000 Cl 26" },
        { activityDescription: "Concrete pouring and compaction", checkPointType: "witness", acceptanceCriteria: "Slump 75-100mm, compaction with vibrator", referenceCode: "IS 456:2000 Cl 13" },
        { activityDescription: "28-day cube test result",            checkPointType: "review",   acceptanceCriteria: "Min M25 = 25 N/mm²", referenceCode: "IS 456:2000 Cl 15" },
      ],
    },
    {
      title: "Brick Masonry — ITP",
      items: [
        { activityDescription: "Material approval — brick quality", checkPointType: "hold",    acceptanceCriteria: "Water absorption < 20%, compressive strength > 3.5 N/mm²", referenceCode: "IS 1077:1992" },
        { activityDescription: "Mortar mix ratio verification",      checkPointType: "witness", acceptanceCriteria: "1:5 CM, water-cement ratio 0.45-0.50", referenceCode: "IS 2250:1981" },
        { activityDescription: "Plumb and level check at each metre", checkPointType: "witness", acceptanceCriteria: "Plumb ±5mm per 3m height, level ±3mm", referenceCode: "IS 2212:1991" },
      ],
    },
    {
      title: "Waterproofing — Terrace ITP",
      items: [
        { activityDescription: "Surface preparation and priming",     checkPointType: "hold",    acceptanceCriteria: "Dry surface, all honeycombs sealed, primer applied", referenceCode: "IS 2645:2003" },
        { activityDescription: "Membrane application — 1st coat",     checkPointType: "witness", acceptanceCriteria: "Uniform 1.2mm DFT, no blisters", referenceCode: "IS 2645:2003" },
        { activityDescription: "Flood test — 24hr water retention",   checkPointType: "hold",    acceptanceCriteria: "No leakage or seepage after 24hr", referenceCode: "IS 2645:2003" },
      ],
    },
  ];

  const itpIds = [];
  for (const def of itpDefs) {
    const [itp] = await db.insert(itpsTable).values({
      projectId: pid, title: def.title, status: "approved",
      approvedAt: new Date(), revision: "A",
    }).returning();
    for (let si = 0; si < def.items.length; si++) {
      const it = def.items[si];
      await db.insert(itpItemsTable).values({
        itpId: itp.id, sequenceNo: si + 1,
        activityDescription: it.activityDescription,
        checkPointType: it.checkPointType as any,
        acceptanceCriteria: it.acceptanceCriteria,
        referenceCode: it.referenceCode,
        responsible: "Contractor", inspector: "QC Engineer",
      });
    }
    itpIds.push(itp.id);
  }
  console.log(`  ✅ ${itpIds.length} ITPs created`);

  // ── Inspection Requests ───────────────────────────────────────────────────────
  const irDefs = [
    { irNumber: "IR-0001", status: "passed", result: "passed", location: "Column C3, Level 1" },
    { irNumber: "IR-0002", status: "failed", result: "failed", location: "Brick wall, Grid 4-5" },
    { irNumber: "IR-0003", status: "pending", result: null, location: "Terrace slab" },
  ];
  const irIds = [];
  for (const ir of irDefs) {
    const [row] = await db.insert(inspectionRequestsTable).values({
      projectId: pid, irNumber: ir.irNumber, location: ir.location,
      inspectionDate: new Date(), status: ir.status, result: ir.result,
    }).returning();
    irIds.push(row.id);
    if (ir.result) {
      await db.insert(inspectionChecklistsTable).values({
        irId: row.id, parameter: "Alignment check",
        acceptanceCriteria: "Plumb < 3mm", observed: "2.5mm",
        passed: ir.result === "passed", remarks: ir.result === "passed" ? "Acceptable" : "Exceeds tolerance",
      });
    }
  }
  console.log(`  ✅ ${irIds.length} inspection requests created`);

  // ── NCRs ──────────────────────────────────────────────────────────────────────
  const [openNcr] = await db.insert(ncrsTable).values({
    projectId: pid, ncrNumber: "NCR-0001", irId: irIds[1],
    trade: "mason", description: "Brick wall plumb exceeds tolerance at grid 4-5. Plumb deviation measured at 18mm over 3m height, tolerance is ±5mm.",
    severity: "major", rootCause: "Inadequate supervision during lay-up; no intermediate plumb checks.",
    status: "capa_submitted", reworkCost: "15000",
  }).returning();
  await db.insert(ncrActionsTable).values({
    ncrId: openNcr.id, actionType: "capa",
    description: "Hack out affected courses (3 no.) and re-lay with intermediate plumb checks every 500mm. Supervisor to be present throughout.",
    dueDate: new Date(Date.now() + 5 * 86400000),
  });

  const [criticalNcr] = await db.insert(ncrsTable).values({
    projectId: pid, ncrNumber: "NCR-0002",
    trade: "concrete", description: "7-day cube test failed for Pour-14. Average strength 14.2 N/mm² against specified M25 (min 25 N/mm²).",
    severity: "critical", rootCause: "Suspected high water-cement ratio — site staff added extra water. Slump was 150mm against max 100mm.",
    status: "open", reworkCost: "0",
  }).returning();

  const [closedNcr] = await db.insert(ncrsTable).values({
    projectId: pid, ncrNumber: "NCR-0003",
    trade: "carpenter", description: "Shuttering gaps > 5mm at beam soffit, resulted in concrete fins.",
    severity: "minor", rootCause: "Reused shuttering panels not checked for warping.",
    status: "closed", reworkCost: "8000", closedAt: new Date(),
  }).returning();
  await db.insert(ncrActionsTable).values([
    { ncrId: closedNcr.id, actionType: "capa", description: "Remove concrete fins with chisel and grinder. Apply polymer-modified mortar repair.", completedAt: new Date() },
    { ncrId: closedNcr.id, actionType: "closure", description: "Re-inspection passed. Surface finish acceptable. NCR closed.", completedAt: new Date() },
  ]);
  console.log("  ✅ 3 NCRs created (1 open, 1 critical, 1 closed)");

  // ── Safety Permits ─────────────────────────────────────────────────────────────
  const permitDefs = [
    { permitType: "hot_work",       status: "approved",  work: "Welding of MS rebar couplers at floor 2 columns" },
    { permitType: "height",         status: "active",    work: "External scaffolding erection above 6m on south face" },
    { permitType: "electrical",     status: "pending",   work: "LT panel energisation — ground floor MDB" },
    { permitType: "confined_space", status: "closed",    work: "Sump tank waterproofing work" },
    { permitType: "excavation",     status: "approved",  work: "Pile cap excavation at grid D-6, 2.5m depth" },
  ];
  for (let i = 0; i < permitDefs.length; i++) {
    const pd = permitDefs[i];
    const start = new Date(); start.setHours(8, 0, 0, 0);
    const end = new Date(); end.setHours(18, 0, 0, 0);
    await db.insert(safetyPermitsTable).values({
      projectId: pid, permitType: pd.permitType as any,
      permitNumber: `PTW-${String(i + 1).padStart(4, "0")}`,
      workDescription: pd.work, location: "Site", status: pd.status,
      startDateTime: start, endDateTime: end,
      hazards: "Fire risk, fumes, electric arc flash",
      precautions: "Fire extinguisher standby, PPE mandatory, area barricaded",
      approvedById: pd.status !== "pending" ? null : null,
      approvedAt: pd.status === "approved" || pd.status === "active" ? new Date() : null,
    });
  }
  console.log("  ✅ 5 safety permits created");

  // ── HIRA ──────────────────────────────────────────────────────────────────────
  const hiraDefs = [
    { hazard: "Falls from height during scaffolding erection", category: "Physical", likelihood: 3, severity: 5, controls: "Full body harness mandatory, scaffold inspected before use, safety net installed" },
    { hazard: "Electric shock from LT panel work",            category: "Electrical", likelihood: 2, severity: 5, controls: "Permit-to-work, LOTO procedure, rubber insulating gloves, proximity warning device" },
    { hazard: "Concrete pour — pump line bursting",           category: "Mechanical", likelihood: 2, severity: 3, controls: "Pump line pressure test before pour, safety chain on couplings, exclusion zone" },
    { hazard: "Welder's flash / eye injury",                  category: "Physical", likelihood: 4, severity: 3, controls: "Welding screen, auto-darkening helmet, welding area barricaded" },
    { hazard: "Cement dust inhalation",                       category: "Chemical", likelihood: 4, severity: 2, controls: "P2 dust mask mandatory, water spray to suppress dust, wind direction awareness" },
  ];
  for (const h of hiraDefs) {
    const riskScore = h.likelihood * h.severity;
    const riskLevel = riskScore >= 20 ? "extreme" : riskScore >= 12 ? "high" : riskScore >= 6 ? "medium" : "low";
    await db.insert(hiraEntriesTable).values({
      projectId: pid, hazardDescription: h.hazard, hazardCategory: h.category,
      likelihood: h.likelihood, severity: h.severity, riskScore, riskLevel,
      controlMeasures: h.controls,
      residualLikelihood: Math.max(1, h.likelihood - 1),
      residualSeverity: h.severity,
      residualRiskScore: Math.max(1, h.likelihood - 1) * h.severity,
    });
  }
  console.log("  ✅ 5 HIRA entries created");

  // ── PPE Issues ─────────────────────────────────────────────────────────────────
  const ppeTypes = ["helmet","vest","gloves","boots","harness"] as const;
  let ppeCount = 0;
  for (const w of workers.slice(0, 15)) {
    const typesToIssue = ppeTypes.slice(0, 2 + Math.floor(Math.random() * 4));
    for (const ppeType of typesToIssue) {
      await db.insert(ppeIssuesTable).values({
        projectId: pid, workerId: w.id, ppeType,
        issuedDate: new Date(), condition: "new",
      });
      ppeCount++;
    }
  }
  console.log(`  ✅ ${ppeCount} PPE issues created`);

  // ── Incidents ─────────────────────────────────────────────────────────────────
  const [inc1] = await db.insert(incidentsTable).values({
    projectId: pid, incidentNumber: "INC-0001",
    incidentDate: new Date(Date.now() - 3 * 86400000),
    classification: "near_miss", title: "Scaffolding plank nearly fell",
    description: "Unsecured scaffolding plank dislodged by wind at 8m height. No injury but plank fell into exclusion zone.",
    location: "South face, Level 3", rootCause: "Plank not tied; morning inspection missed.",
    immediateAction: "All planks inspected and tied. Tool-box talk held.", status: "open",
  }).returning();
  await db.insert(incidentActionsTable).values({
    incidentId: inc1.id, actionDescription: "Update scaffolding inspection checklist to include plank tie verification.",
    dueDate: new Date(Date.now() + 7 * 86400000), status: "open",
  });

  await db.insert(incidentsTable).values({
    projectId: pid, incidentNumber: "INC-0002",
    incidentDate: new Date(Date.now() - 10 * 86400000),
    classification: "first_aid", title: "Minor cut — steel bar",
    description: "Worker sustained 2cm laceration on right palm from exposed rebar end. First aid given on site.",
    location: "Column C3 area", rootCause: "Rebar ends not capped.",
    immediateAction: "Rebar caps fitted on all exposed ends. First aid provided.", status: "closed",
    closedAt: new Date(),
  });
  console.log("  ✅ 2 incidents created");

  console.log("✅ Workforce / Quality / Safety seed complete!");
}

main().catch(console.error).finally(() => process.exit(0));
