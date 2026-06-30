import { Router, type IRouter, type Request, type Response } from "express";
import { db, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

/**
 * GET /subscription-plans
 * Public catalogue of active subscription plans (no auth required for listing).
 * Used by the signup page and the Platform Admin Portal.
 */
router.get("/subscription-plans", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true))
    .orderBy(asc(subscriptionPlansTable.sortOrder));

  res.json(
    rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      priceMonthly: p.priceMonthly,
      limits: p.limits,
      features: p.features,
      sortOrder: p.sortOrder,
    })),
  );
});

/**
 * POST /subscription-plans
 * Super admin can create a new plan.
 */
router.post(
  "/subscription-plans",
  requireAuth,
  requireRole(...ROLE_GROUPS.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.slug || !body.name) {
      res.status(400).json({ error: "slug and name are required" });
      return;
    }
    const [row] = await db
      .insert(subscriptionPlansTable)
      .values({
        slug: String(body.slug),
        name: String(body.name),
        priceMonthly: body.priceMonthly != null ? String(body.priceMonthly) : "0",
        limits: body.limits ?? { maxProjects: null, maxUsers: null, maxStorageGb: null },
        features: body.features ?? {},
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();
    res.status(201).json(row);
  },
);

/**
 * PATCH /subscription-plans/:planId
 * Super admin can update a plan definition.
 */
router.patch(
  "/subscription-plans/:planId",
  requireAuth,
  requireRole(...ROLE_GROUPS.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name);
    if (body.priceMonthly !== undefined) update.priceMonthly = String(body.priceMonthly);
    if (body.limits !== undefined) update.limits = body.limits;
    if (body.features !== undefined) update.features = body.features;
    if (body.isActive !== undefined) update.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder);

    if (!Object.keys(update).length) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [row] = await db
      .update(subscriptionPlansTable)
      .set(update as any)
      .where(eq(subscriptionPlansTable.id, req.params.planId))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json(row);
  },
);

export default router;
