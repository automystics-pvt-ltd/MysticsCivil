---
name: DB push workaround
description: drizzle-kit push fails non-interactively; use raw psql instead for adding new tables
---

Both `drizzle-kit push` and `drizzle-kit push --force` fail with "Interactive prompts require a TTY terminal" when the drizzle-kit version requires conflict resolution prompts (seen with drizzle-kit 0.31.x). The `--force` flag bypasses data-loss prompts but NOT schema-conflict resolution prompts.

**Rule:** When drizzle-kit push fails non-interactively, write CREATE TABLE IF NOT EXISTS statements and apply them directly:

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS my_table (...);
SQL
```

**Why:** The drizzle-kit binary uses an interactive TUI that requires a real TTY. The bash tool runs in a non-interactive shell (no stdin TTY), so any prompt that drizzle-kit can't skip with `--force` will abort.

**How to apply:** Whenever you need to push new schema tables, use raw SQL via psql. For existing tables you don't control (e.g. Drizzle's snapshot tables), read `pnpm --filter @workspace/db run push` output carefully — if it prompts, fall back to psql immediately.
