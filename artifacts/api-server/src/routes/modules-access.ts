import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  organisationsTable,
  projectsTable,
  projectAccessTable,
  userProfilesTable,
  usersTable,
  MODULES,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS, loadRole } from "../middlewares/requireAuth";
import { getAccessCtx, sanitizeModuleList } from "../lib/access";

const router: IRouter = Router();

router.get("/modules", requireAuth, (_req, res: Response) => {
  res.json({ modules: MODULES });
});

// Update org-level enabled modules. null = all enabled.
router.patch(
  "/organisations/:organisationId/modules",
  requireAuth,
  requireRole(...ROLE_GROUPS.ADMIN),
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const enabled = sanitizeModuleList(body.enabled);
    const [row] = await db
      .update(organisationsTable)
      .set({ enabledModules: enabled as any })
      .where(eq(organisationsTable.id, req.params.organisationId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ organisationId: row.id, enabledModules: row.enabledModules ?? null });
  },
);

// Update project-level module override. null = inherit org.
router.patch(
  "/projects/:projectId/modules",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const override = sanitizeModuleList(body.enabled);
    const [row] = await db
      .update(projectsTable)
      .set({ enabledModulesOverride: override as any })
      .where(eq(projectsTable.id, req.params.projectId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      projectId: row.id,
      enabledModulesOverride: row.enabledModulesOverride ?? null,
    });
  },
);

// List users assigned to a project.
router.get(
  "/projects/:projectId/access",
  requireAuth,
  async (req: Request, res: Response) => {
    const rows = await db
      .select({
        id: projectAccessTable.id,
        userId: projectAccessTable.userId,
        createdAt: projectAccessTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: userProfilesTable.role,
      })
      .from(projectAccessTable)
      .leftJoin(usersTable, eq(usersTable.id, projectAccessTable.userId))
      .leftJoin(userProfilesTable, eq(userProfilesTable.userId, projectAccessTable.userId))
      .where(eq(projectAccessTable.projectId, req.params.projectId));
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        email: r.email ?? null,
        role: r.role ?? null,
        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    );
  },
);

// Grant a user access to a project.
router.post(
  "/projects/:projectId/access",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    const userId = String(req.body?.userId ?? "").trim();
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    // Verify project's org and target user's org match — prevents cross-org grants.
    const [projOrg] = await db
      .select({ organisationId: projectsTable.organisationId })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.params.projectId));
    const [userProfile] = await db
      .select({ id: usersTable.id, organisationId: userProfilesTable.organisationId })
      .from(usersTable)
      .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
      .where(eq(usersTable.id, userId));
    if (!userProfile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (
      !projOrg?.organisationId ||
      !userProfile.organisationId ||
      projOrg.organisationId !== userProfile.organisationId
    ) {
      res.status(403).json({ error: "User does not belong to this project's organisation" });
      return;
    }
    const ctx = await getAccessCtx(req);
    const [row] = await db
      .insert(projectAccessTable)
      .values({
        projectId: req.params.projectId,
        userId,
        createdBy: ctx.userId,
      })
      .onConflictDoNothing({
        target: [projectAccessTable.projectId, projectAccessTable.userId],
      })
      .returning();
    if (!row) {
      // Already existed — fetch it for an idempotent response.
      const [existing] = await db
        .select()
        .from(projectAccessTable)
        .where(
          and(
            eq(projectAccessTable.projectId, req.params.projectId),
            eq(projectAccessTable.userId, userId),
          ),
        );
      res.status(200).json({
        id: existing!.id,
        projectId: existing!.projectId,
        userId: existing!.userId,
        createdAt: existing!.createdAt.toISOString(),
      });
      return;
    }
    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

// Revoke a user's access.
router.delete(
  "/projects/:projectId/access/:userId",
  requireAuth,
  requireRole(...ROLE_GROUPS.OWNER_PM),
  async (req: Request, res: Response) => {
    await db
      .delete(projectAccessTable)
      .where(
        and(
          eq(projectAccessTable.projectId, req.params.projectId),
          eq(projectAccessTable.userId, req.params.userId),
        ),
      );
    res.status(204).end();
  },
);

// List org users (admin/owner/pm) eligible for project assignment.
router.get(
  "/organisations/:organisationId/users",
  requireAuth,
  async (req: Request, res: Response) => {
    const ctx = await getAccessCtx(req);
    // Only an admin OR a user who belongs to that organisation may enumerate its users.
    if (ctx.role !== "admin" && ctx.organisationId !== req.params.organisationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select({
        userId: userProfilesTable.userId,
        role: userProfilesTable.role,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(userProfilesTable)
      .leftJoin(usersTable, eq(usersTable.id, userProfilesTable.userId))
      .where(eq(userProfilesTable.organisationId, req.params.organisationId));
    res.json(
      rows.map((r) => ({
        userId: r.userId,
        role: r.role,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        email: r.email ?? null,
      })),
    );
  },
);

export default router;
