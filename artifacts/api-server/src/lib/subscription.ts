import type { Request, Response, NextFunction } from "express";
import { db, subscriptionPlansTable, tenantSubscriptionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getAccessCtx, isSuperAdmin } from "./access";

export interface PlanLimits {
  maxProjects: number | null;
  maxUsers: number | null;
  maxStorageGb: number | null;
}

export interface TenantPlan {
  planId: string;
  planSlug: string;
  planName: string;
  subscriptionStatus: string;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

const SUPER_ADMIN_PLAN: TenantPlan = {
  planId: "super_admin",
  planSlug: "enterprise",
  planName: "Enterprise (Super Admin)",
  subscriptionStatus: "active",
  limits: { maxProjects: null, maxUsers: null, maxStorageGb: null },
  features: {
    pre_award: true,
    custom_roles: true,
    api_access: true,
    advanced_reports: true,
    advanced_estimations: true,
  },
};

export const FREE_PLAN_FALLBACK: TenantPlan = {
  planId: "free_fallback",
  planSlug: "free",
  planName: "Free",
  subscriptionStatus: "active",
  limits: { maxProjects: 3, maxUsers: 5, maxStorageGb: 1 },
  features: {
    pre_award: false,
    custom_roles: false,
    api_access: false,
    advanced_reports: false,
    advanced_estimations: false,
  },
};

/**
 * Loads the tenant subscription plan for the authenticated user's organisation.
 * Result is cached on the request object as `req.tenantPlan`.
 * super_admin gets an uncapped virtual enterprise plan.
 * Orgs without a subscription row fall back to the free plan limits.
 */
export async function loadTenantPlan(req: Request): Promise<TenantPlan> {
  if ((req as any).tenantPlan) return (req as any).tenantPlan;

  const ctx = await getAccessCtx(req);

  if (isSuperAdmin(ctx.role)) {
    (req as any).tenantPlan = SUPER_ADMIN_PLAN;
    return SUPER_ADMIN_PLAN;
  }

  if (!ctx.organisationId) {
    (req as any).tenantPlan = FREE_PLAN_FALLBACK;
    return FREE_PLAN_FALLBACK;
  }

  const [row] = await db
    .select({
      subId: tenantSubscriptionsTable.id,
      status: tenantSubscriptionsTable.status,
      limitsOverride: tenantSubscriptionsTable.limitsOverride,
      planId: subscriptionPlansTable.id,
      planSlug: subscriptionPlansTable.slug,
      planName: subscriptionPlansTable.name,
      planLimits: subscriptionPlansTable.limits,
      planFeatures: subscriptionPlansTable.features,
    })
    .from(tenantSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(subscriptionPlansTable.id, tenantSubscriptionsTable.planId))
    .where(
      and(
        eq(tenantSubscriptionsTable.organisationId, ctx.organisationId),
        inArray(tenantSubscriptionsTable.status, ["active", "trialing"]),
      ),
    );

  if (!row) {
    (req as any).tenantPlan = FREE_PLAN_FALLBACK;
    return FREE_PLAN_FALLBACK;
  }

  const baseLimits = (row.planLimits ?? {}) as PlanLimits;
  const override = (row.limitsOverride ?? {}) as Partial<PlanLimits>;
  const mergedLimits: PlanLimits = {
    maxProjects: override.maxProjects !== undefined ? override.maxProjects : baseLimits.maxProjects ?? null,
    maxUsers: override.maxUsers !== undefined ? override.maxUsers : baseLimits.maxUsers ?? null,
    maxStorageGb: override.maxStorageGb !== undefined ? override.maxStorageGb : baseLimits.maxStorageGb ?? null,
  };

  const plan: TenantPlan = {
    planId: row.planId,
    planSlug: row.planSlug,
    planName: row.planName,
    subscriptionStatus: row.status,
    limits: mergedLimits,
    features: (row.planFeatures ?? {}) as Record<string, boolean>,
  };

  (req as any).tenantPlan = plan;
  return plan;
}

/**
 * Express middleware: loads the tenant plan and rejects the request with 403
 * if the given feature flag is not enabled on the plan.
 */
export function requirePlanFeature(flag: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const plan = await loadTenantPlan(req);
      if (!plan.features[flag]) {
        res.status(403).json({
          error: `Your current plan (${plan.planName}) does not include the "${flag}" feature. Please upgrade.`,
          code: "PLAN_FEATURE_REQUIRED",
          feature: flag,
          currentPlan: plan.planSlug,
        });
        return;
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Plan check failed" });
    }
  };
}

/**
 * Checks a numeric plan limit against a current count.
 * Returns { ok: true } or { ok: false, limit, current, message }.
 */
export function checkPlanLimit(
  plan: TenantPlan,
  limitKey: keyof PlanLimits,
  currentCount: number,
): { ok: boolean; limit: number | null; current: number; message?: string } {
  const limit = plan.limits[limitKey];
  if (limit === null) return { ok: true, limit: null, current: currentCount };
  if (currentCount >= limit) {
    return {
      ok: false,
      limit,
      current: currentCount,
      message: `Plan limit reached: ${limitKey} (${currentCount}/${limit}). Please upgrade your plan.`,
    };
  }
  return { ok: true, limit, current: currentCount };
}

declare global {
  namespace Express {
    interface Request {
      tenantPlan?: TenantPlan;
    }
  }
}
