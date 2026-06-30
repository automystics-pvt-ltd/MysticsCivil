import { Router, type IRouter, type Request, type Response } from "express";
import { db, issuesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeIssue } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/issues",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(issuesTable)
      .where(eq(issuesTable.projectId, req.params.projectId))
      .orderBy(desc(issuesTable.raisedAt));
    res.json(rows.map(serializeIssue));
  },
);

router.post(
  "/projects/:projectId/issues",
  requireAuth,
  requireRole(...ROLE_GROUPS.SITE_WRITE),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.title) {
      res.status(400).json({ error: "title required" });
      return;
    }
    const [row] = await db
      .insert(issuesTable)
      .values({
        projectId: req.params.projectId,
        title: b.title,
        description: b.description,
        severity: b.severity ?? "medium",
        dprId: b.dprId,
        assignedToId: b.assignedToId,
        raisedById: req.user!.id,
        status: "open",
      })
      .returning();
    res.status(201).json(serializeIssue(row));
  },
);

router.patch("/issues/:issueId", requireAuth, requireRole(...ROLE_GROUPS.SITE_WRITE), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const update: Record<string, unknown> = {};
  for (const k of ["title", "description", "severity", "status", "assignedToId"]) {
    if (b[k] !== undefined) update[k] = b[k];
  }
  if (b.status === "resolved" || b.status === "closed") {
    update.resolvedAt = new Date();
  }
  const [row] = await db
    .update(issuesTable)
    .set(update as any)
    .where(eq(issuesTable.id, req.params.issueId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeIssue(row));
});

export default router;
