# KattidaCore — Application Workflow Reference

*Mystics Civil construction operations cockpit.*

This document describes every module in KattidaCore, the user roles that operate
it, and the end-to-end workflows that move work from creation to completion.
It is intended for project managers, administrators, and new team members who
need a single, complete picture of how the platform behaves.

---

## 1. Platform Overview

KattidaCore is a multi-tenant web application for managing construction
projects end-to-end. The platform is organised around three concepts:

| Concept | Meaning |
|---|---|
| **Organisation** | A tenant — typically a contracting firm. All data is scoped to an organisation. |
| **Project** | A construction project belonging to one organisation. |
| **User** | A person with a login. Users belong to an organisation and hold one built-in role plus an optional custom role. |

A user sees only the projects, modules and capabilities granted to them by
their organisation, their role(s), and the project access list.

---

## 2. Identity, Roles & Access Control

### 2.1 Built-in roles (one per user)

The built-in role drives the major admin gates (who can manage users, who can
approve, who bypasses per-project access checks).

| Role | Purpose | Bypasses per-project access? |
|---|---|---|
| `super_admin` | Platform operator. Sees and manages every organisation. | Yes (across all orgs) |
| `admin` | Organisation administrator. Manages users, projects, roles in their org. | Yes (within org) |
| `owner` | Site / project owner. Strategic oversight, approvals. | Yes (within org) |
| `pm` | Project Manager. Day-to-day project execution. | No |
| `site_engineer` | Site execution, daily reports, attendance. | No |
| `qs` | Quantity Surveyor. BOQ, estimation, bill verification. | No |
| `finance` | Bills, payments, ledger, invoices. | No |
| `contractor` | External contractor. Submits DPRs, views own scope. | No |
| `qc` | Quality Control. Inspections, NCRs. | No |
| `store` | Storekeeper. Stock, GRN, issues. | No |
| `hr` | Workforce, payroll. | No |
| `viewer` | Read-only stakeholder. | No |

### 2.2 Custom roles (optional, additive)

Administrators may define **org-scoped custom roles** (e.g. "Junior PM",
"Site Auditor") with a hand-picked set of capabilities. A user's effective
capability set is:

```
effective capabilities = preset(built-in role)  ∪  custom role permissions
```

Custom roles **add** capabilities — they never remove them. Admins and
super-admins implicitly hold every capability.

### 2.3 Capability catalog

The capability is the smallest enforceable permission. There are currently
**13 capabilities**, grouped by domain:

| Group | Capability | What it grants |
|---|---|---|
| Projects | `project:create` | Create new projects (filed for approval if not auto-approve role) |
| Projects | `project:transition` | Move a project through on-track / at-risk / delayed / on-hold |
| Projects | `project:complete` | Mark a project as completed |
| Approvals | `project:approve` | Approve or reject pending-approval projects |
| Approvals | `vo:approve` | Approve or reject variation orders |
| Approvals | `dpr:approve` | Approve or reject daily progress reports |
| DPRs | `dpr:create` | Draft and submit DPRs |
| DPRs | `dpr:edit` | Modify DPRs still in draft |
| Financial | `financial:view` | Read bills, invoices, ledger |
| Financial | `financial:edit` | Create / modify bills, invoices, ledger entries |
| Workforce | `workforce:edit` | Manage workers, attendance, payroll |
| Supply Chain | `supply_chain:edit` | Create / edit indents, RFQs, POs, GRNs, stock |
| Admin | `roles:manage` | Create / edit / delete custom roles in the org |

### 2.4 Access gates (in evaluation order)

1. **Authentication** — Session cookie + password hash (bcrypt, 12 rounds).
2. **Organisation scope** — Non-super users see only their own organisation's
   data.
3. **Module access** — Each organisation has an enabled-modules list; each
   project may override it. Disabled modules return 403.
4. **Project access** — For roles that do not bypass, the user must hold a
   row in `project_access` for the project.
5. **Capability check** — Specific actions require a capability (built-in
   preset or granted via custom role).

### 2.5 Demo accounts

A seed script (`seed-rbac.ts`) provisions one user per built-in role in the
*Demo Construction Co* organisation, plus a super-admin in *Mystics Civil HQ*.
Shared password: `MysticsCivil@2026`.

---

## 3. Organisation Management

| Feature | Who | What |
|---|---|---|
| Create / edit organisation | super_admin | Name, legal name, GSTIN, PAN, address |
| Set project quota (`max_projects`) | super_admin | Caps how many projects the org may own |
| Toggle enabled modules | super_admin | Org-wide module visibility |
| View org stats | admin, super_admin | User count, project count vs quota |

**Quota enforcement:** When `project_count >= max_projects`, new project
creation is blocked until the quota is raised.

---

## 4. Project Lifecycle

### 4.1 States

```
                       ┌───────────────┐
        Create ───────►│ pending       │
                       │  _approval    │
                       └─────┬─────────┘
                  reject     │ approve
                       ◄─────┤
                             ▼
                       ┌───────────────┐
                       │ not_started   │
                       └─────┬─────────┘
                             │ (work begins)
                             ▼
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          on_track ◄──► at_risk ◄──► delayed ◄──► on_hold
                             │
                             ▼
                       ┌───────────────┐
                       │ completed     │
                       └───────────────┘
```

### 4.2 Workflow

1. **Create** — Anyone with `project:create` files a project. If the creator
   is `owner` / `admin` / `super_admin`, it is auto-approved into
   `not_started`. Otherwise it lands in `pending_approval` and an entry is
   written to the **Approvals Inbox**.
2. **Approve / reject** — A user with `project:approve` (or admin/owner)
   resolves the inbox item. Approval moves the project to `not_started`;
   rejection terminates it.
3. **Health transitions** — A user with `project:transition` moves the
   project between `on_track`, `at_risk`, `delayed`, `on_hold` as conditions
   change. Each transition is logged.
4. **Resubmit from on-hold** — Bringing a project off hold re-opens its
   approval workflow if the on-hold was tied to a governance issue.
5. **Complete** — `project:complete` closes the project. Completed projects
   are read-only.

### 4.3 Quotas & access

* Each new project counts toward the organisation's `max_projects` quota.
* On creation, the creator is automatically granted project access.
* Admins / owners always see every project in their organisation.

---

## 5. Work Breakdown & Schedule

### 5.1 WBS (`wbs.ts`)

* Hierarchical activities (parent → children, unlimited depth).
* Each activity carries `planned_quantity`, `actual_quantity`, unit, and a
  cost weight used for earned-value calculations.
* `actual_quantity` is updated automatically when DPRs against that
  activity are approved.

### 5.2 Milestones (`milestones.ts`)

| Status | Meaning |
|---|---|
| `pending` | Not yet started |
| `on_track` | Progressing per plan |
| `at_risk` | Slipping |
| `delayed` | Past planned date |
| `completed` | Done |

Milestones can be linked to WBS activities for roll-up reporting.

---

## 6. Daily Progress Reports (DPRs)

### 6.1 States

```
  draft ──submit──► submitted ──approve──► approved
                       │
                       └──reject──► rejected (re-draftable)
```

### 6.2 Workflow

1. **Draft** — A user with `dpr:create` (typically site engineer, PM,
   contractor) creates a DPR for a project + date, logging manpower,
   weather, quantities executed, narrative remarks.
2. **Attach** — Photos and documents may be attached.
3. **Submit** — User submits; a row is written to the Approvals Inbox.
4. **Approve / reject** — User with `dpr:approve` (typically PM) resolves
   the inbox item. On **approve**, executed quantities are posted against
   the corresponding WBS activities (incrementing `actual_quantity`) in a
   single transaction.
5. **Edit window** — Only `draft` DPRs may be edited (`dpr:edit`).

---

## 7. Photos, Documents, Issues

| Module | Purpose | Key fields |
|---|---|---|
| **Photos** (`photos.ts`) | Site documentation, geotagged uploads | project, WBS link, caption, tags, EXIF |
| **Documents** (`documents.ts`) | Drawings, contracts, certificates | versioning, MIME, uploaded-by |
| **Issues** (`issues.ts`) | Site issues / snag list | severity (`low` → `critical`), status (`open` / `in_progress` / `resolved`) |

All three use **Object Storage** behind the scenes; the API issues short-lived
signed URLs (`storage.ts`) for upload and download.

---

## 8. Dashboards & Reports

### 8.1 Dashboard (`dashboard.ts`)

Per-project and org-wide KPIs:
* Active project count vs total
* Pending approvals (across domains)
* DPRs filed today / this week
* Budget vs spend (live from financial module)
* Schedule variance (live from WBS / milestones)

### 8.2 Reports (`reports.ts`)

Exportable analytics:
* **BOQ vs Actual** — variance by cost head, drill-down to activity.
* **Financial** — bill aging, payment status, GST/TDS summaries.
* **Workforce** — attendance summary, payroll runs.
* **Project health** — milestones at-risk, NCRs open.

Reports render as paginated tables in the UI and can be exported to CSV / PDF.

---

## 9. Estimation, BOQ, Rate Engine

### 9.1 Estimates (`estimation.ts`)

Five-level estimating ladder, each level progressively more detailed:

| Level | Use |
|---|---|
| L0 | Order-of-magnitude (square-foot rate) |
| L1 | Parametric, by cost head |
| L2 | Schematic BOQ |
| L3 | Detailed BOQ with rate analysis |
| L4 | Tender BOQ |
| L5 | Contract / awarded BOQ |

Each estimate links to **cost heads**, **BOQ items**, and **rate analysis
components** (material + labour + plant + overhead build-ups).

### 9.2 Rate sources (`rate-sources.ts`)

Registered sources of unit rates — DSR (Delhi Schedule of Rates), SSR (State
Schedule of Rates), in-house catalogues, vendor quotes. Each source has a type
(`csv`, `json`, `gsheet`, `escalation_rule`) and an enable flag.

### 9.3 DSR / SSR rates (`dsr-rates.ts`)

The pulled rate registry. A **daily scheduler** runs at **02:00 server time**
(`cron`: `0 2 * * *`) and pulls every enabled source, refreshing rates and
logging the import.

Manual sync is also available from the DSR Rates page.

---

## 10. Variation Orders (VOs)

### 10.1 States

```
  draft ──submit──► pending ──approve──► approved
                       │
                       └──reject──► rejected
```

`approved` and `rejected` are terminal; the VO cannot be re-opened.

### 10.2 Workflow

1. **Draft** — QS / PM drafts a VO linked to one or more BOQ items, capturing
   the scope change, quantity delta, rate, and justification.
2. **Submit** — Status moves to `pending`; an Approvals Inbox entry is
   created.
3. **Approve / reject** — A user with `vo:approve` (typically owner, PM,
   finance) resolves it.
4. **Post-approval** — Approved VOs are reflected in BOQ-vs-Actual reports
   and downstream contractor billing.

---

## 11. Financial Module

The financial module covers contractor billing, payment, ledger, client
invoicing and statutory deductions.

### 11.1 Entities

| Entity | Purpose |
|---|---|
| `contractor_bills` | Bills raised by contractors / subcontractors |
| `bill_deductions` | TDS, retention, advance recovery, LWF, other |
| `payment_vouchers` | Payment instruments against approved bills |
| `ledger_accounts`, `ledger_entries` | Double-entry general ledger |
| `client_invoices` | Invoices raised to the project's client |
| `gst_entries` | Output / input GST register |
| `tds_entries` | TDS deducted (194C, etc.) |
| `retention_ledger` | Retention held, released schedule |
| `advance_ledger` | Mobilisation / material advances and recoveries |

### 11.2 Contractor bill workflow

1. **Draft** — `financial:edit` user creates a draft bill against a project /
   contractor with line items.
2. **Submit / verify** — Bill moves through verification (QS scrutiny, PM
   certification) toward approval.
3. **Auto-deductions** — On approval, the system applies:
   * **TDS** (Section 194C, configurable rate)
   * **Retention** (typically 5%, configurable)
   * **Labour Welfare Fund** (where applicable)
   * **Advance recovery** (capped at outstanding advance balance)
4. **GST handling** — Output GST is registered against the bill.
5. **Payment voucher** — Approved bills can be paid via a payment voucher
   (cash / bank / cheque / NEFT / RTGS).
6. **Ledger posting** — On approval, a double-entry pair is posted:
   `Dr Expenditure / Cr Contractor Payable`; on payment, `Dr Payable /
   Cr Bank`.

### 11.3 Client invoicing

Symmetric flow for invoices issued to clients, with status tracking
(`draft`, `sent`, `paid`, `cancelled`).

### 11.4 Visibility

* `financial:view` — read access to bills, invoices, ledger, reports.
* `financial:edit` — create / modify.
* Admins and finance role always have both.

---

## 12. Supply Chain Module

End-to-end procurement and inventory.

### 12.1 Procurement flow

```
  Vendor master ──► Material indent ──► RFQ (multi-vendor)
        │                                   │
        │                                   ▼
        │                            Vendor responses
        │                                   │
        ▼                                   ▼
  Rate contract ◄──── Purchase Order ◄──── Award
                              │
                              ▼
                          GRN (with QC sample) ──► Stock ledger
                              │
                              ▼
                       3-way match (PO + GRN + invoice)
```

### 12.2 Entities

| Entity | Purpose |
|---|---|
| `vendors` | Vendor master with statuses (`active`, `blacklisted`, `pending_kyc`) |
| `material_indents` | Site requests for material |
| `rfqs`, `rfq_responses` | Multi-vendor quote collection |
| `purchase_orders`, `po_items` | Awarded POs |
| `grns`, `grn_items` | Goods received, with QC checkpoints |
| `material_tests`, `test_results` | Lab results gating GRN acceptance |
| `stores`, `inventory_items` | Storage locations and stock master |
| `stock_ledger`, `stock_issues`, `wastage_log` | Inventory movements |
| `rate_contracts` | Pre-negotiated rate frames |

### 12.3 Workflow rules

* Indents must be approved before they can be converted to RFQs (above org
  threshold).
* RFQ awards generate a PO; PO status (`draft` → `issued` → `partially_received`
  → `closed`).
* GRN acceptance requires QC pass; failed tests raise an NCR (see Quality).
* Each GRN increments stock; each Issue decrements; the **stock ledger** is
  the immutable audit trail.

---

## 13. Workforce Module

### 13.1 Worker master

| Field | Notes |
|---|---|
| Worker code, name, trade, skill level | Master data |
| Daily / OT rate | Drives payroll |
| Phone, gender, state | KYC + statutory |
| BOCW registration | Compliance |
| Bank details (account, IFSC) | Wage payouts |
| Contractor link | If supplied via labour contractor |

### 13.2 Attendance

* **Bulk muster** — `POST /attendance/bulk` records a day's roster for a
  project in one call.
* **Geofence check** — Attendance entries may be validated against the
  project's lat/long with a 200 m radius (uses `geocode.ts` Haversine).
* Entries: `present`, `absent`, `half_day`, `OT_hours`.

### 13.3 Payroll periods

```
  draft ──compute──► computed ──approve──► approved
```

1. **Draft** — Open a payroll period (e.g. weekly muster) for a project.
2. **Compute** — System aggregates attendance + OT × rates and applies
   statutory deductions (EPF, ESI, PT where applicable). Computation is
   blocked unless the period is in `draft`.
3. **Approve** — `workforce:edit` user (or HR / finance) approves. Approved
   periods are immutable; wage slips can be generated.

### 13.4 Labour contractor bills

Parallel billing flow for labour-contracted muster:

```
  draft ──submit──► submitted ──approve──► approved
                                       └──► rejected
```

Approved bills feed into the financial ledger like any other contractor bill.

---

## 14. Quality & Safety

Implemented within the workforce/quality routes (`workforce.ts`).

### 14.1 Quality

| Entity | Purpose |
|---|---|
| `itps` (Inspection & Test Plans) | Per-activity checkpoint list; approved before execution starts |
| `itp_items` | Individual checkpoints |
| `inspection_requests` | Site → QC: "please inspect" |
| `ncrs` (Non-Conformance Reports) | Raised on inspection failure |
| `quality_tests` | IS-code tests (cube strength, slump, etc.) |

**NCR lifecycle:** `open` → `capa_submitted` → `closed`. CAPA = Corrective
And Preventive Action.

### 14.2 Safety

| Entity | Purpose |
|---|---|
| `hira_entries` | Hazard Identification & Risk Assessment register |
| `jsa_entries` | Job Safety Analysis per activity |
| `safety_permits` | Hot work, height work, confined space, electrical — `pending` → `approved` → `expired` |
| `ppe_issues` | PPE issued to workers (helmet, vest, gloves, etc.) |
| `incidents` | Near-miss / first-aid / lost-time / fatality, with classification |

---

## 15. Approvals Inbox

A **single inbox** unifies every cross-domain approval task. Domains feeding
the inbox include:

* Project creation (`project:approve`)
* DPR submission (`dpr:approve`)
* Variation orders (`vo:approve`)
* Contractor bills (financial approvers)
* Labour contractor bills
* ITPs

Each row carries: source domain, entity id, project, requested-by, requested-at,
status (`pending` / `approved` / `rejected`), and a deep link into the source
record. Resolving an inbox item performs the underlying domain transition in
the same transaction.

---

## 16. Modules Access (per-org / per-project gating)

`modules-access.ts` lets administrators turn entire feature areas on or off
per organisation and per project.

* **Org default** — Each organisation has an `enabled_modules` list.
* **Project override** — A project may override the org default to enable or
  disable specific modules (e.g. a small project may turn off the Supply
  Chain module).
* **Enforcement** — Any API route in a disabled module returns 403; the UI
  hides the corresponding navigation.

Module keys correspond to the major navigation areas (Projects, DPRs,
Financial, Supply Chain, Workforce, Quality, Safety, Estimation, Reports).

---

## 17. Admin & Custom Roles UI

The `/admin` page is the control room for administrators.

### 17.1 Tabs

| Tab | Who sees it | Purpose |
|---|---|---|
| **Users** | admin, super_admin | Create / edit / delete users; assign built-in role, organisation, custom role; reset password; manage per-user project access |
| **Custom roles** | admin, super_admin, or any user with `roles:manage` | Create / edit / delete org-scoped custom roles; tick capabilities grouped by domain |
| **Organisations** | super_admin only | Set project quota, edit org details |

### 17.2 Custom role dialog

* **Name** — required, unique within org.
* **Description** — optional, ≤ 256 chars.
* **Capabilities** — checklist grouped by domain (Projects, Approvals, DPRs,
  Financial, Workforce, Supply Chain, Admin).
* **Organisation** — locked on edit; selectable only at creation by super-admin.

Deleting a custom role first detaches every user holding it (their `custom_role_id`
is nulled) and then removes the role.

---

## 18. Object Storage

`storage.ts` issues short-lived signed URLs to the App Storage bucket. Photos,
documents, GRN attachments, NCR evidence, incident photos, and wage slips all
go through it. Files are written to either a public path
(`PUBLIC_OBJECT_SEARCH_PATHS`) or the private directory (`PRIVATE_OBJECT_DIR`)
based on the entity type.

---

## 19. Scheduled Jobs

| Job | Schedule | Source |
|---|---|---|
| **Rate sync** | Daily at 02:00 server time | `runAllEnabledSources()` iterates every enabled rate source (DSR, SSR, in-house) and refreshes rates. Failures are logged but do not abort the cycle. |

---

## 20. Frontend Page Map

| Path | Page | Description |
|---|---|---|
| `/login` | `login.tsx` | Email + password sign-in |
| `/profile` | `profile.tsx` | View own profile, change password |
| `/` (dashboard) | `dashboard.tsx` | Executive KPIs and pending-approval counts |
| `/projects` | `projects.tsx` | Project list, filters, status badges |
| `/projects/new` | `project-new.tsx` | Project creation wizard |
| `/projects/:id` | `project-detail.tsx` | Tabbed: WBS, milestones, DPRs, settings, modules |
| `/dprs/:id` | `dpr-detail.tsx` | DPR view / edit / submit / approve |
| `/approvals` | `approvals.tsx` | Cross-domain approvals inbox |
| `/variation-orders` | `variation-orders.tsx` | VO list, submit / approve |
| `/estimation` | `estimation.tsx` | L0–L5 estimates, BOQ builder, rate analysis |
| `/dsr-rates` | `dsr-rates.tsx` | DSR / SSR registry, sync controls |
| `/financial` | `financial.tsx` | Bills, vouchers, ledger, invoices |
| `/supply-chain` | `supply-chain.tsx` | Vendors, indents, RFQs, POs, GRNs, stock |
| `/workforce` | `workforce.tsx` | Workers, attendance, payroll, contractor bills, quality, safety |
| `/reports` | `reports.tsx` | Exportable analytics |
| `/boq-vs-actual` | `boq-vs-actual.tsx` | Cost-head variance drill-down |
| `/organisations` | `organisations.tsx` | Organisation directory (super-admin) |
| `/admin` | `admin.tsx` | Users, custom roles, organisations |
| `*` | `not-found.tsx` | 404 |

---

## 21. API Route Map

All routes are mounted under `/api`. The proxy middleware (`requireProjectAccess`)
automatically gates every `/projects/:projectId/...` route before it reaches
the handler.

| Route file | Purpose |
|---|---|
| `health.ts` | Liveness probe |
| `auth.ts` | Login, logout, session |
| `me.ts` | Current-user profile, modules, capabilities |
| `admin.ts` | User CRUD, organisation CRUD, quota, project access management, assignable-roles catalog |
| `custom-roles.ts` | Custom role CRUD + capability catalog |
| `modules-access.ts` | Org / project module toggles |
| `organisations.ts` | Organisation read endpoints |
| `projects.ts` | Project CRUD and lifecycle transitions |
| `wbs.ts` | Work breakdown structure CRUD |
| `milestones.ts` | Project milestones |
| `dprs.ts` | DPR draft / submit / approve / reject |
| `photos.ts` | Site photo uploads |
| `documents.ts` | Document library + versioning |
| `issues.ts` | Site issue tracker |
| `dashboard.ts` | KPIs and roll-ups |
| `approvals.ts` | Cross-domain inbox |
| `estimation.ts` | Estimates, BOQ, rate analysis |
| `dsr-rates.ts` | DSR / SSR rate registry |
| `rate-sources.ts` | Rate source registry (enable / disable / sync) |
| `variation-orders.ts` | VO lifecycle |
| `financial.ts` | Bills, deductions, vouchers, ledger, invoices |
| `supply-chain.ts` | Vendors, indents, RFQs, POs, GRNs, stock |
| `workforce.ts` | Workers, attendance, payroll, contractor bills, ITP, NCR, HIRA, JSA, permits, PPE, incidents, quality tests |
| `reports.ts` | Exportable reports |
| `storage.ts` | Signed-URL upload / download |
| `geocode.ts` | Haversine distance utilities (attendance geofence) |

---

## 22. End-to-End Project Walkthrough

A typical project from inception to closure:

1. **Setup** (admin / super-admin)
   * Create organisation, set quota, enable modules.
   * Create users; assign built-in roles; optionally a custom role.
2. **Initiate** (PM / owner)
   * Create project → `pending_approval` (or auto-approved if owner/admin).
   * Define WBS and milestones.
   * Build L0–L3 estimate; freeze BOQ at L5.
3. **Procure** (store / PM)
   * Raise material indents, issue RFQs, award POs, receive against GRN
     with QC checks; update stock ledger.
4. **Execute** (site engineer / contractor)
   * Mark attendance daily (with geofence).
   * File DPRs against WBS activities — quantities feed back into earned
     value once approved.
   * Photograph progress; raise issues; log incidents and safety permits.
5. **Quality** (QC)
   * Approve ITPs; raise inspection requests; record IS-code tests; open
     NCRs; track CAPA to closure.
6. **Variations** (QS / PM)
   * Draft VOs for scope changes; route through approval.
7. **Bill & pay** (finance / QS)
   * Contractor bills with auto-deductions (TDS, retention, LWF, advance
     recovery); approve and pay via voucher; ledger posts automatically.
   * Raise client invoices on milestone completion.
8. **Workforce close-out** (HR / finance)
   * Compute payroll period; approve; release wages.
9. **Health tracking** (PM / owner)
   * Transition project among on-track / at-risk / delayed / on-hold as
     needed; resolve approvals as they queue in the inbox.
10. **Close** (PM / owner)
    * Resolve all pending approvals, NCRs, retentions.
    * Mark project `completed`. Data becomes read-only.

---

*End of document.*
