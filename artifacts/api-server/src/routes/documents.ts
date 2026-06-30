import { Router, type IRouter, type Request, type Response } from "express";
import { db, documentsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializeDoc } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/documents",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.projectId, req.params.projectId))
      .orderBy(desc(documentsTable.createdAt));
    res.json(rows.map(serializeDoc));
  },
);

router.post(
  "/projects/:projectId/documents",
  requireAuth,
  requireRole(...ROLE_GROUPS.SITE_WRITE),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.name || !b.url) {
      res.status(400).json({ error: "name and url required" });
      return;
    }
    const [row] = await db
      .insert(documentsTable)
      .values({
        projectId: req.params.projectId,
        name: b.name,
        category: b.category,
        url: b.url,
        version: typeof b.version === "number" ? b.version : 1,
        uploadedById: req.user!.id,
      })
      .returning();
    res.status(201).json(serializeDoc(row));
  },
);

router.delete(
  "/projects/:projectId/documents/:documentId",
  requireAuth,
  requireRole(...ROLE_GROUPS.SITE_WRITE),
  async (req: Request, res: Response) => {
    const [row] = await db
      .delete(documentsTable)
      .where(
        and(
          eq(documentsTable.id, req.params.documentId),
          eq(documentsTable.projectId, req.params.projectId),
        ),
      )
      .returning();
    if (!row) { res.status(404).json({ error: "Document not found" }); return; }
    res.status(204).end();
  },
);

export default router;
