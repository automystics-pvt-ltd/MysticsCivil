---
name: Project lifecycle gates
description: Authorization rule for any endpoint that mutates a single project's state.
---

# Project lifecycle gates

Any endpoint that mutates a specific project (status transitions, approvals dispatch, settings, archive, etc.) must authorize with `userCanSeeProject(ctx, projectId)` — **not** by comparing `proj.organisationId` to `ctx.organisationId`.

**Why:** Org-match alone lets non-bypass roles (pm, site_engineer, finance, …) touch *any* project in their org regardless of `project_access` assignment. `userCanSeeProject` already encodes the right rule: bypass roles (super_admin/admin/owner) see every project in the org; non-bypass roles need a row in `project_access`. We use it correctly on reads — it must also gate writes.

**How to apply:** In `routes/projects.ts` and anywhere else handling a `:projectId` mutation, replace the `organisationId !== ctx.organisationId` 403 with `if (!(await userCanSeeProject(ctx, projectId))) return 403`. Role-group checks (`requireRole(OWNER_PM)` etc.) are *additional* gates layered on top — they restrict *which* roles can act, not *which* projects those roles can act on.
