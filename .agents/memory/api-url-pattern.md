---
name: API URL pattern
description: The correct URL prefix for API calls in the web app — avoids the BASE_URL trap that routes to Vite instead of the API server.
---

## Rule
All manual `fetch()` calls and `api()` helpers in web pages must use `/api/...` as the path prefix, **never** `${import.meta.env.BASE_URL}/api/...`.

**Why:** The Replit multi-artifact proxy routes path-prefixes to artifacts:
- `/api/...` → API server (port 8080, `app.use("/api", router)`)
- `/web/...` → Vite dev server (port 22333)

`import.meta.env.BASE_URL` for the web artifact equals `/web/`, so `${BASE_URL}/api/path` becomes `/web/api/path` which the proxy routes to Vite, not the API server. Vite has no proxy configured for `/api`, so it returns 404 or the SPA fallback.

**How to apply:** When writing any page-level `api()` helper or bare `fetch()` call, pattern must be:
```ts
const api = (path: string) => `/api${path}`;
// or
fetch(`/api/projects/${id}`, { credentials: "include" })
```
NOT:
```ts
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}/api${path}`; // WRONG — /web/api/...
```

The generated `@workspace/api-client-react` hooks already use `/api/...` directly (no `_baseUrl` set in `customFetch`), so they are unaffected.

## Also: credentials
All mutation `api()` helpers must include `credentials: "include"` as a default so auth cookies are sent. Spread pattern:
```ts
const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  ...
};
```
