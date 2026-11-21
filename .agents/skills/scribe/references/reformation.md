# Reformation

Use when old docs must be migrated into RepoRoute.

Workflow:

1. Inventory existing docs and README files.
2. Keep useful content; remove duplicates and stale claims.
3. Create `0000-overview.md`.
4. Create needed `XX00` chapter routers and optional `XXX0` subrouters only when useful.
5. Move concrete material into files ending in `1-9`, such as `0101` or `0121`.
6. Add headers.
7. Validate links and taxonomy.

Do not rewrite tone or structure unrelated to routing unless the user asks.

Keep a short migration note in the PR or handoff:

```text
old path -> new route
```
