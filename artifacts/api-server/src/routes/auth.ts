import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, userProfilesTable, organisationsTable, tenantSubscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { checkIpRateLimit } from "../lib/ipRateLimit";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

function serializeUser(u: { id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null }) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    profileImageUrl: u.profileImageUrl,
  };
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.json({ user: null });
    return;
  }
  const userId = req.user.id;
  const [profile] = await db
    .select({ role: userProfilesTable.role })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  res.json({ user: { ...req.user, globalRole: profile?.role ?? null } });
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const firstName = body.firstName ? String(body.firstName).trim() : null;
  const lastName = body.lastName ? String(body.lastName).trim() : null;
  const orgName = body.orgName ? String(body.orgName).trim() : null;

  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "Valid email required" }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  if (!orgName) { res.status(400).json({ error: "Organisation name required" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(409).json({ error: "An account with this email already exists" }); return; }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // First user in the system → admin; otherwise → owner of a newly created org.
  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  const isFirstUser = existingUsers.length === 0;

  const [org] = await db.insert(organisationsTable).values({ name: orgName }).returning();
  const [user] = await db.insert(usersTable).values({ email, passwordHash, firstName, lastName }).returning();
  await db.insert(userProfilesTable).values({
    userId: user.id,
    role: isFirstUser ? "admin" : "owner",
    organisationId: org.id,
  });

  const sessionData: SessionData = { user: serializeUser(user) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.status(201).json({ user: serializeUser(user) });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.passwordHash) {
    // Constant-ish error; hash anyway to mitigate timing leak when account does not exist.
    if (!user) { await bcrypt.hash(password, BCRYPT_ROUNDS); }
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid email or password" }); return; }

  const sessionData: SessionData = { user: serializeUser(user) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ user: serializeUser(user) });
});

/**
 * POST /auth/register-tenant
 * Self-service tenant registration — creates user + org + assigns the free plan.
 * All writes are in a single DB transaction so partial failures are rolled back.
 * Rate limited to 3 registrations per IP per hour to prevent abuse.
 */
router.post("/auth/register-tenant", async (req: Request, res: Response) => {
  // IP rate limit: max 3 registrations per IP per hour.
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const rateCheck = checkIpRateLimit(ip, "register-tenant", 3, 60 * 60 * 1000);
  if (!rateCheck.ok) {
    res.status(429).json({
      error: "Too many registration attempts. Please try again later.",
      retryAfter: rateCheck.retryAfter,
    });
    return;
  }

  const body = req.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const firstName = body.firstName ? String(body.firstName).trim() : null;
  const lastName = body.lastName ? String(body.lastName).trim() : null;
  const orgName = body.orgName ? String(body.orgName).trim() : null;

  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "Valid email required" }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  if (!orgName) { res.status(400).json({ error: "Organisation name required" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(409).json({ error: "An account with this email already exists" }); return; }

  const [freePlan] = await db
    .select({ id: subscriptionPlansTable.id })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, "free"));

  if (!freePlan) {
    res.status(500).json({ error: "Free plan not found — contact support" });
    return;
  }

  // Hash before the transaction to avoid holding the transaction open during a CPU-bound operation.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // All inserts in a single atomic transaction — partial failures roll back automatically.
  const { user, org } = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organisationsTable).values({ name: orgName as string }).returning();
    const [user] = await tx.insert(usersTable).values({ email, passwordHash, firstName, lastName }).returning();
    await tx.insert(userProfilesTable).values({
      userId: user.id,
      role: "owner",
      organisationId: org.id,
    });
    const now = new Date();
    await tx.insert(tenantSubscriptionsTable).values({
      organisationId: org.id,
      planId: freePlan.id,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    });
    return { user, org };
  });

  const sessionData: SessionData = { user: serializeUser(user) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.status(201).json({ user: serializeUser(user), organisation: { id: org.id, name: org.name } });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

export default router;
