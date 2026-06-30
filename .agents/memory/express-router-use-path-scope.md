---
name: Express router.use path scope
description: router.use(middleware) without a path prefix intercepts ALL requests passing through that router, not just the ones with matching handlers.
---

# Express `router.use()` must always have a path prefix for feature gates

## The Rule
Never call `router.use(requireAuth, requirePlanFeature("x"))` without a path prefix inside a sub-router that is mounted (via `router.use(subRouter)`) without a path prefix in the parent.

## Why
When all sub-routers are mounted without a path prefix in the parent (`index.ts`), Express dispatches every request to every sub-router in registration order. A `router.use(middleware)` without a path inside any sub-router will fire for ALL requests that reach that sub-router — including paths that have no matching handler (the middleware runs, then calls `next()` back to the parent). This means:
- A `requireAuth` in `leadsRouter.use(requireAuth)` would reject unauthenticated requests to `GET /subscription-plans` before the subscription-plans router even sees it.
- A `requirePlanFeature("advanced_estimations")` in `estimationRouter.use(planGate)` would block free-plan users from `/leads`, `/dprs`, etc.

## How to apply
Always use a path prefix:
```ts
// ✅ Correct — only fires for /leads/... paths
router.use("/leads", requirePlanFeature("pre_award"));

// ✅ Correct — only fires for estimation-specific sub-paths
router.use("/projects/:projectId/estimates", planGate);
router.use("/estimates", planGate);

// ❌ Wrong — intercepts every request passing through this router
router.use(requireAuth, requirePlanFeature("pre_award"));
```

Also: mount the public endpoint router BEFORE any feature-gated routers in `index.ts` as defense-in-depth (`subscriptionPlansRouter` is now registered right after `meRouter`).
