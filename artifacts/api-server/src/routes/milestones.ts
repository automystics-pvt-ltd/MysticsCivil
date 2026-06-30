import { Router, type IRouter, type Request, type Response } from "express";
import { db, milestonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeMilestone } from "../lib/serialize";

const router: IRouter = Router();

function parseBody(b: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["name", "description", "status"]) if (b[k] !== undefined) out[k] = b[k];
  for (const k of ["targetDate", "forecastDate", "actualDate"]) {
    if (b[k]) out[k] = new Date(b[k]);
  }
  if (typeof b.certificateIssued === "boolean") out.certificateIssued = b.certificateIssued;
  if (typeof b.sortOrder === "number") out.sortOrder = b.sortOrder;
  return out;
}

router.get(
  "/projects/:projectId/milestones",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.projectId, req.params.projectId))
      .orderBy(asc(milestonesTable.sortOrder), asc(milestonesTable.targetDate));
    res.json(rows.map(serializeMilestone));
  },
);

router.post(
  "/projects/:projectId/milestones",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.name || !b.targetDate) {
      res.status(400).json({ error: "name and targetDate required" });
      return;
    }
    const [row] = await db
      .insert(milestonesTable)
      .values({ ...(parseBody(b) as any), projectId: req.params.projectId })
      .returning();
    res.status(201).json(serializeMilestone(row));
  },
);

router.patch("/milestones/:milestoneId", requireAuth, requireRole(...ROLE_GROUPS.OWNER_PM), async (req: Request, res: Response) => {
  const [row] = await db
    .update(milestonesTable)
    .set(parseBody(req.body ?? {}) as any)
    .where(eq(milestonesTable.id, req.params.milestoneId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeMilestone(row));
});

export default router;
