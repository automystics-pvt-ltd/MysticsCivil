import { Router, type IRouter, type Request, type Response } from "express";
import { db, statusHistoryTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/status-history", requireAuth, async (req: Request, res: Response) => {
  const { entityType, entityId } = req.query as Record<string, string>;
  if (!entityType || !entityId) {
    res.status(400).json({ error: "entityType and entityId are required" });
    return;
  }
  const rows = await db
    .select()
    .from(statusHistoryTable)
    .where(and(eq(statusHistoryTable.entityType, entityType), eq(statusHistoryTable.entityId, entityId)))
    .orderBy(desc(statusHistoryTable.createdAt));
  res.json(rows);
});

export default router;
