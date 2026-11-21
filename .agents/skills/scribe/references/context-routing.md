# Context Routing

Use for read-only discovery.

This is the leaf for `$scribe scout` and `$scribe routing`.

Workflow:

1. Read only the header of `docs/0000-overview.md` first.
2. Read the full `0000` only if the header matches the task.
3. Choose one relevant `XX00` chapter router by header, then read it fully.
4. Choose a matching `XXX0` subrouter when present.
5. Read only the needed concrete file ending in `1-9`; use the chapter directly when no matching subrouter exists.
6. Inspect source files named by those docs. Direct code/runtime requests and missing, stale or insufficient docs may go straight to source.
7. Report which routes were used.

If `0000-overview.md` is missing, inspect README and top-level files, then recommend `$scribe create-taxonomy`.

Do not write files in routing mode.

For broad delegated discovery, read `scout-subagent.md`.
