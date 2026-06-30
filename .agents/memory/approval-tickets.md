---
name: Approval ticket integrity
description: Rules for any approvalsTable workflow (project, VO, estimate, …) so admin gate, single-path, and duplicate-prevention stay correct.
---

# Approval ticket integrity

When an entity uses `approvalsTable` (`entity_type` + `entity_id` + `assigned_to_role` + `status`) for a gated lifecycle event, three things must hold together or RBAC silently breaks.

## Rules

1. **Resolve route enforces `assigned_to_role`.** Any caller-role check at the route level (e.g. `requireRole(OWNER_PM_FINANCE)`) is too coarse — inside the handler, also reject when `callerRole !== existing.assignedToRole` (super_admin/admin override). For project approvals add a hard `entityType === "project" → admin/super_admin only` short-circuit, since misassigned rows must not become a privilege escalation path.
2. **Single state path.** If a state machine also has a transition endpoint, remove the `pending_approval → approved/rejected` edges from the transition map. Otherwise an actor with transition role but not approval role can bypass the approval ticket entirely. The resolve route is the only path out of `pending_approval`.
3. **DB-enforced one-pending-per-entity.** App-level `SELECT … WHERE status='pending'` then `INSERT` races under concurrent resubmits/double-clicks. Pair with a postgres **partial unique index** (`uniqueIndex(...).on(entityType, entityId).where(sql\`status = 'pending'\`)`) and `.onConflictDoNothing()` on every insert site. App check + index together: index prevents the race, `onConflictDoNothing` keeps the txn alive for the race-loser.

**Why:** All three came out of a code review on the project-approval workflow. Each fix individually closes one failure mode (privilege bypass, dual-path bypass, duplicate inbox rows). Skip any one and the others give a false sense of safety.

**How to apply:** Whenever a new `entity_type` joins `approvalsTable` (VOs, estimates, payments, etc.), audit all three points before merging. The index already covers all entity types — but every new insert site must use `onConflictDoNothing` or you'll get unique-violation 500s instead of silent no-ops.
