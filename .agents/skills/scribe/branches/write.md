# Write Branch

Use for file-changing documentation work.

Workflow:

1. Read `docs/0000-overview.md` if it exists.
2. If missing, load `references/create-taxonomy.md` and create it first.
3. Choose the smallest valid route: direct `0000 -> XX00 -> XXXx`, or add `XXX0` only when the chapter needs a subrouter.
4. Load only the needed leaf from `references/`; include `language.md` for translations or non-English output. Preserve conventional entrypoints such as `README.md` instead of forcing them into a numbered route.
5. Write durable system knowledge under `./docs/*` by default.
6. If the user separately requests repository memory, route it through `repo-memory` into `.ai/*`. A documentation update does not authorize a memory write.
7. Run the narrowest useful script from `scripts/`.

Keep routers short. Put details in concrete files ending in `1-9`, such as `0101` or `0121`.

Do not create durable docs outside `./docs` unless the user explicitly requests a different location.
