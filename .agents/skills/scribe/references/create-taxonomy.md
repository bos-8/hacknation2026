# Create Taxonomy

Use when a repo has no RepoRoute docs yet.

Create the documentation tree under `./docs` by default.

Start by inspecting existing repo facts: README, package manifests, source folders, tests, infra, and docs.

Ask the user only when the project domain cannot be inferred.

Illustrative routers (domain numbers are project-specific; preserve an existing map):

```text
0000-overview.md
0100-runbook.md
0200-architecture.md
0300-domain.md
0400-contracts.md
0500-data.md
0600-features.md
0700-integrations.md
0800-testing.md
0900-reference.md
9999-backlog.md
```

Start small:

- create `0000-overview.md` first;
- add at most 5 domain routers in the first pass;
- skip empty domains;
- prefer only chapter routers that match real repository domains;
- add direct `XX01` / `XX02` leaves only when they prevent repeated discovery;
- add an optional `XXX0` subrouter only when a chapter becomes crowded, then place its concrete files at `XXX1` through `XXX9`.

Do not create a router only because the default list contains it.
