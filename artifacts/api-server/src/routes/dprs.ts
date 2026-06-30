import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  dprsTable,
  dprItemsTable,
  wbsActivitiesTable,
  sitePhotosTable,
  usersTable,
  approvalsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeDpr, serializePhoto } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/dprs",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(dprsTable)
      .where(eq(dprsTable.projectId, req.params.projectId))
      .orderBy(desc(dprsTable.reportDate));
    res.json(rows.map(serializeDpr));
  },
);

router.post(
  "/projects/:projectId/dprs",
  requireAuth,
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.reportDate) {
      res.status(400).json({ error: "reportDate required" });
      return;
    }
    const [dpr] = await db
      .insert(dprsTable)
      .values({
        projectId: req.params.projectId,
        reportDate: new Date(b.reportDate),
        weather: b.weather,
        temperature: b.temperature !== undefined ? String(b.temperature) : undefined,
        manpowerCount: typeof b.manpowerCount === "number" ? b.manpowerCount : 0,
        summary: b.summary,
        status: "draft",
      })
      .returning();

    if (Array.isArray(b.items) && b.items.length) {
      await db.insert(dprItemsTable).values(
        b.items.map((it: any) => ({
          dprId: dpr.id,
          activityId: it.activityId,
          quantityToday: String(it.quantityToday ?? 0),
          remarks: it.remarks,
        })),
      );
    }
    res.status(201).json(serializeDpr(dpr));
  },
);

async function getDprDetail(dprId: string) {
  const [dpr] = await db.select().from(dprsTable).where(eq(dprsTable.id, dprId));
  if (!dpr) return null;

  const items = await db
    .select({
      id: dprItemsTable.id,
      dprId: dprItemsTable.dprId,
      activityId: dprItemsTable.activityId,
      activityName: wbsActivitiesTable.name,
      quantityToday: dprItemsTable.quantityToday,
      cumulativeQuantity: dprItemsTable.cumulativeQuantity,
      remarks: dprItemsTable.remarks,
    })
    .from(dprItemsTable)
    .leftJoin(wbsActivitiesTable, eq(dprItemsTable.activityId, wbsActivitiesTable.id))
    .where(eq(dprItemsTable.dprId, dprId));

  const photos = await db
    .select()
    .from(sitePhotosTable)
    .where(eq(sitePhotosTable.dprId, dprId));

  let submittedBy = null;
  if (dpr.submittedById) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, dpr.submittedById));
    submittedBy = u
      ? {
          id: u.id,
          email: u.email ?? null,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          profileImageUrl: u.profileImageUrl ?? null,
        }
      : null;
  }
  let approvedBy = null;
  if (dpr.approvedById) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, dpr.approvedById));
    approvedBy = u
      ? {
          id: u.id,
          email: u.email ?? null,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          profileImageUrl: u.profileImageUrl ?? null,
        }
      : null;
  }

  return {
    dpr: serializeDpr(dpr),
    items: items.map((it) => ({
      id: it.id,
      dprId: it.dprId,
      activityId: it.activityId,
      activityName: it.activityName ?? "—",
      quantityToday: parseFloat(String(it.quantityToday)) || 0,
      cumulativeQuantity: parseFloat(String(it.cumulativeQuantity)) || 0,
      remarks: it.remarks ?? null,
    })),
    photos: photos.map(serializePhoto),
    submittedBy,
    approvedBy,
  };
}

router.get("/dprs/:dprId", requireAuth, async (req: Request, res: Response) => {
  const detail = await getDprDetail(req.params.dprId);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

router.post("/dprs/:dprId/submit", requireAuth, async (req: Request, res: Response) => {
  const [dpr] = await db
    .update(dprsTable)
    .set({
      status: "submitted",
      submittedById: req.user!.id,
      submittedAt: new Date(),
    })
    .where(eq(dprsTable.id, req.params.dprId))
    .returning();
  if (!dpr) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.insert(approvalsTable).values({
    projectId: dpr.projectId,
    entityType: "dpr",
    entityId: dpr.id,
    title: `DPR for ${dpr.reportDate.toISOString().slice(0, 10)}`,
    requestedById: req.user!.id,
    assignedToRole: "pm",
    status: "pending",
  });
  res.json(serializeDpr(dpr));
});

router.post("/dprs/:dprId/approve", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const approve = b.approve !== false;

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(dprsTable)
        .where(eq(dprsTable.id, req.params.dprId));
      if (!existing) return { notFound: true as const };
      if (existing.status === "approved") {
        return { conflict: "DPR is already approved" as const };
      }
      if (existing.status === "draft") {
        return { conflict: "DPR must be submitted before approval" as const };
      }

      const [dpr] = await tx
        .update(dprsTable)
        .set({
          status: approve ? "approved" : "rejected",
          approvedById: req.user!.id,
          approvedAt: new Date(),
          rejectionReason: approve ? null : b.rejectionReason ?? null,
        })
        .where(eq(dprsTable.id, req.params.dprId))
        .returning();

      if (approve) {
        const items = await tx
          .select()
          .from(dprItemsTable)
          .where(eq(dprItemsTable.dprId, dpr.id));
        for (const it of items) {
          await tx
            .update(wbsActivitiesTable)
            .set({
              actualQuantity: sql`${wbsActivitiesTable.actualQuantity} + ${it.quantityToday}`,
            })
            .where(eq(wbsActivitiesTable.id, it.activityId));
        }
      }

      await tx
        .update(approvalsTable)
        .set({
          status: approve ? "approved" : "rejected",
          resolvedAt: new Date(),
        })
        .where(eq(approvalsTable.entityId, dpr.id));

      return { dpr };
    });

    if ("notFound" in result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if ("conflict" in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }
    res.json(serializeDpr(result.dpr));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Approval failed" });
  }
});

export default router;
