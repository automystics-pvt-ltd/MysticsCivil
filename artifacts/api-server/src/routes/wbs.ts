import { Router, type IRouter, type Request, type Response } from "express";
import { db, wbsActivitiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeWbs } from "../lib/serialize";

const router: IRouter = Router();

function parseBody(b: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["parentId", "code", "name", "unit", "status"]) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  for (const k of [
    "plannedQuantity",
    "actualQuantity",
    "plannedPercent",
    "actualPercent",
    "plannedCost",
    "actualCost",
    "weight",
  ]) {
    if (b[k] !== undefined && b[k] !== null) out[k] = String(b[k]);
  }
  for (const k of ["plannedStart", "plannedEnd", "actualStart", "actualEnd"]) {
    if (b[k]) out[k] = new Date(b[k]);
  }
  if (typeof b.sortOrder === "number") out.sortOrder = b.sortOrder;
  return out;
}

router.get("/projects/:projectId/wbs", requireAuth, async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(wbsActivitiesTable)
    .where(eq(wbsActivitiesTable.projectId, req.params.projectId))
    .orderBy(asc(wbsActivitiesTable.sortOrder), asc(wbsActivitiesTable.code));
  res.json(rows.map(serializeWbs));
});

router.get("/projects/:projectId/wbs-activities", requireAuth, async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(wbsActivitiesTable)
    .where(eq(wbsActivitiesTable.projectId, req.params.projectId))
    .orderBy(asc(wbsActivitiesTable.sortOrder), asc(wbsActivitiesTable.code));
  res.json(rows.map(serializeWbs));
});

router.post(
  "/projects/:projectId/wbs",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM_QS),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.code || !b.name) {
      res.status(400).json({ error: "code and name required" });
      return;
    }
    const [row] = await db
      .insert(wbsActivitiesTable)
      .values({ ...(parseBody(b) as any), projectId: req.params.projectId })
      .returning();
    res.status(201).json(serializeWbs(row));
  },
);

router.patch("/wbs/:activityId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM_QS), async (req: Request, res: Response) => {
  const [row] = await db
    .update(wbsActivitiesTable)
    .set(parseBody(req.body ?? {}) as any)
    .where(eq(wbsActivitiesTable.id, req.params.activityId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeWbs(row));
});

router.delete("/wbs/:activityId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  await db.delete(wbsActivitiesTable).where(eq(wbsActivitiesTable.id, req.params.activityId));
  res.status(204).end();
});

export default router;
