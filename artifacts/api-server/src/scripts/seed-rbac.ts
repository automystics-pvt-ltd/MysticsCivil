import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  userProfilesTable,
  organisationsTable,
  projectsTable,
  projectAccessTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const PASSWORD = "MysticsCivil@2026";
const ROUNDS = 12;

async function upsertOrg(name: string, maxProjects: number | null): Promise<string> {
  const [existing] = await db
    .select({ id: organisationsTable.id })
    .from(organisationsTable)
    .where(eq(organisationsTable.name, name));
  if (existing) {
    await db
      .update(organisationsTable)
      .set({ maxProjects })
      .where(eq(organisationsTable.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(organisationsTable)
    .values({ name, maxProjects })
    .returning({ id: organisationsTable.id });
  return row.id;
}

async function upsertUser(args: {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organisationId: string;
}): Promise<string> {
  const passwordHash = await bcrypt.hash(PASSWORD, ROUNDS);
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, args.email));
  let userId: string;
  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash, firstName: args.firstName, lastName: args.lastName })
      .where(eq(usersTable.id, existing.id));
    userId = existing.id;
  } else {
    const [row] = await db
      .insert(usersTable)
      .values({
        email: args.email,
        passwordHash,
        firstName: args.firstName,
        lastName: args.lastName,
      })
      .returning({ id: usersTable.id });
    userId = row.id;
  }
  // Upsert profile
  const [profile] = await db
    .select({ userId: userProfilesTable.userId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  if (profile) {
    await db
      .update(userProfilesTable)
      .set({ role: args.role, organisationId: args.organisationId })
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db
      .insert(userProfilesTable)
      .values({ userId, role: args.role, organisationId: args.organisationId });
  }
  return userId;
}

async function main() {
  console.log("→ Seeding RBAC demo accounts…");
  const hqOrgId = await upsertOrg("Mystics Civil HQ", null);
  const demoOrgId = await upsertOrg("Demo Construction Co", 5);

  const superId = await upsertUser({
    email: "superadmin@mysticscivil.com",
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
    organisationId: hqOrgId,
  });
  const adminId = await upsertUser({
    email: "admin@mysticscivil.com",
    firstName: "Demo",
    lastName: "Admin",
    role: "admin",
    organisationId: demoOrgId,
  });
  const ownerId = await upsertUser({
    email: "siteowner@mysticscivil.com",
    firstName: "Site",
    lastName: "Owner",
    role: "owner",
    organisationId: demoOrgId,
  });
  const userId = await upsertUser({
    email: "user@mysticscivil.com",
    firstName: "Field",
    lastName: "User",
    role: "pm",
    organisationId: demoOrgId,
  });

  // Remaining built-in roles — one demo account each in Demo Construction Co.
  const extraRoles: Array<{ email: string; firstName: string; lastName: string; role: string }> = [
    { email: "siteengineer@mysticscivil.com", firstName: "Site",       lastName: "Engineer",   role: "site_engineer" },
    { email: "qs@mysticscivil.com",           firstName: "Quantity",   lastName: "Surveyor",   role: "qs" },
    { email: "finance@mysticscivil.com",      firstName: "Finance",    lastName: "Officer",    role: "finance" },
    { email: "contractor@mysticscivil.com",   firstName: "Lead",       lastName: "Contractor", role: "contractor" },
    { email: "qc@mysticscivil.com",           firstName: "Quality",    lastName: "Control",    role: "qc" },
    { email: "store@mysticscivil.com",        firstName: "Store",      lastName: "Keeper",     role: "store" },
    { email: "hr@mysticscivil.com",           firstName: "HR",         lastName: "Manager",    role: "hr" },
  ];
  const extraIds: Record<string, string> = {};
  for (const r of extraRoles) {
    extraIds[r.role] = await upsertUser({ ...r, organisationId: demoOrgId });
  }

  // Grant `user@…` access to one demo-org project, if any exist.
  const [firstProject] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.organisationId, demoOrgId))
    .limit(1);
  if (firstProject) {
    await db
      .insert(projectAccessTable)
      .values({ projectId: firstProject.id, userId, createdBy: adminId })
      .onConflictDoNothing({
        target: [projectAccessTable.projectId, projectAccessTable.userId],
      });
    console.log(`  • Granted user@ access to project ${firstProject.id}`);
  } else {
    console.log("  • No projects in Demo Construction Co yet — user@ has no project access");
  }

  // Sanity counts
  const [{ count: orgCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(organisationsTable);
  const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);

  console.log("\n✔ Seed complete.");
  console.log(`  organisations: ${orgCount}`);
  console.log(`  users:         ${userCount}`);
  console.log("\nDemo credentials (shared password: " + PASSWORD + "):");
  console.log("  superadmin@mysticscivil.com    → Super Admin     [" + superId.slice(0, 8) + "]");
  console.log("  admin@mysticscivil.com         → Admin           [" + adminId.slice(0, 8) + "]");
  console.log("  siteowner@mysticscivil.com     → Site Owner      [" + ownerId.slice(0, 8) + "]");
  console.log("  user@mysticscivil.com          → Project Manager [" + userId.slice(0, 8) + "]");
  for (const r of extraRoles) {
    const id = extraIds[r.role]!.slice(0, 8);
    console.log(`  ${r.email.padEnd(30)} → ${r.role.padEnd(15)} [${id}]`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
