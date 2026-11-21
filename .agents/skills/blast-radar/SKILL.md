---
name: blast-radar
description: Use when the user explicitly invokes $blast-radar or requests background read-only impact analysis for code changes, references, dependents, tests, and docs.
---

# Blast Radar

Track the blast radius of meaningful code changes with a read-only subagent while the main agent continues implementation.

If spawning is unavailable or prohibited, perform a bounded inline impact check and report that background tracking is unavailable.

## Trigger

Use only when explicitly enabled or requested: `$blast-radar`, `$blast-radar on`, blast radar, impact radar, blast radius watch, or a background helper that tracks affected references while code changes.

Disable on `$blast-radar off`, `stop blast-radar`, or `stop impact watch`.

## What Counts As Blast Radius

Run for changes that can affect callers or behavior: signatures, renamed exports/classes/modules/routes/commands/events, DTOs, schemas, types, config/env/migrations, shared utilities, public APIs, database contracts, feature flags, deleted/moved files, generated types, fixtures, or docs contracts.

Do not run it for typo-only edits, isolated comments, formatting-only changes, or private implementation details with no call-site impact.

## Subagent Profile

Prefer the custom `blast-radar` agent profile when the current Codex surface exposes agent types. Otherwise use the built-in explorer or a generic read-only subagent. The radar must not edit files. It reports to the main agent only.

## Workflow

1. Main agent identifies the changed symbol, file, or contract.
2. Main agent continues the immediate implementation path.
3. Spawn one read-only radar subagent with a narrow impact question.
4. Radar searches references, dependents, tests, docs, generated contracts, and config.
5. Radar reports concise impact notes.
6. Main agent integrates only relevant follow-up changes and validation.

## Prompt Shape

```text
Blast radar this change: <symbol/file/contract and intended change>.

Read-only. Do not edit files. Find the blast radius:
references/callers, indirect dependents, generated contracts, tests, docs,
config, migrations, and likely validation commands.

Return concise findings for the main agent:
Found:
Evidence:
Needs update:
Validation:
Unknowns:
```

## Report Rules

- Prefer paths, symbols, and line references over broad summaries.
- Separate confirmed impact from guesses.
- Do not block on exhaustive search; report bounded evidence fast.
- If no references are found, say what was searched.
- Main agent decides what to fix and what to tell the user.

Blast Radar is not a reviewer or second implementer. It finds impact while the main agent edits. Use review skills later for correctness, security, and rollout risk.
