# Repository Memory Boundary

`docs/` contains project documentation: architecture, system behavior, runbooks, and maintained decisions. `.ai/` contains repository memory: task context, uncertainties, and handoffs for later work.

## Routing

- A documentation request stays in `docs/`, including documentation about memory behavior.
- An explicit request to read or save repository memory routes to the available `repo-memory` skill and its matching read or write branch.
- An explicit save request already authorizes the scoped memory write; do not ask for the same approval again.
- A bare `$scribe memory` request without read/write intent needs that intent clarified before writing.

## Layout

```text
.ai/
|-- router.md
`-- memories/
    `-- YYYY-MM-DD/
        `-- YYYYMMDD-HHMMSS-unique-topic.md
```

Use `.ai/router.md` as the map. If `repo-memory` is unavailable, preserve this layout and use repository memory helpers when present, or read/write the explicitly requested note directly.

## Content

- Keep notes brief, dated, task-scoped, and clear about uncertainty.
- Link to `docs/` instead of duplicating maintained documentation.
- Document stable findings in `docs/` when documentation is requested; do not automatically move or delete memory notes.
- Never save secrets, credentials, auth state, logs, or session dumps.

Memory provides historical context. Verify changing facts against current code or runtime before presenting them as current.
