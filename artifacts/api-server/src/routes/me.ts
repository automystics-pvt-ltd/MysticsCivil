import { Router, type IRouter, type Request, type Response } from "express";
import { db, userProfilesTable, organisationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function ensureProfile(userId: string) {
  const existing = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  if (existing.length) return existing[0];
  const [created] = await db
    .insert(userProfilesTable)
    .values({ userId, role: "pm" })
    .returning();
  return created;
}

async function buildProfile(userId: string) {
  const profile = await ensureProfile(userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  let orgName: string | null = null;
  if (profile.organisationId) {
    const [org] = await db
      .select()
      .from(organisationsTable)
      .where(eq(organisationsTable.id, profile.organisationId));
    orgName = org?.name ?? null;
  }
  return {
    userId,
    role: profile.role,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    email: user?.email ?? null,
    profileImageUrl: user?.profileImageUrl ?? null,
    organisationId: profile.organisationId ?? null,
    organisationName: orgName,
    phone: profile.phone ?? null,
    designation: profile.designation ?? null,
  };
}

router.get("/me/profile", requireAuth, async (req: Request, res: Response) => {
  res.json(await buildProfile(req.user!.id));
});

router.patch("/me/profile", requireAuth, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  await ensureProfile(req.user!.id);
  // SECURITY: role and organisationId are NOT self-mutable here — that would
  // allow any user to self-promote to admin/super_admin. They must be changed
  // by an admin via /api/admin/users/:userId.
  const update: Record<string, unknown> = {};
  if (typeof body.phone === "string") update.phone = body.phone;
  if (typeof body.designation === "string") update.designation = body.designation;
  if (Object.keys(update).length) {
    await db
      .update(userProfilesTable)
      .set(update)
      .where(eq(userProfilesTable.userId, req.user!.id));
  }
  res.json(await buildProfile(req.user!.id));
});

export default router;
