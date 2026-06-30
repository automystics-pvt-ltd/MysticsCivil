import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  userProfilesTable,
  organisationsTable,
  projectsTable,
  projectAccessTable,
  customRolesTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, loadRole } from "../middlewares/requireAuth";
import { isSuperAdmin } from "../lib/access";

const router: IRouter = Router();

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ASSIGNABLE_ROLES = [
  "super_admin",
  "admin",
  "owner",
  "pm",
  "site_engineer",
  "qs",
  "finance",
  "contractor",
  "qc",
  "store",
  "hr",
] as const;

type AdminCtx = {
  userId: string;
  role: string | null;
  organisationId: string | null;
  isSuper: boolean;
};

async function loadAdminCtx(req: Request): Promise<AdminCtx> {
  const userId = req.user!.id;
  const role = req.userRole ?? (await loadRole(userId));
  req.userRole = role ?? undefined;
  const [profile] = await db
    .select({ organisationId: userProfilesTable.organisationId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  return {
    userId,
    role,
    organisationId: profile?.organisationId ?? null,
    isSuper: isSuperAdmin(role),
  };
}

function requireAdminOrSuper(ctx: AdminCtx, res: Response): boolean {
  if (ctx.isSuper) return true;
  if (ctx.role === "admin") return true;
  res.status(403).json({ error: "Forbidden — admin access required" });
  return false;
}

function requireSuper(ctx: AdminCtx, res: Response): boolean {
  if (ctx.isSuper) return true;
  res.status(403).json({ error: "Forbidden — super admin access required" });
  return false;
}

// ─── Users ──────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;

  const baseSelect = {
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    role: userProfilesTable.role,
    organisationId: userProfilesTable.organisationId,
    organisationName: organisationsTable.name,
    customRoleId: userProfilesTable.customRoleId,
    customRoleName: customRolesTable.name,
    createdAt: usersTable.createdAt,
  };

  const rows = ctx.isSuper
    ? await db
        .select(baseSelect)
        .from(usersTable)
        .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
        .leftJoin(organisationsTable, eq(organisationsTable.id, userProfilesTable.organisationId))
        .leftJoin(customRolesTable, eq(customRolesTable.id, userProfilesTable.customRoleId))
    : await db
        .select(baseSelect)
        .from(usersTable)
        .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
        .leftJoin(organisationsTable, eq(organisationsTable.id, userProfilesTable.organisationId))
        .leftJoin(customRolesTable, eq(customRolesTable.id, userProfilesTable.customRoleId))
        .where(eq(userProfilesTable.organisationId, ctx.organisationId ?? "__none__"));

  res.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      role: r.role,
      organisationId: r.organisationId,
      organisationName: r.organisationName,
      customRoleId: r.customRoleId,
      customRoleName: r.customRoleName,
      createdAt: r.createdAt?.toISOString() ?? null,
    })),
  );
});

router.post("/admin/users", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;
  const b = req.body ?? {};
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const firstName = b.firstName ? String(b.firstName).trim() : null;
  const lastName = b.lastName ? String(b.lastName).trim() : null;
  const role = String(b.role ?? "");
  const organisationId = b.organisationId ? String(b.organisationId) : null;

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  if (!ctx.isSuper && role === "super_admin") {
    res.status(403).json({ error: "Only super admin can create super_admin users" });
    return;
  }
  if (!ctx.isSuper) {
    // Admin can only create within their own org.
    if (!organisationId || organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Admin can only create users within their own organisation" });
      return;
    }
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, firstName, lastName })
    .returning();
  await db.insert(userProfilesTable).values({
    userId: user.id,
    role,
    organisationId,
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    organisationId,
  });
});

router.patch("/admin/users/:userId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;
  const userId = String(req.params.userId);
  const b = req.body ?? {};

  const [target] = await db
    .select({
      id: usersTable.id,
      role: userProfilesTable.role,
      organisationId: userProfilesTable.organisationId,
    })
    .from(usersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Scoping: admin can only touch own-org users and cannot touch a super_admin.
  if (!ctx.isSuper) {
    if (target.role === "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (target.organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Forbidden — user not in your organisation" });
      return;
    }
  }

  const userUpdate: Record<string, unknown> = {};
  if (typeof b.firstName === "string") userUpdate.firstName = b.firstName.trim() || null;
  if (typeof b.lastName === "string") userUpdate.lastName = b.lastName.trim() || null;
  if (typeof b.password === "string" && b.password.length >= 8) {
    userUpdate.passwordHash = await bcrypt.hash(b.password, BCRYPT_ROUNDS);
  }
  if (Object.keys(userUpdate).length) {
    await db.update(usersTable).set(userUpdate).where(eq(usersTable.id, userId));
  }

  const profileUpdate: Record<string, unknown> = {};
  if (typeof b.role === "string") {
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(b.role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    if (!ctx.isSuper && b.role === "super_admin") {
      res.status(403).json({ error: "Only super admin can assign super_admin" });
      return;
    }
    profileUpdate.role = b.role;
  }
  if (b.organisationId !== undefined) {
    if (!ctx.isSuper && b.organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Admin cannot move user to another organisation" });
      return;
    }
    profileUpdate.organisationId = b.organisationId ? String(b.organisationId) : null;
  }
  // Custom role assignment — must belong to the same organisation as the target.
  if (b.customRoleId !== undefined) {
    if (b.customRoleId === null || b.customRoleId === "") {
      profileUpdate.customRoleId = null;
    } else {
      const cid = String(b.customRoleId);
      const [cr] = await db
        .select({ organisationId: customRolesTable.organisationId })
        .from(customRolesTable)
        .where(eq(customRolesTable.id, cid));
      if (!cr) {
        res.status(400).json({ error: "Custom role not found" });
        return;
      }
      const targetOrg =
        (profileUpdate.organisationId as string | null | undefined) ??
        target.organisationId ??
        null;
      if (!ctx.isSuper && cr.organisationId !== ctx.organisationId) {
        res.status(403).json({ error: "Custom role belongs to a different organisation" });
        return;
      }
      if (targetOrg && cr.organisationId !== targetOrg) {
        res.status(400).json({ error: "Custom role must belong to the user's organisation" });
        return;
      }
      profileUpdate.customRoleId = cid;
    }
  }
  if (Object.keys(profileUpdate).length) {
    await db
      .update(userProfilesTable)
      .set(profileUpdate)
      .where(eq(userProfilesTable.userId, userId));
  }

  res.json({ ok: true });
});

router.delete("/admin/users/:userId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;
  const userId = String(req.params.userId);

  if (userId === ctx.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [target] = await db
    .select({
      id: usersTable.id,
      role: userProfilesTable.role,
      organisationId: userProfilesTable.organisationId,
    })
    .from(usersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!ctx.isSuper) {
    if (target.role === "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (target.organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Forbidden — user not in your organisation" });
      return;
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.status(204).end();
});

// ─── Project access per user ─────────────────────────────────────────────────

router.get(
  "/admin/users/:userId/project-access",
  requireAuth,
  async (req: Request, res: Response) => {
    const ctx = await loadAdminCtx(req);
    if (!requireAdminOrSuper(ctx, res)) return;
    const userId = String(req.params.userId);

    const [target] = await db
      .select({
        organisationId: userProfilesTable.organisationId,
        role: userProfilesTable.role,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!ctx.isSuper && target.organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Forbidden — user not in your organisation" });
      return;
    }

    const rows = await db
      .select({ projectId: projectAccessTable.projectId })
      .from(projectAccessTable)
      .where(eq(projectAccessTable.userId, userId));
    res.json({ projectIds: rows.map((r) => r.projectId) });
  },
);

router.put(
  "/admin/users/:userId/project-access",
  requireAuth,
  async (req: Request, res: Response) => {
    const ctx = await loadAdminCtx(req);
    if (!requireAdminOrSuper(ctx, res)) return;
    const userId = String(req.params.userId);
    const b = req.body ?? {};
    const projectIds: string[] = Array.isArray(b.projectIds)
      ? b.projectIds.map((x: unknown) => String(x))
      : [];

    const [target] = await db
      .select({
        organisationId: userProfilesTable.organisationId,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!ctx.isSuper && target.organisationId !== ctx.organisationId) {
      res.status(403).json({ error: "Forbidden — user not in your organisation" });
      return;
    }

    // Validate every projectId is within an org the caller may touch.
    if (projectIds.length) {
      const projRows = await db
        .select({ id: projectsTable.id, organisationId: projectsTable.organisationId })
        .from(projectsTable)
        .where(inArray(projectsTable.id, projectIds));
      if (projRows.length !== projectIds.length) {
        res.status(400).json({ error: "One or more projects not found" });
        return;
      }
      // Project must belong to the target user's org.
      if (target.organisationId) {
        const wrong = projRows.find((p) => p.organisationId !== target.organisationId);
        if (wrong) {
          res.status(400).json({
            error: "All projects must belong to the user's organisation",
          });
          return;
        }
      }
      // Admin scope: every project must be in admin's own org.
      if (!ctx.isSuper) {
        const outside = projRows.find((p) => p.organisationId !== ctx.organisationId);
        if (outside) {
          res.status(403).json({ error: "Admin cannot grant projects outside their organisation" });
          return;
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(projectAccessTable).where(eq(projectAccessTable.userId, userId));
      if (projectIds.length) {
        await tx
          .insert(projectAccessTable)
          .values(projectIds.map((pid) => ({ projectId: pid, userId, createdBy: ctx.userId })))
          .onConflictDoNothing({
            target: [projectAccessTable.projectId, projectAccessTable.userId],
          });
      }
    });

    res.json({ projectIds });
  },
);

// ─── Organisations (super admin view + quota mgmt) ───────────────────────────

router.get("/admin/organisations", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;

  const baseQ = db
    .select({
      id: organisationsTable.id,
      name: organisationsTable.name,
      maxProjects: organisationsTable.maxProjects,
      createdAt: organisationsTable.createdAt,
    })
    .from(organisationsTable);

  const orgs = ctx.isSuper
    ? await baseQ
    : await baseQ.where(eq(organisationsTable.id, ctx.organisationId ?? "__none__"));

  if (!orgs.length) {
    res.json([]);
    return;
  }

  const orgIds = orgs.map((o) => o.id);
  const projCounts = await db
    .select({
      organisationId: projectsTable.organisationId,
      count: sql<number>`count(*)::int`,
    })
    .from(projectsTable)
    .where(inArray(projectsTable.organisationId, orgIds))
    .groupBy(projectsTable.organisationId);
  const userCounts = await db
    .select({
      organisationId: userProfilesTable.organisationId,
      count: sql<number>`count(*)::int`,
    })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.organisationId, orgIds))
    .groupBy(userProfilesTable.organisationId);

  const pMap = new Map(projCounts.map((r) => [r.organisationId, Number(r.count)]));
  const uMap = new Map(userCounts.map((r) => [r.organisationId, Number(r.count)]));

  res.json(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      maxProjects: o.maxProjects,
      projectCount: pMap.get(o.id) ?? 0,
      userCount: uMap.get(o.id) ?? 0,
      createdAt: o.createdAt?.toISOString() ?? null,
    })),
  );
});

router.patch(
  "/admin/organisations/:orgId/quota",
  requireAuth,
  async (req: Request, res: Response) => {
    const ctx = await loadAdminCtx(req);
    if (!requireSuper(ctx, res)) return;
    const orgId = String(req.params.orgId);
    const b = req.body ?? {};
    let maxProjects: number | null = null;
    if (b.maxProjects === null || b.maxProjects === undefined || b.maxProjects === "") {
      maxProjects = null;
    } else {
      const n = Number(b.maxProjects);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        res.status(400).json({ error: "maxProjects must be a non-negative integer or null" });
        return;
      }
      maxProjects = n;
    }

    const [row] = await db
      .update(organisationsTable)
      .set({ maxProjects })
      .where(eq(organisationsTable.id, orgId))
      .returning({ id: organisationsTable.id, maxProjects: organisationsTable.maxProjects });
    if (!row) {
      res.status(404).json({ error: "Organisation not found" });
      return;
    }
    res.json({ id: row.id, maxProjects: row.maxProjects });
  },
);

// ─── Helpers exposed for UI ─────────────────────────────────────────────────

router.get("/admin/assignable-roles", requireAuth, async (req: Request, res: Response) => {
  const ctx = await loadAdminCtx(req);
  if (!requireAdminOrSuper(ctx, res)) return;
  const roles = ctx.isSuper
    ? [...ASSIGNABLE_ROLES]
    : (ASSIGNABLE_ROLES as readonly string[]).filter((r) => r !== "super_admin");
  res.json({ roles });
});

// Avoid unused-import warning for `and` if patch grows; keep import.
void and;

export default router;
