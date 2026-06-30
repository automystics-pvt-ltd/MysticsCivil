import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  db,
  tenantInvitationsTable,
  userProfilesTable,
  usersTable,
  organisationsTable,
  USER_ROLES,
} from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { requireAuth, requireRole, ROLE_GROUPS } from "../middlewares/requireAuth";
import { getAccessCtx, isSuperAdmin } from "../lib/access";
import { loadTenantPlan, checkPlanLimit } from "../lib/subscription";
import { sql } from "drizzle-orm";
import {
  clearSession,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

const INVITATION_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/**
 * POST /organisations/:organisationId/invitations
 * Admin/owner sends an invitation to an email address.
 * Enforces the plan's maxUsers limit.
 */
router.post(
  "/organisations/:organisationId/invitations",
  requireAuth,
  requireRole(...ROLE_GROUPS.ADMIN),
  async (req: Request, res: Response) => {
    const { organisationId } = req.params;
    const ctx = await getAccessCtx(req);

    if (!isSuperAdmin(ctx.role) && ctx.organisationId !== organisationId) {
      res.status(403).json({ error: "You can only invite users to your own organisation." });
      return;
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const role = String(req.body?.role ?? "site_engineer");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    if (!(USER_ROLES as readonly string[]).includes(role)) {
      res.status(400).json({ error: `Invalid role: ${role}` });
      return;
    }

    // Check plan user limit
    const plan = await loadTenantPlan(req);
    const [{ count: currentUsers }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.organisationId, organisationId));

    const limitCheck = checkPlanLimit(plan, "maxUsers", Number(currentUsers));
    if (!limitCheck.ok) {
      res.status(403).json({ error: limitCheck.message, code: "PLAN_LIMIT_REACHED", limitKey: "maxUsers" });
      return;
    }

    // Check there isn't already a pending, unexpired, non-revoked invite for this email+org
    const now = new Date();
    const [existingPending] = await db
      .select({ id: tenantInvitationsTable.id })
      .from(tenantInvitationsTable)
      .where(
        and(
          eq(tenantInvitationsTable.organisationId, organisationId),
          eq(tenantInvitationsTable.email, email),
          isNull(tenantInvitationsTable.acceptedAt),
          isNull(tenantInvitationsTable.revokedAt),
          gt(tenantInvitationsTable.expiresAt, now),
        ),
      );

    if (existingPending) {
      res.status(409).json({ error: "A pending invitation already exists for this email." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [inv] = await db
      .insert(tenantInvitationsTable)
      .values({
        organisationId,
        email,
        role,
        token,
        createdById: ctx.userId,
        expiresAt,
      })
      .returning();

    res.status(201).json({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      token: inv.token,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    });
  },
);

/**
 * GET /organisations/:organisationId/invitations
 * List pending invitations for the org.
 */
router.get(
  "/organisations/:organisationId/invitations",
  requireAuth,
  requireRole(...ROLE_GROUPS.ADMIN),
  async (req: Request, res: Response) => {
    const { organisationId } = req.params;
    const ctx = await getAccessCtx(req);

    if (!isSuperAdmin(ctx.role) && ctx.organisationId !== organisationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(tenantInvitationsTable)
      .where(eq(tenantInvitationsTable.organisationId, organisationId));

    res.json(rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      revokedAt: r.revokedAt,
      status: r.revokedAt ? "revoked" : r.acceptedAt ? "accepted" : new Date() > r.expiresAt ? "expired" : "pending",
    })));
  },
);

/**
 * DELETE /organisations/:organisationId/invitations/:invitationId
 * Revoke a pending invitation.
 */
router.delete(
  "/organisations/:organisationId/invitations/:invitationId",
  requireAuth,
  requireRole(...ROLE_GROUPS.ADMIN),
  async (req: Request, res: Response) => {
    const { organisationId, invitationId } = req.params;
    const ctx = await getAccessCtx(req);

    if (!isSuperAdmin(ctx.role) && ctx.organisationId !== organisationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [inv] = await db
      .update(tenantInvitationsTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(tenantInvitationsTable.id, invitationId),
          eq(tenantInvitationsTable.organisationId, organisationId),
          isNull(tenantInvitationsTable.acceptedAt),
          isNull(tenantInvitationsTable.revokedAt),
        ),
      )
      .returning();

    if (!inv) {
      res.status(404).json({ error: "Invitation not found or already accepted/revoked" });
      return;
    }
    res.json({ success: true });
  },
);

/**
 * GET /invitations/:token
 * Validate an invitation token (public — no auth required).
 * Returns invitation metadata so the frontend can pre-fill the register form.
 */
router.get("/invitations/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const now = new Date();

  const [row] = await db
    .select({
      id: tenantInvitationsTable.id,
      email: tenantInvitationsTable.email,
      role: tenantInvitationsTable.role,
      expiresAt: tenantInvitationsTable.expiresAt,
      acceptedAt: tenantInvitationsTable.acceptedAt,
      revokedAt: tenantInvitationsTable.revokedAt,
      orgId: tenantInvitationsTable.organisationId,
      orgName: organisationsTable.name,
    })
    .from(tenantInvitationsTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, tenantInvitationsTable.organisationId))
    .where(eq(tenantInvitationsTable.token, token));

  if (!row) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (row.revokedAt) {
    res.status(410).json({ error: "Invitation has been revoked" });
    return;
  }
  if (row.acceptedAt) {
    res.status(410).json({ error: "Invitation has already been accepted" });
    return;
  }
  if (now > row.expiresAt) {
    res.status(410).json({ error: "Invitation has expired" });
    return;
  }

  res.json({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt,
    organisation: { id: row.orgId, name: row.orgName },
  });
});

/**
 * POST /invitations/:token/accept
 * Accept an invitation.
 * If a user with that email already exists: log them in and join the org.
 * If not: create the account (requires firstName, lastName, password in body).
 * Auto-creates a session and returns the user object.
 */
router.post("/invitations/:token/accept", async (req: Request, res: Response) => {
  const { token } = req.params;
  const now = new Date();

  const [row] = await db
    .select()
    .from(tenantInvitationsTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, tenantInvitationsTable.organisationId))
    .where(eq(tenantInvitationsTable.token, token));

  const inv = row?.tenant_invitations;
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (inv.revokedAt || inv.acceptedAt || now > inv.expiresAt) {
    res.status(410).json({ error: "Invitation is no longer valid" });
    return;
  }

  const body = req.body ?? {};

  await db.transaction(async (tx) => {
    let user = (await tx.select().from(usersTable).where(eq(usersTable.email, inv.email)))[0];

    if (!user) {
      const firstName = body.firstName ? String(body.firstName).trim() : null;
      const lastName = body.lastName ? String(body.lastName).trim() : null;
      const password = String(body.password ?? "");
      if (password.length < 8) {
        throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      [user] = await tx
        .insert(usersTable)
        .values({ email: inv.email, passwordHash, firstName, lastName })
        .returning();
    }

    // Upsert profile — if they already have one in another org, just update org + role
    const [existing] = await tx
      .select({ userId: userProfilesTable.userId })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, user.id));

    if (existing) {
      await tx
        .update(userProfilesTable)
        .set({ organisationId: inv.organisationId, role: inv.role })
        .where(eq(userProfilesTable.userId, user.id));
    } else {
      await tx.insert(userProfilesTable).values({
        userId: user.id,
        role: inv.role,
        organisationId: inv.organisationId,
      });
    }

    await tx
      .update(tenantInvitationsTable)
      .set({ acceptedAt: now, acceptedByUserId: user.id })
      .where(eq(tenantInvitationsTable.id, inv.id));

    const sessionData: SessionData = {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
    };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.status(200).json({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      organisation: { id: inv.organisationId },
    });
  });
});

export default router;
