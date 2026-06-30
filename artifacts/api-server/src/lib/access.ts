import type { Request, Response, NextFunction } from "express";
import {
  db,
  projectsTable,
  projectAccessTable,
  organisationsTable,
  userProfilesTable,
  customRolesTable,
  MODULES,
  type ModuleKey,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { loadRole } from "../middlewares/requireAuth";
import { effectiveCaps, type Capability } from "./capabilities";

// Roles that bypass per-project access checks (see every project in their org).
// super_admin bypasses both project access AND org scoping (cross-org visibility).
export const PROJECT_ACCESS_BYPASS_ROLES = new Set(["super_admin", "admin", "owner"]);
export const SUPER_ADMIN_ROLE = "super_admin";
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === SUPER_ADMIN_ROLE;
}

// Map first path segment after /projects/:projectId/<segment> to a module key.
// Segments not in the map (e.g. "modules", "access", "dashboard", "site-location")
// are not gated by module enable/disable.
export const PROJECT_SUBPATH_MODULE: Record<string, ModuleKey> = {
  wbs: "wbs",
  milestones: "milestones",
  dprs: "dprs",
  photos: "photos",
  documents: "documents",
  issues: "quality",
  approvals: "approvals",
  estimates: "estimation",
  "boq-vs-actual": "boq",
  "work-orders": "estimation",
  "variation-orders": "variation_orders",
  "contractor-bills": "financial",
  "client-invoices": "financial",
  "ledger-accounts": "financial",
  "ledger-entries": "financial",
  "payment-analytics": "financial",
  "tds-register": "financial",
  "gst-register": "financial",
  "retention-ledger": "financial",
  "advance-ledger": "financial",
  "financial-summary": "financial",
  "aging-report": "financial",
  avl: "supply_chain",
  stores: "supply_chain",
  inventory: "supply_chain",
  "stock-ledger": "supply_chain",
  "material-indents": "supply_chain",
  rfqs: "supply_chain",
  "purchase-orders": "supply_chain",
  grns: "supply_chain",
  "material-tests": "quality",
  "stock-issues": "supply_chain",
  "wastage-logs": "supply_chain",
  "rate-contracts": "supply_chain",
  "inventory-summary": "supply_chain",
  reconciliation: "supply_chain",
  workers: "workforce",
  attendance: "workforce",
  "payroll-periods": "workforce",
  "labour-contractor-bills": "workforce",
  "quality-tests": "quality",
  itps: "quality",
  "inspection-requests": "quality",
  ncrs: "quality",
  "safety-permits": "safety",
  hira: "safety",
  jsa: "safety",
  "ppe-issues": "safety",
  incidents: "safety",
  "safety-dashboard": "safety",
  "notification-settings": "safety",
};

export function isValidModule(k: unknown): k is ModuleKey {
  return typeof k === "string" && (MODULES as readonly string[]).includes(k);
}

export function sanitizeModuleList(input: unknown): ModuleKey[] | null {
  if (input === null) return null;
  if (!Array.isArray(input)) return null;
  const out: ModuleKey[] = [];
  for (const k of input) if (isValidModule(k) && !out.includes(k)) out.push(k);
  return out;
}

// Effective module set for a project: project override (if set) intersected with org enabled.
// null on either side means "all modules" at that level.
export function getEffectiveModules(
  orgEnabled: unknown,
  projOverride: unknown,
): ModuleKey[] {
  const all = [...MODULES] as ModuleKey[];
  const org = Array.isArray(orgEnabled)
    ? (orgEnabled.filter(isValidModule) as ModuleKey[])
    : all;
  if (projOverride === null || projOverride === undefined) return org;
  if (!Array.isArray(projOverride)) return org;
  const proj = projOverride.filter(isValidModule) as ModuleKey[];
  return org.filter((m) => proj.includes(m));
}

export interface AccessContext {
  userId: string;
  role: string | null;
  organisationId: string | null;
  customRoleId: string | null;
  customPermissions: string[];
}

async function loadContext(req: Request): Promise<AccessContext> {
  const userId = req.user!.id;
  const role = req.userRole ?? (await loadRole(userId));
  req.userRole = role ?? undefined;
  const [profile] = await db
    .select({
      organisationId: userProfilesTable.organisationId,
      customRoleId: userProfilesTable.customRoleId,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  let customPermissions: string[] = [];
  if (profile?.customRoleId) {
    const [cr] = await db
      .select({ permissions: customRolesTable.permissions })
      .from(customRolesTable)
      .where(eq(customRolesTable.id, profile.customRoleId));
    if (Array.isArray(cr?.permissions)) customPermissions = cr.permissions;
  }
  return {
    userId,
    role,
    organisationId: profile?.organisationId ?? null,
    customRoleId: profile?.customRoleId ?? null,
    customPermissions,
  };
}

/** True if the user's effective capability set (builtin preset ∪ custom role) includes `cap`. */
export function hasCapability(ctx: AccessContext, cap: Capability): boolean {
  return effectiveCaps(ctx.role, ctx.customPermissions).has(cap);
}

/** Express middleware: 403 unless caller has `cap`. */
export function requireCapability(cap: Capability) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const ctx = await getAccessCtx(req);
      if (!hasCapability(ctx, cap)) {
        res.status(403).json({ error: `Forbidden — capability required: ${cap}` });
        return;
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Capability check failed" });
    }
  };
}

// Returns the list of project ids the user can see.
// admin/owner: all projects in their org (or all projects if no org bound).
// others: only projects with a project_access row.
export async function getAccessibleProjectIds(ctx: AccessContext): Promise<string[]> {
  // super_admin: every project, regardless of org binding.
  if (isSuperAdmin(ctx.role)) {
    const rows = await db.select({ id: projectsTable.id }).from(projectsTable);
    return rows.map((r) => r.id);
  }
  if (ctx.role && PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role)) {
    const rows = ctx.organisationId
      ? await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.organisationId, ctx.organisationId))
      : await db.select({ id: projectsTable.id }).from(projectsTable);
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ id: projectAccessTable.projectId })
    .from(projectAccessTable)
    .where(eq(projectAccessTable.userId, ctx.userId));
  return rows.map((r) => r.id);
}

// Returns true if `moduleKey` is enabled for the given project (effective = org ∩ override).
export async function projectModuleEnabled(
  projectId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const [row] = await db
    .select({
      override: projectsTable.enabledModulesOverride,
      orgEnabled: organisationsTable.enabledModules,
    })
    .from(projectsTable)
    .leftJoin(organisationsTable, eq(organisationsTable.id, projectsTable.organisationId))
    .where(eq(projectsTable.id, projectId));
  if (!row) return false;
  const eff = getEffectiveModules(row.orgEnabled, row.override);
  return eff.includes(moduleKey);
}

export async function userCanSeeProject(ctx: AccessContext, projectId: string): Promise<boolean> {
  // super_admin sees every project globally.
  if (isSuperAdmin(ctx.role)) return true;
  if (ctx.role && PROJECT_ACCESS_BYPASS_ROLES.has(ctx.role)) {
    if (!ctx.organisationId) return true;
    const [p] = await db
      .select({ organisationId: projectsTable.organisationId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    return !!p && p.organisationId === ctx.organisationId;
  }
  const [row] = await db
    .select({ id: projectAccessTable.id })
    .from(projectAccessTable)
    .where(
      and(eq(projectAccessTable.projectId, projectId), eq(projectAccessTable.userId, ctx.userId)),
    );
  return !!row;
}

// Express middleware factory — protects routes that contain :projectId in the path.
// Returns 401/403/404 as appropriate. Loads context once per request and caches on req.
export function requireProjectAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const projectId = req.params.projectId;
    if (!projectId) {
      next();
      return;
    }
    try {
      const ctx = (req.accessCtx ??= await loadContext(req));
      const ok = await userCanSeeProject(ctx, projectId);
      if (!ok) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      // Module gating: derive sub-segment from URL and reject if disabled.
      const m = req.path.match(/^\/projects\/[^/?]+\/([^/?]+)/);
      const segment = m?.[1];
      // Always allow these — they are part of access/module administration itself.
      const ADMIN_SEGMENTS = new Set(["modules", "access", "dashboard"]);
      if (segment && !ADMIN_SEGMENTS.has(segment)) {
        const moduleKey = PROJECT_SUBPATH_MODULE[segment];
        if (moduleKey) {
          const enabled = await projectModuleEnabled(projectId, moduleKey);
          if (!enabled) {
            res.status(404).json({ error: "Module disabled for this project" });
            return;
          }
        }
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Access check failed" });
    }
  };
}

// Loads (and caches) the access context for the current request.
export async function getAccessCtx(req: Request): Promise<AccessContext> {
  if (req.accessCtx) return req.accessCtx;
  req.accessCtx = await loadContext(req);
  return req.accessCtx;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      accessCtx?: AccessContext;
    }
  }
}
