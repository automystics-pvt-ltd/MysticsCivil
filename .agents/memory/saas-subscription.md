---
name: SaaS subscription layer
description: How multi-tenant plan limits, invitations, and subscription enforcement work across the API server.
---

# SaaS Subscription Layer

## Tables
- `subscription_plans` — plan catalogue (free/professional/enterprise), slugs unique; limits + features as JSONB.
- `tenant_subscriptions` — one row per org (UNIQUE on organisation_id); plan_id FK + `limits_override` JSONB for per-tenant enterprise deals.
- `tenant_invitations` — token-based invites; token is 64-char hex (32 random bytes); expires in 7 days; UNIQUE on token.

## Plan middleware
`artifacts/api-server/src/lib/subscription.ts`:
- `loadTenantPlan(req)` — loads plan+subscription for req user's org; cached on `req.tenantPlan`.
- super_admin always gets `SUPER_ADMIN_PLAN` (all limits null = uncapped; all features true).
- Orgs without a subscription row fall back to free plan limits silently.
- `requirePlanFeature(flag)` — middleware factory; 403 with `code: "PLAN_FEATURE_REQUIRED"` if flag not in plan.features.
- `checkPlanLimit(plan, limitKey, currentCount)` — returns `{ ok, limit, current, message }`.

## Plan limit enforcement in projects.ts
POST /projects now calls `loadTenantPlan(req)` + `checkPlanLimit(plan, "maxProjects", count)` instead of legacy `org.maxProjects`. Error shape: `{ code: "PLAN_LIMIT_REACHED", limitKey, currentPlan }`.

## Key routes added
- `POST /api/auth/register-tenant` — creates user + org + assigns free plan subscription atomically.
- `GET  /api/subscription-plans` — public catalogue (no auth); admin can POST/PATCH.
- `GET  /api/organisations/:orgId/subscription` — org admin sees own plan; super_admin sees any.
- `PATCH /api/organisations/:orgId/subscription` — super_admin can change planSlug, status, limitsOverride.
- `POST /api/organisations/:orgId/invitations` — admin/owner sends invite; checks maxUsers plan limit.
- `GET  /api/organisations/:orgId/invitations` — list invites.
- `DELETE /api/organisations/:orgId/invitations/:invitationId` — revoke pending invite.
- `GET  /api/invitations/:token` — public; validate token and return org metadata.
- `POST /api/invitations/:token/accept` — public; creates account if needed, joins org, creates session.

## Seeded data
Plans: free (₹0, 2 projects, 5 users), professional (₹2999, 20 projects, 50 users), enterprise (₹9999, unlimited).
Mystics org (70d2de3f-...) is on the professional plan with status=active.

**Why:** `loadTenantPlan` caches on `req` so multiple limit checks in one request don't re-query. Super admin bypass is explicit in the function to avoid accidentally gating platform operations.
