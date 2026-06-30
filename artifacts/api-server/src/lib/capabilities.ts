// Capability catalog — the hand-pickable units used by custom roles.
//
// Naming convention: `<domain>:<verb>`. Keep groups stable; UI uses `group`
// to render the picker in collapsible sections. Adding a new capability:
// 1) Add it here, 2) wire `requireCapability("...")` (or `hasCapability(...)`)
// in the relevant route, 3) add it to the BUILTIN_ROLE_PRESETS map below for
// every built-in role that should have it by default.
//
// Built-in role still drives org/admin gates (admin tab, user CRUD, etc).
// A user's custom role layers ADDITIVELY on top of that built-in baseline:
// effective caps = preset(builtinRole) ∪ permissions(customRole).

export type Capability =
  | "project:create"
  | "project:approve"
  | "project:transition"
  | "project:complete"
  | "vo:approve"
  | "dpr:create"
  | "dpr:edit"
  | "dpr:approve"
  | "financial:view"
  | "financial:edit"
  | "workforce:edit"
  | "supply_chain:edit"
  | "roles:manage";

export interface CapabilityDef {
  key: Capability;
  group: "Projects" | "Approvals" | "DPRs" | "Financial" | "Workforce" | "Supply Chain" | "Admin";
  label: string;
  description: string;
}

export const CAPABILITIES: ReadonlyArray<CapabilityDef> = [
  { key: "project:create",     group: "Projects",     label: "Create projects",          description: "Initiate new projects (filed for admin approval unless auto-approve role)." },
  { key: "project:transition", group: "Projects",     label: "Advance project status",   description: "Move projects through on-track / at-risk / delayed / on-hold." },
  { key: "project:complete",   group: "Projects",     label: "Mark project complete",    description: "Move a project to the completed state." },
  { key: "project:approve",    group: "Approvals",    label: "Approve project requests", description: "Approve or reject pending-approval projects in the inbox." },
  { key: "vo:approve",         group: "Approvals",    label: "Approve variation orders", description: "Approve or reject submitted VOs." },
  { key: "dpr:approve",        group: "Approvals",    label: "Approve DPRs",             description: "Approve or reject submitted daily progress reports." },
  { key: "dpr:create",         group: "DPRs",         label: "Create DPRs",              description: "Draft and submit daily progress reports." },
  { key: "dpr:edit",           group: "DPRs",         label: "Edit DPRs",                description: "Modify DPRs that are still in draft." },
  { key: "financial:view",     group: "Financial",    label: "View financial data",      description: "Read access to bills, invoices, ledger, reports." },
  { key: "financial:edit",     group: "Financial",    label: "Edit financial entries",   description: "Create / modify bills, invoices, ledger entries." },
  { key: "workforce:edit",     group: "Workforce",    label: "Edit workforce",           description: "Manage workers, attendance, payroll periods." },
  { key: "supply_chain:edit",  group: "Supply Chain", label: "Edit supply chain",        description: "Create / edit indents, RFQs, POs, GRNs, stock entries." },
  { key: "roles:manage",       group: "Admin",        label: "Manage custom roles",      description: "Create / edit / delete this organisation's custom roles." },
];

const CAP_SET: ReadonlySet<string> = new Set(CAPABILITIES.map((c) => c.key));

export function isCapability(x: unknown): x is Capability {
  return typeof x === "string" && CAP_SET.has(x);
}

export function sanitizeCapabilityList(input: unknown): Capability[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Capability[] = [];
  for (const k of input) {
    if (isCapability(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// Baseline capabilities granted by each built-in role.
// Super_admin / admin get every capability implicitly (see effectiveCaps).
export const BUILTIN_ROLE_PRESETS: Record<string, Capability[]> = {
  super_admin: [], // wildcard — see effectiveCaps
  admin:       [], // wildcard — see effectiveCaps
  owner:       ["project:create", "project:transition", "project:approve", "vo:approve", "dpr:approve", "financial:view", "financial:edit"],
  pm:          ["project:create", "project:transition", "dpr:create", "dpr:edit", "workforce:edit", "supply_chain:edit"],
  qs:          ["dpr:create", "dpr:edit", "financial:view"],
  finance:     ["financial:view", "financial:edit", "vo:approve"],
  contractor:  ["dpr:create"],
  qc:          ["dpr:create", "dpr:edit"],
  site_engineer: ["dpr:create", "dpr:edit", "workforce:edit"],
  store:       ["supply_chain:edit"],
  hr:          ["workforce:edit"],
  viewer:      [],
};

const ADMIN_WILDCARD = new Set(["super_admin", "admin"]);

/** Effective capability set for a user = preset(builtinRole) ∪ customRolePerms. */
export function effectiveCaps(
  builtinRole: string | null | undefined,
  customRolePerms: string[] | null | undefined,
): Set<Capability> {
  // Admins / super_admins get every capability.
  if (builtinRole && ADMIN_WILDCARD.has(builtinRole)) {
    return new Set(CAPABILITIES.map((c) => c.key));
  }
  const out = new Set<Capability>();
  if (builtinRole && BUILTIN_ROLE_PRESETS[builtinRole]) {
    for (const c of BUILTIN_ROLE_PRESETS[builtinRole]) out.add(c);
  }
  if (Array.isArray(customRolePerms)) {
    for (const k of customRolePerms) if (isCapability(k)) out.add(k);
  }
  return out;
}
