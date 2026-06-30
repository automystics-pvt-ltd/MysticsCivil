import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const USER_ROLES = [
  "owner",
  "pm",
  "site_engineer",
  "qs",
  "finance",
  "contractor",
  "qc",
  "store",
  "hr",
  "admin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROJECT_STATUSES = [
  "pending_approval",
  "not_started",
  "on_track",
  "at_risk",
  "delayed",
  "on_hold",
  "completed",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ACTIVITY_STATUSES = PROJECT_STATUSES;
export const DPR_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type DprStatus = (typeof DPR_STATUSES)[number];

export const MILESTONE_STATUSES = [
  "pending",
  "on_track",
  "at_risk",
  "delayed",
  "completed",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

// Canonical module registry — admins toggle these on/off per org / per project.
// Keep in sync with UI nav & per-project tab keys.
export const MODULES = [
  "dashboard",
  "approvals",
  "projects",
  "dprs",
  "milestones",
  "wbs",
  "workforce",
  "supply_chain",
  "estimation",
  "boq",
  "financial",
  "variation_orders",
  "dsr_rates",
  "quality",
  "safety",
  "photos",
  "documents",
] as const;
export type ModuleKey = (typeof MODULES)[number];

export const userProfilesTable = pgTable("user_profiles", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 }).notNull().default("site_engineer"),
  organisationId: varchar("organisation_id"),
  // Optional custom role layered ADDITIVELY on top of the built-in `role`.
  // Built-in role still drives org/admin gates; custom role grants extra capabilities.
  customRoleId: varchar("custom_role_id"),
  phone: varchar("phone", { length: 32 }),
  designation: varchar("designation", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type UserProfile = typeof userProfilesTable.$inferSelect;

// Custom roles — org-scoped named bundles of additional capabilities.
// The built-in `userProfilesTable.role` always sets the baseline; a user's
// custom role (if any) adds extra capabilities on top.
export const customRolesTable = pgTable(
  "custom_roles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organisationId: varchar("organisation_id").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    description: varchar("description", { length: 256 }),
    // Array of capability keys from the CAPABILITIES catalog (api-server lib/capabilities.ts).
    permissions: jsonb("permissions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgNameUq: uniqueIndex("custom_roles_org_name_uq").on(t.organisationId, t.name),
  }),
);
export type CustomRole = typeof customRolesTable.$inferSelect;

export const organisationsTable = pgTable("organisations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 256 }).notNull(),
  legalName: varchar("legal_name", { length: 256 }),
  gstin: varchar("gstin", { length: 32 }),
  pan: varchar("pan", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  pincode: varchar("pincode", { length: 16 }),
  logoUrl: varchar("logo_url"),
  // null = all modules enabled (default). Array = explicit allow-list of ModuleKey strings.
  enabledModules: jsonb("enabled_modules"),
  // null = unlimited. Otherwise enforced on POST /projects. Set by super_admin.
  maxProjects: integer("max_projects"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Organisation = typeof organisationsTable.$inferSelect;
export const insertOrganisationSchema = createInsertSchema(organisationsTable).omit({
  id: true,
  createdAt: true,
});

export const projectsTable = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id")
    .notNull()
    .references(() => organisationsTable.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  clientName: varchar("client_name", { length: 256 }),
  description: text("description"),
  location: varchar("location", { length: 256 }),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  reraNumber: varchar("rera_number", { length: 64 }),
  contractValue: numeric("contract_value", { precision: 18, scale: 2 }).notNull().default("0"),
  startDate: timestamp("start_date", { withTimezone: true }),
  targetEndDate: timestamp("target_end_date", { withTimezone: true }),
  forecastEndDate: timestamp("forecast_end_date", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("pending_approval"),
  initiatedById: varchar("initiated_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  initiatedAt: timestamp("initiated_at", { withTimezone: true }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastTransitionNote: text("last_transition_note"),
  plannedPercent: numeric("planned_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  actualPercent: numeric("actual_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  costToDate: numeric("cost_to_date", { precision: 18, scale: 2 }).notNull().default("0"),
  budgetToDate: numeric("budget_to_date", { precision: 18, scale: 2 }).notNull().default("0"),
  cpi: numeric("cpi", { precision: 6, scale: 3 }).notNull().default("1"),
  spi: numeric("spi", { precision: 6, scale: 3 }).notNull().default("1"),
  pmId: varchar("pm_id").references(() => usersTable.id),
  coverImageUrl: varchar("cover_image_url"),
  notificationRecipients: jsonb("notification_recipients").notNull().default(sql`'{}'::jsonb`),
  // null = inherit organisation. Array = explicit override allow-list of ModuleKey strings.
  enabledModulesOverride: jsonb("enabled_modules_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type Project = typeof projectsTable.$inferSelect;
export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  cpi: true,
  spi: true,
});

// Explicit per-user project access. Admin/owner roles bypass this and see all projects in their org.
// Non-admin/owner users must have a row here to see/use the project.
export const projectAccessTable = pgTable(
  "project_access",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: varchar("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdBy: varchar("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_access_project_user_uq").on(table.projectId, table.userId),
  ],
);
export type ProjectAccess = typeof projectAccessTable.$inferSelect;

export const wbsActivitiesTable = pgTable("wbs_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id"),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  plannedQuantity: numeric("planned_quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  actualQuantity: numeric("actual_quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  plannedStart: timestamp("planned_start", { withTimezone: true }),
  plannedEnd: timestamp("planned_end", { withTimezone: true }),
  actualStart: timestamp("actual_start", { withTimezone: true }),
  actualEnd: timestamp("actual_end", { withTimezone: true }),
  plannedPercent: numeric("planned_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  actualPercent: numeric("actual_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  plannedCost: numeric("planned_cost", { precision: 18, scale: 2 }).notNull().default("0"),
  actualCost: numeric("actual_cost", { precision: 18, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 32 }).notNull().default("not_started"),
  weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WbsActivity = typeof wbsActivitiesTable.$inferSelect;
export const insertWbsActivitySchema = createInsertSchema(wbsActivitiesTable).omit({
  id: true,
  createdAt: true,
});

export const milestonesTable = pgTable("milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  targetDate: timestamp("target_date", { withTimezone: true }).notNull(),
  forecastDate: timestamp("forecast_date", { withTimezone: true }),
  actualDate: timestamp("actual_date", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  certificateIssued: boolean("certificate_issued").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Milestone = typeof milestonesTable.$inferSelect;
export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  id: true,
  createdAt: true,
});

export const dprsTable = pgTable("dprs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
  weather: varchar("weather", { length: 64 }),
  temperature: numeric("temperature", { precision: 5, scale: 2 }),
  manpowerCount: integer("manpower_count").notNull().default(0),
  summary: text("summary"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  submittedById: varchar("submitted_by_id").references(() => usersTable.id),
  approvedById: varchar("approved_by_id").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Dpr = typeof dprsTable.$inferSelect;
export const insertDprSchema = createInsertSchema(dprsTable).omit({
  id: true,
  createdAt: true,
  submittedAt: true,
  approvedAt: true,
  submittedById: true,
  approvedById: true,
  status: true,
});

export const dprItemsTable = pgTable("dpr_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dprId: varchar("dpr_id")
    .notNull()
    .references(() => dprsTable.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id")
    .notNull()
    .references(() => wbsActivitiesTable.id, { onDelete: "cascade" }),
  quantityToday: numeric("quantity_today", { precision: 18, scale: 3 }).notNull().default("0"),
  cumulativeQuantity: numeric("cumulative_quantity", { precision: 18, scale: 3 })
    .notNull()
    .default("0"),
  remarks: text("remarks"),
});
export type DprItem = typeof dprItemsTable.$inferSelect;
export const insertDprItemSchema = createInsertSchema(dprItemsTable).omit({ id: true });

export const sitePhotosTable = pgTable("site_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").references(() => wbsActivitiesTable.id, {
    onDelete: "set null",
  }),
  dprId: varchar("dpr_id").references(() => dprsTable.id, { onDelete: "set null" }),
  url: varchar("url").notNull(),
  caption: text("caption"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  uploadedById: varchar("uploaded_by_id").references(() => usersTable.id),
  tag: varchar("tag", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SitePhoto = typeof sitePhotosTable.$inferSelect;
export const insertSitePhotoSchema = createInsertSchema(sitePhotosTable).omit({
  id: true,
  createdAt: true,
});

export const documentsTable = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  category: varchar("category", { length: 64 }),
  url: varchar("url").notNull(),
  version: integer("version").notNull().default(1),
  uploadedById: varchar("uploaded_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Document = typeof documentsTable.$inferSelect;
export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
});

export const issuesTable = pgTable("issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  dprId: varchar("dpr_id").references(() => dprsTable.id, { onDelete: "set null" }),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 32 }).notNull().default("medium"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  raisedById: varchar("raised_by_id").references(() => usersTable.id),
  assignedToId: varchar("assigned_to_id").references(() => usersTable.id),
  raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
});
export type Issue = typeof issuesTable.$inferSelect;
export const insertIssueSchema = createInsertSchema(issuesTable).omit({
  id: true,
  raisedAt: true,
  resolvedAt: true,
  raisedById: true,
});

export const approvalsTable = pgTable(
  "approvals",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: varchar("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: varchar("entity_id").notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    requestedById: varchar("requested_by_id").references(() => usersTable.id),
    assignedToRole: varchar("assigned_to_role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    // At most one open approval per (entity_type, entity_id). DB-enforced so
    // concurrent resubmits / double-clicks cannot create duplicate pending
    // rows even if the app-side select-then-insert race-loses.
    onePendingPerEntityUq: uniqueIndex("approvals_one_pending_per_entity_uq")
      .on(t.entityType, t.entityId)
      .where(sql`status = 'pending'`),
  }),
);
export type Approval = typeof approvalsTable.$inferSelect;

// ─────────────────────────────────────────────
// Phase 2 — Estimation Engine
// ─────────────────────────────────────────────

export const ESTIMATE_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export type EstimateLevel = (typeof ESTIMATE_LEVELS)[number];

export const ESTIMATE_STATUSES = ["draft", "submitted", "approved", "locked"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const VO_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type VoStatus = (typeof VO_STATUSES)[number];

export const RATE_COMPONENT_TYPES = ["material", "labour", "plant", "overhead"] as const;
export type RateComponentType = (typeof RATE_COMPONENT_TYPES)[number];

export const BOQ_LEVEL_TYPES = ["L2", "L3"] as const;

export const dsrRatesTable = pgTable("dsr_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 32 }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  trade: varchar("trade", { length: 64 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  state: varchar("state", { length: 64 }).notNull(),
  cityTier: varchar("city_tier", { length: 16 }).notNull().default("T2"),
  rate: numeric("rate", { precision: 18, scale: 2 }).notNull(),
  effectiveYear: integer("effective_year").notNull().default(2024),
  source: varchar("source", { length: 64 }).notNull().default("DSR"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  dsrRateCodeStateYearUq: uniqueIndex("dsr_rate_code_state_year_uq").on(t.code, t.state, t.effectiveYear),
}));
export type DsrRate = typeof dsrRatesTable.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// DSR/SSR Rate Sources — configurable auto-sync sources (CSV, JSON, Google
// Sheet, or annual-escalation rule). A daily cron loops enabled sources and
// upserts into dsrRatesTable.
// ─────────────────────────────────────────────────────────────────────────────
export const RATE_SOURCE_TYPES = ["csv", "json", "gsheet", "escalation"] as const;
export type RateSourceType = (typeof RATE_SOURCE_TYPES)[number];

export const RATE_SYNC_STATUSES = ["never", "success", "partial", "error"] as const;
export type RateSyncStatus = (typeof RATE_SYNC_STATUSES)[number];

export const rateSourcesTable = pgTable("rate_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: varchar("label", { length: 128 }).notNull(),
  type: varchar("type", { length: 16 }).notNull().default("csv"),
  url: text("url"),
  defaultState: varchar("default_state", { length: 64 }),
  defaultSource: varchar("default_source", { length: 64 }).notNull().default("DSR"),
  defaultEffectiveYear: integer("default_effective_year"),
  enabled: boolean("enabled").notNull().default(true),
  // Only used when type = "escalation"
  escalationPct: numeric("escalation_pct", { precision: 6, scale: 3 }),
  escalationFilterTrade: varchar("escalation_filter_trade", { length: 64 }),
  escalationFilterState: varchar("escalation_filter_state", { length: 64 }),
  escalationFromYear: integer("escalation_from_year"),
  escalationToYear: integer("escalation_to_year"),
  // Last sync results
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: varchar("last_sync_status", { length: 16 }).notNull().default("never"),
  lastSyncRowsInserted: integer("last_sync_rows_inserted").notNull().default(0),
  lastSyncRowsUpdated: integer("last_sync_rows_updated").notNull().default(0),
  lastSyncRowsSkipped: integer("last_sync_rows_skipped").notNull().default(0),
  lastSyncError: text("last_sync_error"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type RateSource = typeof rateSourcesTable.$inferSelect;

export const estimatesTable = pgTable("estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  level: varchar("level", { length: 8 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Estimate = typeof estimatesTable.$inferSelect;

export const estimateCostHeadsTable = pgTable("estimate_cost_heads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id")
    .notNull()
    .references(() => estimatesTable.id, { onDelete: "cascade" }),
  headCode: varchar("head_code", { length: 16 }).notNull(),
  headName: varchar("head_name", { length: 128 }).notNull(),
  percentage: numeric("percentage", { precision: 6, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type EstimateCostHead = typeof estimateCostHeadsTable.$inferSelect;

export const boqItemsTable = pgTable("boq_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id")
    .notNull()
    .references(() => estimatesTable.id, { onDelete: "cascade" }),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  dsrRateId: varchar("dsr_rate_id").references(() => dsrRatesTable.id, { onDelete: "set null" }),
  levelType: varchar("level_type", { length: 4 }).notNull().default("L3"),
  trade: varchar("trade", { length: 64 }).notNull(),
  itemCode: varchar("item_code", { length: 32 }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  rate: numeric("rate", { precision: 18, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  actualQuantity: numeric("actual_quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  actualAmount: numeric("actual_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  hsnCode: varchar("hsn_code", { length: 16 }),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  locked: boolean("locked").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type BoqItem = typeof boqItemsTable.$inferSelect;

export const rateAnalysisComponentsTable = pgTable("rate_analysis_components", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  boqItemId: varchar("boq_item_id")
    .notNull()
    .references(() => boqItemsTable.id, { onDelete: "cascade" }),
  componentType: varchar("component_type", { length: 16 }).notNull(),
  description: varchar("description", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  marketRate: numeric("market_rate", { precision: 18, scale: 2 }).notNull().default("0"),
  dsrRate: numeric("dsr_rate", { precision: 18, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type RateAnalysisComponent = typeof rateAnalysisComponentsTable.$inferSelect;

export const workOrderEstimatesTable = pgTable("work_order_estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  l3EstimateId: varchar("l3_estimate_id").references(() => estimatesTable.id, { onDelete: "set null" }),
  subcontractor: varchar("subcontractor", { length: 256 }).notNull(),
  workPackage: varchar("work_package", { length: 256 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  totalBoqAmount: numeric("total_boq_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalNegotiatedAmount: numeric("total_negotiated_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type WorkOrderEstimate = typeof workOrderEstimatesTable.$inferSelect;

export const workOrderEstimateItemsTable = pgTable("work_order_estimate_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderEstimateId: varchar("work_order_estimate_id")
    .notNull()
    .references(() => workOrderEstimatesTable.id, { onDelete: "cascade" }),
  boqItemId: varchar("boq_item_id").references(() => boqItemsTable.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull().default("0"),
  boqRate: numeric("boq_rate", { precision: 18, scale: 2 }).notNull().default("0"),
  negotiatedRate: numeric("negotiated_rate", { precision: 18, scale: 2 }).notNull().default("0"),
  negotiatedAmount: numeric("negotiated_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type WorkOrderEstimateItem = typeof workOrderEstimateItemsTable.$inferSelect;

export const variationOrdersTable = pgTable("variation_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  estimateId: varchar("estimate_id").references(() => estimatesTable.id, { onDelete: "set null" }),
  voNumber: varchar("vo_number", { length: 32 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  scopeChange: text("scope_change"),
  costImpact: numeric("cost_impact", { precision: 18, scale: 2 }).notNull().default("0"),
  programmeImpactDays: integer("programme_impact_days").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  raisedById: varchar("raised_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});
export type VariationOrder = typeof variationOrdersTable.$inferSelect;

// ─────────────────────────────────────────────
// Phase 3 — Financial Core
// ─────────────────────────────────────────────

export const BILL_STATUSES = [
  "draft", "submitted", "technical_check", "qs_scrutiny", "pm_certification",
  "auto_deductions", "gst_invoice", "finance_approval",
  "payment_released", "ledger_posting", "closed",
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const DEDUCTION_TYPES = [
  "tds_194c", "advance_recovery", "retention", "material_issued", "penalty", "lwf",
] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export const PAYMENT_MODES = ["neft", "rtgs", "upi", "cheque"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const LEDGER_ACCOUNT_TYPES = [
  "asset", "liability", "capital", "revenue", "expenditure", "tax",
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const CLIENT_INVOICE_STATUSES = [
  "draft", "sent", "acknowledged", "paid", "overdue",
] as const;
export type ClientInvoiceStatus = (typeof CLIENT_INVOICE_STATUSES)[number];

export const contractorBillsTable = pgTable("contractor_bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => workOrderEstimatesTable.id, { onDelete: "set null" }),
  billNumber: varchar("bill_number", { length: 32 }).notNull(),
  billDate: timestamp("bill_date", { withTimezone: true }).notNull().defaultNow(),
  periodFrom: timestamp("period_from", { withTimezone: true }),
  periodTo: timestamp("period_to", { withTimezone: true }),
  grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 18, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  invoiceUrl: varchar("invoice_url"),
  measurementUrl: varchar("measurement_url"),
  irnNumber: varchar("irn_number", { length: 128 }),
  remarks: text("remarks"),
  technicalRemarks: text("technical_remarks"),
  qsRemarks: text("qs_remarks"),
  pmRemarks: text("pm_remarks"),
  submittedById: varchar("submitted_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  technicalCheckedById: varchar("technical_checked_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  qsScrutinizedById: varchar("qs_scrutinized_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  pmCertifiedById: varchar("pm_certified_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  financeApprovedById: varchar("finance_approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  utr: varchar("utr", { length: 64 }),
  paymentMode: varchar("payment_mode", { length: 16 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  technicalCheckedAt: timestamp("technical_checked_at", { withTimezone: true }),
  qsScrutinizedAt: timestamp("qs_scrutinized_at", { withTimezone: true }),
  pmCertifiedAt: timestamp("pm_certified_at", { withTimezone: true }),
  financeApprovedAt: timestamp("finance_approved_at", { withTimezone: true }),
  ledgerPostedAt: timestamp("ledger_posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type ContractorBill = typeof contractorBillsTable.$inferSelect;

export const billDeductionsTable = pgTable("bill_deductions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // billId references either contractor_bills.id or labour_contractor_bills.id (disambiguated by billKind).
  // No FK constraint: Postgres cannot reference two tables; cleanup is enforced at the application layer.
  billId: varchar("bill_id").notNull(),
  billKind: varchar("bill_kind", { length: 16 }).notNull().default("contractor"),
  deductionType: varchar("deduction_type", { length: 32 }).notNull(),
  description: varchar("description", { length: 256 }).notNull(),
  rate: numeric("rate", { precision: 6, scale: 3 }).notNull().default("0"),
  baseAmount: numeric("base_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  legalRef: varchar("legal_ref", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type BillDeduction = typeof billDeductionsTable.$inferSelect;

export const paymentVouchersTable = pgTable("payment_vouchers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  billId: varchar("bill_id").references(() => contractorBillsTable.id, { onDelete: "cascade" }),
  labourContractorBillId: varchar("labour_contractor_bill_id")
    .references((): any => labourContractorBillsTable.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  voucherNumber: varchar("voucher_number", { length: 32 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  mode: varchar("mode", { length: 16 }).notNull().default("neft"),
  bankName: varchar("bank_name", { length: 128 }),
  accountNumber: varchar("account_number", { length: 32 }),
  ifscCode: varchar("ifsc_code", { length: 16 }),
  utr: varchar("utr", { length: 64 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  releasedById: varchar("released_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PaymentVoucher = typeof paymentVouchersTable.$inferSelect;

export const ledgerAccountsTable = pgTable("ledger_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").references(() => organisationsTable.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  accountCode: varchar("account_code", { length: 16 }).notNull(),
  accountName: varchar("account_name", { length: 128 }).notNull(),
  accountType: varchar("account_type", { length: 32 }).notNull(),
  parentAccountId: varchar("parent_account_id"),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  currentBalance: numeric("current_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LedgerAccount = typeof ledgerAccountsTable.$inferSelect;

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  entryNumber: varchar("entry_number", { length: 32 }).notNull(),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
  entityType: varchar("entity_type", { length: 32 }),
  entityId: varchar("entity_id"),
  narration: text("narration").notNull(),
  debitAccountId: varchar("debit_account_id").references(() => ledgerAccountsTable.id, { onDelete: "set null" }),
  creditAccountId: varchar("credit_account_id").references(() => ledgerAccountsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;

export const clientInvoicesTable = pgTable("client_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
  clientName: varchar("client_name", { length: 256 }).notNull(),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  milestoneId: varchar("milestone_id").references(() => milestonesTable.id, { onDelete: "set null" }),
  grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 }).notNull().default("9"),
  igstRate: numeric("igst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  netAmount: numeric("net_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  retentionHeld: numeric("retention_held", { precision: 18, scale: 2 }).notNull().default("0"),
  amountReceived: numeric("amount_received", { precision: 18, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  irnNumber: varchar("irn_number", { length: 128 }),
  reraReference: varchar("rera_reference", { length: 64 }),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type ClientInvoice = typeof clientInvoicesTable.$inferSelect;

export const gstEntriesTable = pgTable("gst_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: varchar("entity_id").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull().defaultNow(),
  partyGstin: varchar("party_gstin", { length: 32 }),
  partyName: varchar("party_name", { length: 256 }).notNull(),
  taxableValue: numeric("taxable_value", { precision: 18, scale: 2 }).notNull().default("0"),
  cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  cgstAmount: numeric("cgst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  igstRate: numeric("igst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  igstAmount: numeric("igst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalGst: numeric("total_gst", { precision: 18, scale: 2 }).notNull().default("0"),
  hsnCode: varchar("hsn_code", { length: 16 }),
  entryType: varchar("entry_type", { length: 16 }).notNull().default("purchase"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type GstEntry = typeof gstEntriesTable.$inferSelect;

export const tdsEntriesTable = pgTable("tds_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  billId: varchar("bill_id").references(() => contractorBillsTable.id, { onDelete: "set null" }),
  vendorName: varchar("vendor_name", { length: 256 }).notNull(),
  pan: varchar("pan", { length: 16 }),
  sectionCode: varchar("section_code", { length: 16 }).notNull().default("194C"),
  grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 3 }).notNull().default("1"),
  tdsAmount: numeric("tds_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  depositedAt: timestamp("deposited_at", { withTimezone: true }),
  challanNumber: varchar("challan_number", { length: 32 }),
  quarter: varchar("quarter", { length: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type TdsEntry = typeof tdsEntriesTable.$inferSelect;

export const retentionLedgerTable = pgTable("retention_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => workOrderEstimatesTable.id, { onDelete: "set null" }),
  billId: varchar("bill_id").references(() => contractorBillsTable.id, { onDelete: "set null" }),
  transactionType: varchar("transaction_type", { length: 32 }).notNull(),
  retentionHeld: numeric("retention_held", { precision: 18, scale: 2 }).notNull().default("0"),
  retentionReleased: numeric("retention_released", { precision: 18, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RetentionLedger = typeof retentionLedgerTable.$inferSelect;

export const advanceLedgerTable = pgTable("advance_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => workOrderEstimatesTable.id, { onDelete: "set null" }),
  contractorId: varchar("contractor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  billId: varchar("bill_id").references(() => contractorBillsTable.id, { onDelete: "set null" }),
  labourContractorBillId: varchar("labour_contractor_bill_id")
    .references((): any => labourContractorBillsTable.id, { onDelete: "set null" }),
  transactionType: varchar("transaction_type", { length: 32 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AdvanceLedger = typeof advanceLedgerTable.$inferSelect;

// ─────────────────────────────────────────────
// Phase 4 — Supply Chain
// ─────────────────────────────────────────────

export const VENDOR_STATUSES = ["active", "inactive", "blacklisted", "pending_approval"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const INDENT_STATUSES = ["draft", "submitted", "approved", "queried", "cancelled", "fulfilled"] as const;
export type IndentStatus = (typeof INDENT_STATUSES)[number];

export const PO_STATUSES = ["draft", "approved", "sent", "partial", "received", "closed", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const GRN_STATUSES = ["draft", "submitted", "qc_pending", "accepted", "rejected"] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

export const MATERIAL_CATEGORIES = ["cement", "steel", "aggregates", "bricks", "sand", "tiles", "plumbing", "electrical", "hardware", "timber", "glass", "paint", "chemicals", "admixtures", "other"] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const COSTING_METHODS = ["fifo", "wac"] as const;
export type CostingMethod = (typeof COSTING_METHODS)[number];

export const TEST_RESULTS = ["pass", "fail", "pending"] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

// Vendors
export const vendorsTable = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").references(() => organisationsTable.id, { onDelete: "set null" }),
  name: varchar("name", { length: 256 }).notNull(),
  code: varchar("code", { length: 32 }),
  contactPerson: varchar("contact_person", { length: 128 }),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 24 }),
  address: text("address"),
  city: varchar("city", { length: 64 }),
  state: varchar("state", { length: 64 }),
  pincode: varchar("pincode", { length: 8 }),
  gstNumber: varchar("gst_number", { length: 20 }),
  pan: varchar("pan", { length: 12 }),
  msmeCategory: varchar("msme_category", { length: 8 }), // micro/small/medium
  msmeNumber: varchar("msme_number", { length: 32 }),
  bankName: varchar("bank_name", { length: 128 }),
  accountNumber: varchar("account_number", { length: 32 }),
  ifscCode: varchar("ifsc_code", { length: 16 }),
  status: varchar("status", { length: 32 }).notNull().default("pending_approval"),
  performanceScore: numeric("performance_score", { precision: 5, scale: 2 }).default("0"),
  onTimeDeliveryPct: numeric("on_time_delivery_pct", { precision: 5, scale: 2 }).default("0"),
  qualityAcceptancePct: numeric("quality_acceptance_pct", { precision: 5, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").notNull().default(0),
  blacklistReason: text("blacklist_reason"),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Vendor = typeof vendorsTable.$inferSelect;

export const vendorDocumentsTable = pgTable("vendor_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 64 }).notNull(), // gst_cert, pan_card, msme_cert, bank_statement, other
  documentUrl: varchar("document_url"),
  fileName: varchar("file_name", { length: 256 }),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const avlEntriesTable = pgTable("avl_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  materialCategory: varchar("material_category", { length: 64 }),
  addedById: varchar("added_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

// Stores (multi-store per project)
export const storesTable = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  storeType: varchar("store_type", { length: 32 }).notNull().default("site"), // site/main/sub
  location: varchar("location", { length: 256 }),
  storeKeeperName: varchar("store_keeper_name", { length: 128 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Store = typeof storesTable.$inferSelect;

// Inventory Items (material catalog + current stock per store)
export const inventoryItemsTable = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  storeId: varchar("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  itemCode: varchar("item_code", { length: 32 }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }),
  unit: varchar("unit", { length: 32 }).notNull().default("nos"),
  hsnCode: varchar("hsn_code", { length: 16 }),
  minStockLevel: numeric("min_stock_level", { precision: 18, scale: 3 }).notNull().default("0"),
  maxStockLevel: numeric("max_stock_level", { precision: 18, scale: 3 }).notNull().default("0"),
  currentStock: numeric("current_stock", { precision: 18, scale: 3 }).notNull().default("0"),
  costingMethod: varchar("costing_method", { length: 8 }).notNull().default("wac"),
  avgRate: numeric("avg_rate", { precision: 18, scale: 4 }).notNull().default("0"), // WAC rate
  lastPurchaseRate: numeric("last_purchase_rate", { precision: 18, scale: 4 }).notNull().default("0"),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  boqItemId: varchar("boq_item_id").references(() => boqItemsTable.id, { onDelete: "set null" }),
  isReorderTriggered: boolean("is_reorder_triggered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;

// Material Indents
export const materialIndentsTable = pgTable("material_indents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  indentNumber: varchar("indent_number", { length: 32 }).notNull(),
  indentDate: timestamp("indent_date", { withTimezone: true }).notNull().defaultNow(),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  requiredByDate: timestamp("required_by_date", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  remarks: text("remarks"),
  queryRemarks: text("query_remarks"),
  raisedById: varchar("raised_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type MaterialIndent = typeof materialIndentsTable.$inferSelect;

export const indentItemsTable = pgTable("indent_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  indentId: varchar("indent_id").notNull().references(() => materialIndentsTable.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  requiredQty: numeric("required_qty", { precision: 18, scale: 3 }).notNull(),
  availableStock: numeric("available_stock", { precision: 18, scale: 3 }).notNull().default("0"),
  approvedQty: numeric("approved_qty", { precision: 18, scale: 3 }),
  specification: text("specification"),
  boqItemId: varchar("boq_item_id").references(() => boqItemsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type IndentItem = typeof indentItemsTable.$inferSelect;

// RFQ
export const rfqsTable = pgTable("rfqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  rfqNumber: varchar("rfq_number", { length: 32 }).notNull(),
  rfqDate: timestamp("rfq_date", { withTimezone: true }).notNull().defaultNow(),
  indentId: varchar("indent_id").references(() => materialIndentsTable.id, { onDelete: "set null" }),
  submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
  deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
  deliveryLocation: varchar("delivery_location", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft/sent/received/awarded/cancelled
  paymentTerms: varchar("payment_terms", { length: 128 }),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  awardedVendorId: varchar("awarded_vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  awardedAt: timestamp("awarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Rfq = typeof rfqsTable.$inferSelect;

export const rfqItemsTable = pgTable("rfq_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqsTable.id, { onDelete: "cascade" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  requiredQty: numeric("required_qty", { precision: 18, scale: 3 }).notNull(),
  specification: text("specification"),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
});

export const rfqVendorsTable = pgTable("rfq_vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqsTable.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  responseReceived: boolean("response_received").notNull().default(false),
});

export const rfqResponsesTable = pgTable("rfq_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id").notNull().references(() => rfqsTable.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  rfqItemId: varchar("rfq_item_id").references(() => rfqItemsTable.id, { onDelete: "cascade" }),
  unitRate: numeric("unit_rate", { precision: 18, scale: 4 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  leadTimeDays: integer("lead_time_days"),
  deliveryCharges: numeric("delivery_charges", { precision: 18, scale: 2 }).notNull().default("0"),
  validityDays: integer("validity_days"),
  remarks: text("remarks"),
  isL1: boolean("is_l1").notNull().default(false), // lowest quote
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RfqResponse = typeof rfqResponsesTable.$inferSelect;

// Purchase Orders
export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  poNumber: varchar("po_number", { length: 32 }).notNull(),
  poDate: timestamp("po_date", { withTimezone: true }).notNull().defaultNow(),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "restrict" }),
  rfqId: varchar("rfq_id").references(() => rfqsTable.id, { onDelete: "set null" }),
  indentId: varchar("indent_id").references(() => materialIndentsTable.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  deliveryLocation: varchar("delivery_location", { length: 256 }),
  deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
  paymentTerms: varchar("payment_terms", { length: 128 }),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),
  advancePaid: numeric("advance_paid", { precision: 18, scale: 2 }).notNull().default("0"),
  amountReceived: numeric("amount_received", { precision: 18, scale: 2 }).notNull().default("0"),
  version: integer("version").notNull().default(1),
  amendmentReason: text("amendment_reason"),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;

export const poItemsTable = pgTable("po_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poId: varchar("po_id").notNull().references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  orderedQty: numeric("ordered_qty", { precision: 18, scale: 3 }).notNull(),
  receivedQty: numeric("received_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  unitRate: numeric("unit_rate", { precision: 18, scale: 4 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  specification: text("specification"),
  hsnCode: varchar("hsn_code", { length: 16 }),
});
export type PoItem = typeof poItemsTable.$inferSelect;

// GRN
export const grnsTable = pgTable("grns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  grnNumber: varchar("grn_number", { length: 32 }).notNull(),
  grnDate: timestamp("grn_date", { withTimezone: true }).notNull().defaultNow(),
  poId: varchar("po_id").references(() => purchaseOrdersTable.id, { onDelete: "set null" }),
  vendorId: varchar("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  storeId: varchar("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  vehicleNumber: varchar("vehicle_number", { length: 32 }),
  dcNumber: varchar("dc_number", { length: 64 }), // delivery challan
  invoiceNumber: varchar("invoice_number", { length: 64 }),
  invoiceAmount: numeric("invoice_amount", { precision: 18, scale: 2 }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  threeWayMatchStatus: varchar("three_way_match_status", { length: 32 }).default("pending"), // matched/qty_mismatch/rate_mismatch
  threeWayMatchNotes: text("three_way_match_notes"),
  qcHoldCount: integer("qc_hold_count").notNull().default(0),
  photoUrls: text("photo_urls").array(),
  gpsLocation: varchar("gps_location", { length: 128 }),
  receivedById: varchar("received_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Grn = typeof grnsTable.$inferSelect;

export const grnItemsTable = pgTable("grn_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grnId: varchar("grn_id").notNull().references(() => grnsTable.id, { onDelete: "cascade" }),
  poItemId: varchar("po_item_id").references(() => poItemsTable.id, { onDelete: "set null" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  orderedQty: numeric("ordered_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  receivedQty: numeric("received_qty", { precision: 18, scale: 3 }).notNull(),
  acceptedQty: numeric("accepted_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  rejectedQty: numeric("rejected_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  unitRate: numeric("unit_rate", { precision: 18, scale: 4 }).notNull().default("0"),
  batchNumber: varchar("batch_number", { length: 64 }),
  gradeSpecification: varchar("grade_specification", { length: 128 }),
  condition: varchar("condition", { length: 64 }).notNull().default("good"), // good/damaged/partial
  qcHold: boolean("qc_hold").notNull().default(false),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type GrnItem = typeof grnItemsTable.$inferSelect;

// Material Testing
export const materialTestsTable = pgTable("material_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  grnItemId: varchar("grn_item_id").references(() => grnItemsTable.id, { onDelete: "set null" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  testType: varchar("test_type", { length: 64 }).notNull(), // cube_strength/tensile/sieve/proctor/other
  isCode: varchar("is_code", { length: 64 }), // IS:456, IS:1786, etc.
  sampleDate: timestamp("sample_date", { withTimezone: true }),
  testDate: timestamp("test_date", { withTimezone: true }),
  testResult: varchar("test_result", { length: 16 }).notNull().default("pending"),
  requiredValue: numeric("required_value", { precision: 18, scale: 4 }),
  actualValue: numeric("actual_value", { precision: 18, scale: 4 }),
  unit: varchar("unit", { length: 32 }),
  testedById: varchar("tested_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  remarks: text("remarks"),
  certificateUrl: varchar("certificate_url"),
  debitNoteIssued: boolean("debit_note_issued").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type MaterialTest = typeof materialTestsTable.$inferSelect;

// Stock Ledger (movement log)
export const stockLedgerTable = pgTable("stock_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  storeId: varchar("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  transactionType: varchar("transaction_type", { length: 32 }).notNull(), // grn_receipt/issue/return/adjustment/wastage
  entityType: varchar("entity_type", { length: 32 }), // grn/issue/adjustment
  entityId: varchar("entity_id", { length: 64 }),
  qty: numeric("qty", { precision: 18, scale: 3 }).notNull(), // +/- quantity
  rate: numeric("rate", { precision: 18, scale: 4 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  balanceQty: numeric("balance_qty", { precision: 18, scale: 3 }).notNull(),
  narration: text("narration"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type StockLedger = typeof stockLedgerTable.$inferSelect;

// Stock Issues (against approved indent)
export const stockIssuesTable = pgTable("stock_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  issueNumber: varchar("issue_number", { length: 32 }).notNull(),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  indentId: varchar("indent_id").references(() => materialIndentsTable.id, { onDelete: "set null" }),
  storeId: varchar("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  issuedToName: varchar("issued_to_name", { length: 128 }),
  issuedToContractor: varchar("issued_to_contractor", { length: 128 }),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  contractorSignature: varchar("contractor_signature"), // base64 or URL
  notes: text("notes"),
  issuedById: varchar("issued_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type StockIssue = typeof stockIssuesTable.$inferSelect;

export const issueItemsTable = pgTable("issue_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  issueId: varchar("issue_id").notNull().references(() => stockIssuesTable.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  indentItemId: varchar("indent_item_id").references(() => indentItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  issuedQty: numeric("issued_qty", { precision: 18, scale: 3 }).notNull(),
  rate: numeric("rate", { precision: 18, scale: 4 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Wastage Logs
export const wastageLogsTable = pgTable("wastage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  storeId: varchar("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  wasteDate: timestamp("waste_date", { withTimezone: true }).notNull().defaultNow(),
  qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  rate: numeric("rate", { precision: 18, scale: 4 }).notNull().default("0"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  reasonCode: varchar("reason_code", { length: 64 }).notNull(), // breakage/theft/spoilage/excess_mix/other
  description: text("description"),
  normQty: numeric("norm_qty", { precision: 18, scale: 3 }), // allowed wastage per norm
  aboveNorm: boolean("above_norm").notNull().default(false),
  alertSentToPm: boolean("alert_sent_to_pm").notNull().default(false),
  loggedById: varchar("logged_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WastageLog = typeof wastageLogsTable.$inferSelect;

// Rate Contracts (standing POs at agreed rates)
export const rateContractsTable = pgTable("rate_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "restrict" }),
  contractNumber: varchar("contract_number", { length: 32 }).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItemsTable.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 256 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  agreedRate: numeric("agreed_rate", { precision: 18, scale: 4 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  maxQty: numeric("max_qty", { precision: 18, scale: 3 }),
  usedQty: numeric("used_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RateContract = typeof rateContractsTable.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 — WORKFORCE, QUALITY & SAFETY
// ─────────────────────────────────────────────────────────────────────────────

export const WORKER_TRADES = ["mason","carpenter","plumber","electrician","welder","painter","steel_fixer","helper","operator","driver","supervisor","other"] as const;
export type WorkerTrade = (typeof WORKER_TRADES)[number];

export const WORKER_SKILL_LEVELS = ["unskilled","semi_skilled","skilled","highly_skilled"] as const;
export const WORKER_STATUSES = ["active","inactive","terminated"] as const;

export const workersTable = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  contractorId: varchar("contractor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  workerCode: varchar("worker_code", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  aadhaarNumber: varchar("aadhaar_number", { length: 16 }),
  phone: varchar("phone", { length: 16 }),
  email: varchar("email", { length: 128 }),
  dob: timestamp("dob", { withTimezone: true }),
  gender: varchar("gender", { length: 16 }),
  trade: varchar("trade", { length: 32 }).notNull().default("helper"),
  skillLevel: varchar("skill_level", { length: 32 }).notNull().default("unskilled"),
  dailyRate: numeric("daily_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  otRate: numeric("ot_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  bocwRegNumber: varchar("bocw_reg_number", { length: 32 }),
  pfNumber: varchar("pf_number", { length: 32 }),
  uan: varchar("uan", { length: 12 }),
  esiNumber: varchar("esi_number", { length: 32 }),
  bankName: varchar("bank_name", { length: 64 }),
  accountNumber: varchar("account_number", { length: 32 }),
  ifscCode: varchar("ifsc_code", { length: 16 }),
  state: varchar("state", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  registeredById: varchar("registered_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqAadhaar: uniqueIndex("workers_org_aadhaar_uq").on(t.organisationId, t.aadhaarNumber).where(sql`${t.aadhaarNumber} IS NOT NULL`),
  uniqPf: uniqueIndex("workers_org_pf_uq").on(t.organisationId, t.pfNumber).where(sql`${t.pfNumber} IS NOT NULL`),
  uniqUan: uniqueIndex("workers_org_uan_uq").on(t.organisationId, t.uan).where(sql`${t.uan} IS NOT NULL`),
  uniqEsi: uniqueIndex("workers_org_esi_uq").on(t.organisationId, t.esiNumber).where(sql`${t.esiNumber} IS NOT NULL`),
}));
export type Worker = typeof workersTable.$inferSelect;

export const workerDocumentsTable = pgTable("worker_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 32 }).notNull(),
  documentUrl: varchar("document_url", { length: 512 }),
  fileName: varchar("file_name", { length: 256 }),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  attendanceDate: timestamp("attendance_date", { withTimezone: true }).notNull(),
  markInTime: timestamp("mark_in_time", { withTimezone: true }),
  markOutTime: timestamp("mark_out_time", { withTimezone: true }),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),
  withinGeofence: boolean("within_geofence").notNull().default(true),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }).notNull().default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  otApproved: boolean("ot_approved").notNull().default(false),
  otApprovedById: varchar("ot_approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;

export const payrollPeriodsTable = pgTable("payroll_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  periodName: varchar("period_name", { length: 64 }).notNull(),
  periodType: varchar("period_type", { length: 16 }).notNull().default("monthly"),
  fromDate: timestamp("from_date", { withTimezone: true }).notNull(),
  toDate: timestamp("to_date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  totalGross: numeric("total_gross", { precision: 18, scale: 2 }).notNull().default("0"),
  totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 18, scale: 2 }).notNull().default("0"),
  processedById: varchar("processed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PayrollPeriod = typeof payrollPeriodsTable.$inferSelect;

export const payrollLinesTable = pgTable("payroll_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => payrollPeriodsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  presentDays: numeric("present_days", { precision: 5, scale: 2 }).notNull().default("0"),
  otHours: numeric("ot_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  basicWages: numeric("basic_wages", { precision: 14, scale: 2 }).notNull().default("0"),
  otAmount: numeric("ot_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  grossWages: numeric("gross_wages", { precision: 14, scale: 2 }).notNull().default("0"),
  epfEmployee: numeric("epf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
  epfEmployer: numeric("epf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
  esiEmployee: numeric("esi_employee", { precision: 12, scale: 2 }).notNull().default("0"),
  esiEmployer: numeric("esi_employer", { precision: 12, scale: 2 }).notNull().default("0"),
  pt: numeric("pt", { precision: 12, scale: 2 }).notNull().default("0"),
  lwf: numeric("lwf", { precision: 12, scale: 2 }).notNull().default("0"),
  tdsOnWages: numeric("tds_on_wages", { precision: 12, scale: 2 }).notNull().default("0"),
  advanceDeduction: numeric("advance_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
  netWages: numeric("net_wages", { precision: 14, scale: 2 }).notNull().default("0"),
  remarks: text("remarks"),
  locked: boolean("locked").notNull().default(false),
  lockedReason: varchar("locked_reason", { length: 256 }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PayrollLine = typeof payrollLinesTable.$inferSelect;

export const wageSlipsTable = pgTable("wage_slips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => payrollPeriodsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  slipNumber: varchar("slip_number", { length: 32 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wageSlipDeliveriesTable = pgTable("wage_slip_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => payrollPeriodsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  slipId: varchar("slip_id").references(() => wageSlipsTable.id, { onDelete: "set null" }),
  channel: varchar("channel", { length: 16 }).notNull().default("email"),
  recipient: varchar("recipient", { length: 256 }),
  status: varchar("status", { length: 16 }).notNull(),
  errorMessage: text("error_message"),
  messageId: varchar("message_id", { length: 256 }),
  attempts: integer("attempts").notNull().default(1),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  triggeredById: varchar("triggered_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WageSlipDelivery = typeof wageSlipDeliveriesTable.$inferSelect;

export const epfEntriesTable = pgTable("epf_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => payrollPeriodsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  wages: numeric("wages", { precision: 14, scale: 2 }).notNull().default("0"),
  epfEmployee: numeric("epf_employee", { precision: 12, scale: 2 }).notNull().default("0"),
  epfEmployer: numeric("epf_employer", { precision: 12, scale: 2 }).notNull().default("0"),
  epfAdmin: numeric("epf_admin", { precision: 12, scale: 2 }).notNull().default("0"),
  totalEpf: numeric("total_epf", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const esiEntriesTable = pgTable("esi_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => payrollPeriodsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  wages: numeric("wages", { precision: 14, scale: 2 }).notNull().default("0"),
  esiEmployee: numeric("esi_employee", { precision: 12, scale: 2 }).notNull().default("0"),
  esiEmployer: numeric("esi_employer", { precision: 12, scale: 2 }).notNull().default("0"),
  totalEsi: numeric("total_esi", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Quality — ITP
export const CHECKPOINT_TYPES = ["hold","witness","review"] as const;
export type CheckpointType = (typeof CHECKPOINT_TYPES)[number];

export const itpsTable = pgTable("itps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  title: varchar("title", { length: 256 }).notNull(),
  revision: varchar("revision", { length: 16 }).notNull().default("0"),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Itp = typeof itpsTable.$inferSelect;

export const itpItemsTable = pgTable("itp_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itpId: varchar("itp_id").notNull().references(() => itpsTable.id, { onDelete: "cascade" }),
  sequenceNo: integer("sequence_no").notNull().default(1),
  activityDescription: varchar("activity_description", { length: 512 }).notNull(),
  checkPointType: varchar("check_point_type", { length: 16 }).notNull().default("witness"),
  acceptanceCriteria: text("acceptance_criteria"),
  referenceCode: varchar("reference_code", { length: 64 }),
  frequency: varchar("frequency", { length: 64 }),
  responsible: varchar("responsible", { length: 64 }),
  inspector: varchar("inspector", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ItpItem = typeof itpItemsTable.$inferSelect;

export const inspectionRequestsTable = pgTable("inspection_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  itpItemId: varchar("itp_item_id").references(() => itpItemsTable.id, { onDelete: "set null" }),
  irNumber: varchar("ir_number", { length: 32 }).notNull(),
  raisedById: varchar("raised_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  inspectionDate: timestamp("inspection_date", { withTimezone: true }).notNull(),
  location: varchar("location", { length: 256 }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  result: varchar("result", { length: 16 }),
  inspectedById: varchar("inspected_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }),
  notes: text("notes"),
  gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
  gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type InspectionRequest = typeof inspectionRequestsTable.$inferSelect;

export const inspectionChecklistsTable = pgTable("inspection_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  irId: varchar("ir_id").notNull().references(() => inspectionRequestsTable.id, { onDelete: "cascade" }),
  parameter: varchar("parameter", { length: 256 }).notNull(),
  acceptanceCriteria: text("acceptance_criteria"),
  observed: text("observed"),
  passed: boolean("passed"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const NCR_STATUSES = ["open","capa_submitted","re_inspection","closed"] as const;
export type NcrStatus = (typeof NCR_STATUSES)[number];

export const ncrsTable = pgTable("ncrs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  irId: varchar("ir_id").references(() => inspectionRequestsTable.id, { onDelete: "set null" }),
  ncrNumber: varchar("ncr_number", { length: 32 }).notNull(),
  raisedById: varchar("raised_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  trade: varchar("trade", { length: 32 }),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("minor"),
  rootCause: text("root_cause"),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  reworkCost: numeric("rework_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Ncr = typeof ncrsTable.$inferSelect;

export const ncrActionsTable = pgTable("ncr_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ncrId: varchar("ncr_id").notNull().references(() => ncrsTable.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 32 }).notNull().default("capa"),
  description: text("description").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  responsibleId: varchar("responsible_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Safety
export const PERMIT_TYPES = ["hot_work","height","confined_space","electrical","excavation"] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export const safetyPermitsTable = pgTable("safety_permits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  permitType: varchar("permit_type", { length: 32 }).notNull(),
  permitNumber: varchar("permit_number", { length: 32 }).notNull(),
  workDescription: text("work_description").notNull(),
  location: varchar("location", { length: 256 }),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  applicantId: varchar("applicant_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  hazards: text("hazards"),
  precautions: text("precautions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SafetyPermit = typeof safetyPermitsTable.$inferSelect;

export const hiraEntriesTable = pgTable("hira_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  hazardDescription: text("hazard_description").notNull(),
  hazardCategory: varchar("hazard_category", { length: 64 }),
  likelihood: integer("likelihood").notNull().default(1),
  severity: integer("severity").notNull().default(1),
  riskScore: integer("risk_score").notNull().default(1),
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
  controlMeasures: text("control_measures"),
  residualLikelihood: integer("residual_likelihood").notNull().default(1),
  residualSeverity: integer("residual_severity").notNull().default(1),
  residualRiskScore: integer("residual_risk_score").notNull().default(1),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type HiraEntry = typeof hiraEntriesTable.$inferSelect;

export const jsaEntriesTable = pgTable("jsa_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  wbsActivityId: varchar("wbs_activity_id").references(() => wbsActivitiesTable.id, { onDelete: "set null" }),
  jsaDate: timestamp("jsa_date", { withTimezone: true }).notNull(),
  preparedById: varchar("prepared_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  supervisorId: varchar("supervisor_id").references(() => usersTable.id, { onDelete: "set null" }),
  workersPresent: integer("workers_present").notNull().default(0),
  steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  supervisorSignature: varchar("supervisor_signature", { length: 128 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type JsaEntry = typeof jsaEntriesTable.$inferSelect;

export const PPE_TYPES = ["helmet","vest","gloves","boots","harness","goggles","ear_protection","face_shield","respirator"] as const;
export type PpeType = (typeof PPE_TYPES)[number];

export const ppeIssuesTable = pgTable("ppe_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  ppeType: varchar("ppe_type", { length: 32 }).notNull(),
  issuedDate: timestamp("issued_date", { withTimezone: true }).notNull(),
  returnedDate: timestamp("returned_date", { withTimezone: true }),
  condition: varchar("condition", { length: 16 }).notNull().default("new"),
  issuedById: varchar("issued_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PpeIssue = typeof ppeIssuesTable.$inferSelect;

export const INCIDENT_CLASSIFICATIONS = ["near_miss","first_aid","lti","fatality","property_damage"] as const;
export type IncidentClassification = (typeof INCIDENT_CLASSIFICATIONS)[number];

export const incidentsTable = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  incidentNumber: varchar("incident_number", { length: 32 }).notNull(),
  incidentDate: timestamp("incident_date", { withTimezone: true }).notNull(),
  reportedById: varchar("reported_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  classification: varchar("classification", { length: 32 }).notNull().default("near_miss"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 256 }),
  injured: text("injured"),
  lostDays: integer("lost_days").notNull().default(0),
  rootCause: text("root_cause"),
  immediateAction: text("immediate_action"),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Incident = typeof incidentsTable.$inferSelect;

export const incidentActionsTable = pgTable("incident_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: varchar("incident_id").notNull().references(() => incidentsTable.id, { onDelete: "cascade" }),
  actionDescription: text("action_description").notNull(),
  responsibleId: varchar("responsible_id").references(() => usersTable.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Quality Tests (IS-code based material testing register)
export const IS_CODE_TEST_TYPES = ["concrete_cube_7","concrete_cube_14","concrete_cube_28","tensile","sieve_analysis","proctor","water_absorption","compression_brick","cbr"] as const;
export type IsCodeTestType = (typeof IS_CODE_TEST_TYPES)[number];

// IS code limits lookup (simplified — key tests)
export const IS_CODE_LIMITS: Record<string, { ref: string; unit: string; minValue?: number; maxValue?: number }> = {
  concrete_cube_7:   { ref: "IS 456:2000 Cl 15.4",   unit: "N/mm²", minValue: 16 },
  concrete_cube_14:  { ref: "IS 456:2000 Cl 15.4",   unit: "N/mm²", minValue: 22 },
  concrete_cube_28:  { ref: "IS 456:2000 Cl 15.4",   unit: "N/mm²", minValue: 25 },
  tensile:           { ref: "IS 1786:2008",           unit: "N/mm²", minValue: 500 },
  sieve_analysis:    { ref: "IS 383:2016 Zone II",    unit: "% FM",  minValue: 2.6, maxValue: 3.2 },
  proctor:           { ref: "IS 2720 Part 7",         unit: "kN/m³", minValue: 18 },
  water_absorption:  { ref: "IS 1077:1992 Cl 8",     unit: "%",     maxValue: 20 },
  compression_brick: { ref: "IS 1077:1992 Cl 7.1",   unit: "N/mm²", minValue: 3.5 },
  cbr:               { ref: "IRC 37:2012",            unit: "%",     minValue: 8 },
};

export const qualityTestsTable = pgTable("quality_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  irId: varchar("ir_id").references(() => inspectionRequestsTable.id, { onDelete: "set null" }),
  itpItemId: varchar("itp_item_id").references(() => itpItemsTable.id, { onDelete: "set null" }),
  testType: varchar("test_type", { length: 32 }).notNull(),
  isCodeRef: varchar("is_code_ref", { length: 128 }),
  sampleId: varchar("sample_id", { length: 32 }),
  sampleLocation: varchar("sample_location", { length: 256 }),
  sampleDate: timestamp("sample_date", { withTimezone: true }),
  testDate: timestamp("test_date", { withTimezone: true }),
  labName: varchar("lab_name", { length: 128 }),
  testUnit: varchar("test_unit", { length: 16 }),
  testValue: numeric("test_value", { precision: 14, scale: 4 }),
  minAcceptable: numeric("min_acceptable", { precision: 14, scale: 4 }),
  maxAcceptable: numeric("max_acceptable", { precision: 14, scale: 4 }),
  passed: boolean("passed"),
  remarks: text("remarks"),
  conductedById: varchar("conducted_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type QualityTest = typeof qualityTestsTable.$inferSelect;

// Labour Contractor Bill (contractor submission → attendance cross-verification → PM approval)
export const CONTRACTOR_BILL_STATUSES = ["draft","submitted","under_review","approved","rejected"] as const;
export type ContractorBillWorkforceStatus = (typeof CONTRACTOR_BILL_STATUSES)[number];

export const labourContractorBillsTable = pgTable("labour_contractor_bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  contractorId: varchar("contractor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  periodId: varchar("period_id").references(() => payrollPeriodsTable.id, { onDelete: "set null" }),
  billNumber: varchar("bill_number", { length: 32 }).notNull(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  claimedHeadcount: integer("claimed_headcount").notNull().default(0),
  claimedDays: numeric("claimed_days", { precision: 10, scale: 2 }).notNull().default("0"),
  claimedAmount: numeric("claimed_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  verifiedHeadcount: integer("verified_headcount"),
  verifiedDays: numeric("verified_days", { precision: 10, scale: 2 }),
  verifiedAmount: numeric("verified_amount", { precision: 18, scale: 2 }),
  grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }),
  totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 }),
  netPayable: numeric("net_payable", { precision: 18, scale: 2 }),
  discrepancyNotes: text("discrepancy_notes"),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  submittedById: varchar("submitted_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LabourContractorBill = typeof labourContractorBillsTable.$inferSelect;

export const _zUserRole = z.enum(USER_ROLES);

// ============================================================
// PRE-AWARD: LEADS
// ============================================================
export const LEAD_STAGES = ["prospect","qualified","proposal","negotiation","won","lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_SOURCES = ["direct","referral","portal","tender_notice","repeat_client","other"] as const;

export const leadsTable = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 256 }).notNull(),
  clientName: varchar("client_name", { length: 256 }).notNull(),
  clientContact: varchar("client_contact", { length: 128 }),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  location: varchar("location", { length: 256 }),
  workType: varchar("work_type", { length: 128 }),
  estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 }),
  stage: varchar("stage", { length: 32 }).notNull().default("prospect"),
  source: varchar("source", { length: 32 }).notNull().default("direct"),
  probability: integer("probability").notNull().default(20),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  notes: text("notes"),
  assignedToId: varchar("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
  convertedToProjectId: varchar("converted_to_project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  lostReason: text("lost_reason"),
  customerId: varchar("customer_id"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Lead = typeof leadsTable.$inferSelect;

// ============================================================
// PRE-AWARD: TENDERS
// ============================================================
export const TENDER_TYPES = ["open","limited","single","emd_exempt"] as const;
export const TENDER_STATUSES = ["upcoming","in_progress","submitted","under_evaluation","won","lost","cancelled"] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const tendersTable = pgTable("tenders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  leadId: varchar("lead_id"),
  quotationId: varchar("quotation_id"),
  nitNumber: varchar("nit_number", { length: 64 }),
  title: varchar("title", { length: 512 }).notNull(),
  tenderingAuthority: varchar("tendering_authority", { length: 256 }),
  tenderType: varchar("tender_type", { length: 32 }).notNull().default("open"),
  workType: varchar("work_type", { length: 128 }),
  location: varchar("location", { length: 256 }),
  estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 }),
  emdAmount: numeric("emd_amount", { precision: 18, scale: 2 }),
  documentFee: numeric("document_fee", { precision: 18, scale: 2 }),
  documentFeeMode: varchar("document_fee_mode", { length: 32 }),
  bidSubmissionDate: timestamp("bid_submission_date", { withTimezone: true }),
  openingDate: timestamp("opening_date", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("upcoming"),
  ourBidAmount: numeric("our_bid_amount", { precision: 18, scale: 2 }),
  l1Amount: numeric("l1_amount", { precision: 18, scale: 2 }),
  loaDate: timestamp("loa_date", { withTimezone: true }),
  loaReference: varchar("loa_reference", { length: 128 }),
  emdRefunded: boolean("emd_refunded").notNull().default(false),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  assignedToId: varchar("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
  convertedToProjectId: varchar("converted_to_project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Tender = typeof tendersTable.$inferSelect;

// ============================================================
// PRE-AWARD: CUSTOMERS
// ============================================================
export const CLIENT_TYPES = ["govt","psu","private","ngo","other"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const customersTable = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  leadId: varchar("lead_id"),
  name: varchar("name", { length: 256 }).notNull(),
  contactPerson: varchar("contact_person", { length: 128 }),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  gstin: varchar("gstin", { length: 15 }),
  pan: varchar("pan", { length: 10 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  pincode: varchar("pincode", { length: 8 }),
  clientType: varchar("client_type", { length: 32 }).notNull().default("private"),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Customer = typeof customersTable.$inferSelect;

// ============================================================
// PRE-AWARD: PRE-ESTIMATIONS
// ============================================================
export const PRE_ESTIMATION_STATUSES = ["draft","under_review","approved","rejected"] as const;
export type PreEstimationStatus = (typeof PRE_ESTIMATION_STATUSES)[number];

export const preEstimationsTable = pgTable("pre_estimations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id"),
  leadId: varchar("lead_id"),
  title: varchar("title", { length: 512 }).notNull(),
  workType: varchar("work_type", { length: 128 }),
  location: varchar("location", { length: 256 }),
  scopeDescription: text("scope_description"),
  preliminaryValue: numeric("preliminary_value", { precision: 18, scale: 2 }),
  estimationMethod: varchar("estimation_method", { length: 32 }).notNull().default("parametric"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  approvedById: varchar("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type PreEstimation = typeof preEstimationsTable.$inferSelect;

// ============================================================
// PRE-AWARD: QUOTATIONS
// ============================================================
export const QUOTATION_STATUSES = ["draft","sent","accepted","rejected","expired"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const quotationsTable = pgTable("quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
  preEstimationId: varchar("pre_estimation_id"),
  customerId: varchar("customer_id"),
  leadId: varchar("lead_id"),
  quotationNumber: varchar("quotation_number", { length: 64 }),
  title: varchar("title", { length: 512 }).notNull(),
  totalValue: numeric("total_value", { precision: 18, scale: 2 }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  notes: text("notes"),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Quotation = typeof quotationsTable.$inferSelect;

// ============================================================
// SAAS: SUBSCRIPTION PLANS & TENANT SUBSCRIPTIONS
// ============================================================

/**
 * Catalogue of plans available on the platform (free, professional, enterprise…).
 * limits / features are stored as JSONB so they can be extended without schema migrations.
 *
 * limits shape: { maxProjects: number|null, maxUsers: number|null, maxStorageGb: number|null }
 * features shape: { [featureFlag: string]: boolean }
 */
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  priceMonthly: numeric("price_monthly", { precision: 12, scale: 2 }).notNull().default("0"),
  limits: jsonb("limits")
    .$type<{ maxProjects: number | null; maxUsers: number | null; maxStorageGb: number | null }>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  features: jsonb("features")
    .$type<Record<string, boolean>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled", "suspended"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * One active subscription row per organisation. Links the org to a plan and
 * records billing period / trial window.
 */
export const tenantSubscriptionsTable = pgTable("tenant_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id")
    .notNull()
    .unique()
    .references(() => organisationsTable.id, { onDelete: "cascade" }),
  planId: varchar("plan_id")
    .notNull()
    .references(() => subscriptionPlansTable.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  // Optional per-tenant plan limit overrides (set by super_admin for enterprise deals).
  limitsOverride: jsonb("limits_override")
    .$type<{ maxProjects?: number | null; maxUsers?: number | null; maxStorageGb?: number | null }>()
    .default(sql`NULL`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type TenantSubscription = typeof tenantSubscriptionsTable.$inferSelect;

// ============================================================
// SAAS: TENANT INVITATIONS
// ============================================================

/**
 * Email invitations for joining an organisation.
 * Tokens are cryptographically random hex strings (32 bytes → 64 hex chars).
 * Accepting an invitation creates/joins a user and assigns them to the org.
 */
export const tenantInvitationsTable = pgTable("tenant_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organisationId: varchar("organisation_id")
    .notNull()
    .references(() => organisationsTable.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 256 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("site_engineer"),
  token: varchar("token", { length: 128 }).notNull().unique(),
  createdById: varchar("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByUserId: varchar("accepted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type TenantInvitation = typeof tenantInvitationsTable.$inferSelect;

// ============================================================
// UNIVERSAL AUDIT: STATUS HISTORY
// ============================================================
export const statusHistoryTable = pgTable("status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: varchar("entity_id").notNull(),
  fromStatus: varchar("from_status", { length: 64 }),
  toStatus: varchar("to_status", { length: 64 }).notNull(),
  changedById: varchar("changed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type StatusHistory = typeof statusHistoryTable.$inferSelect;
