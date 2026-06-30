import { Router, type IRouter, type Request, type Response } from "express";
import { db, sitePhotosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { serializePhoto } from "../lib/serialize";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/photos",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(sitePhotosTable)
      .where(eq(sitePhotosTable.projectId, req.params.projectId))
      .orderBy(desc(sitePhotosTable.capturedAt));
    res.json(rows.map(serializePhoto));
  },
);

router.post(
  "/projects/:projectId/photos",
  requireAuth,
  requireRole(...ROLE_GROUPS.SITE_WRITE),
  async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.url) {
      res.status(400).json({ error: "url required" });
      return;
    }
    const [row] = await db
      .insert(sitePhotosTable)
      .values({
        projectId: req.params.projectId,
        url: b.url,
        activityId: b.activityId,
        dprId: b.dprId,
        caption: b.caption,
        capturedAt: b.capturedAt ? new Date(b.capturedAt) : new Date(),
        latitude: b.latitude !== undefined ? String(b.latitude) : undefined,
        longitude: b.longitude !== undefined ? String(b.longitude) : undefined,
        tag: b.tag,
        uploadedById: req.user!.id,
      })
      .returning();
    res.status(201).json(serializePhoto(row));
  },
);

export default router;
