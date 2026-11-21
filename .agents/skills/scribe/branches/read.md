# Read Branch

Use for read-only discovery.

Workflow:

1. Load `references/context-routing.md`.
2. Start with `docs/0000-overview.md` when present.
3. Route by headers through `0000 -> XX00 -> XXXx` or `0000 -> XX00 -> XXX0 -> XXXx`.
4. Inspect source directly when requested or when docs are missing, stale or insufficient; otherwise use the paths they identify.
5. Report routes used and gaps found.

For broad discovery, load `references/scout-subagent.md` only when the runtime supports subagents.

Preflight may suggest `$scribe scout`, but must not start it automatically.

Never write files.
