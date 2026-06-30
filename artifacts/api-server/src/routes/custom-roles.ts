import { Router, type IRouter, type Request, type Response } from "express";
import { db, customRolesTable, userProfilesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getAccessCtx, isSuperAdmin, hasCapability } from "../lib/access";
import { CAPABILITIES, sanitizeCapabilityList } from "../lib/capabilities";

const router: IRouter = Router();

// Who can manage custom roles: super_admin, admin, or anyone with the
// `roles:manage` capability via their custom role.
async function canManage(req: Request): Promise<{ ok: boolean; orgScope: string | null; isSuper: boolean }> {
  const ctx = await getAccessCtx(req);
  const isSuper = isSuperAdmin(ctx.role);
  const isAdmin = ctx.role === "admin";
  const ok = isSuper || isAdmin || hasCapability(ctx, "roles:manage");
  return { ok, orgScope: isSuper ? null : ctx.organisationId, isSuper };
}

// Catalog — surface the capability list to the UI.
router.get("/custom-roles/capabilities", requireAuth, async (_req: Request, res: Response) => {
  res.json(CAPABILITIES);
});

// List roles. Super_admin sees all; everyone else sees their own org's.
router.get("/custom-roles", requireAuth, async (req: Request, res: Response) => {
  const ctx = await getAccessCtx(req);
  const rows = isSuperAdmin(ctx.role)
    ? await db.select().from(customRolesTable)
    : ctx.organisationId
      ? await db
          .select()
          .from(customRolesTable)
          .where(eq(customRolesTable.organisationId, ctx.organisationId))
      : [];
  res.json(
    rows.map((r) => ({
      id: r.id,
      organisationId: r.organisationId,
      name: r.name,
      description: r.description,
      permissions: r.permissions ?? [],
      createdAt: r.createdAt?.toISOString() ?? null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
  );
});

router.post("/custom-roles", requireAuth, async (req: Request, res: Response) => {
  const gate = await canManage(req);
  if (!gate.ok) {
    res.status(403).json({ error: "Forbidden — roles:manage required" });
    return;
  }
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  const description = b.description ? String(b.description).trim().slice(0, 256) : null;
  const permissions = sanitizeCapabilityList(b.permissions);
  const organisationId = gate.isSuper
    ? (b.organisationId ? String(b.organisationId) : null)
    : gate.orgScope;
  if (!name) {
    res.status(400).json({ error: "Role name is required" });
    return;
  }
  if (!organisationId) {
    res.status(400).json({ error: "organisationId is required" });
    return;
  }
  try {
    const [row] = await db
      .insert(customRolesTable)
      .values({ organisationId, name, description, permissions })
      .returning();
    res.status(201).json({
      id: row.id,
      organisationId: row.organisationId,
      name: row.name,
      description: row.description,
      permissions: row.permissions ?? [],
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      res.status(409).json({ error: "A role with that name already exists in this organisation" });
      return;
    }
    res.status(500).json({ error: e?.message ?? "Failed to create role" });
  }
});

router.patch("/custom-roles/:roleId", requireAuth, async (req: Request, res: Response) => {
  const gate = await canManage(req);
  if (!gate.ok) {
    res.status(403).json({ error: "Forbidden — roles:manage required" });
    return;
  }
  const roleId = String(req.params["roleId"] ?? "");
  const [existing] = await db
    .select()
    .from(customRolesTable)
    .where(eq(customRolesTable.id, roleId));
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (!gate.isSuper && existing.organisationId !== gate.orgScope) {
    res.status(403).json({ error: "Forbidden — role belongs to a different organisation" });
    return;
  }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string") {
    const trimmed = b.name.trim();
    if (!trimmed) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    patch.name = trimmed;
  }
  if (b.description !== undefined) {
    patch.description = b.description ? String(b.description).trim().slice(0, 256) : null;
  }
  if (b.permissions !== undefined) {
    patch.permissions = sanitizeCapabilityList(b.permissions);
  }
  if (!Object.keys(patch).length) {
    res.json({ success: true });
    return;
  }
  try {
    await db.update(customRolesTable).set(patch).where(eq(customRolesTable.id, roleId));
    res.json({ success: true });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      res.status(409).json({ error: "A role with that name already exists in this organisation" });
      return;
    }
    res.status(500).json({ error: e?.message ?? "Failed to update role" });
  }
});

router.delete("/custom-roles/:roleId", requireAuth, async (req: Request, res: Response) => {
  const gate = await canManage(req);
  if (!gate.ok) {
    res.status(403).json({ error: "Forbidden — roles:manage required" });
    return;
  }
  const roleId = String(req.params["roleId"] ?? "");
  const [existing] = await db
    .select()
    .from(customRolesTable)
    .where(eq(customRolesTable.id, roleId));
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (!gate.isSuper && existing.organisationId !== gate.orgScope) {
    res.status(403).json({ error: "Forbidden — role belongs to a different organisation" });
    return;
  }
  // Detach any users currently holding this role first (FK is informal — null it out).
  await db
    .update(userProfilesTable)
    .set({ customRoleId: null })
    .where(eq(userProfilesTable.customRoleId, roleId));
  await db.delete(customRolesTable).where(eq(customRolesTable.id, roleId));
  res.status(204).end();
});

export default router;
