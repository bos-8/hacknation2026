---
name: scout
description: Use when the user invokes $scout or broad read-only repository reconnaissance benefits from bounded delegation.
---

# Scout

Delegate bounded read-only repository reconnaissance to a fast subagent, then integrate the findings in the main agent.

## Trigger

Use when the user explicitly asks for `$scout`, a scout subagent, delegated reconnaissance, or broad read-only repository discovery before implementation. Do not use for normal small local file reads.

## Subagent Profile

Prefer the custom `scout` agent profile when the current Codex surface exposes agent types. Otherwise use the built-in explorer or a generic read-only subagent. The scout must not edit files and must report concise findings to the main agent.

If delegation is unavailable or prohibited, perform the bounded read in the main agent and state that fallback. Do not invent tools or override delegation restrictions.

## Docs-Aware Scout Flow

When the repository uses Skillpack document headers:

1. Start with `docs/0000-overview.md` if it exists.
2. Inherit the first valid `0000-*` document's map and header schema, including frontmatter or fenced YAML.
3. Probe at most 20 header lines. Route by `brief` and `tags`, using the actual file path from the read operation. Stop when the schema's routing metadata is available; use targeted search if it is missing or formatted differently.
4. Accept legacy `file`/`brief` or `@file` headers without requiring tags. A `file` field is not required for modern headers. Read an existing `updated` only when freshness matters; do not rewrite headers.
5. Follow `0000 -> XX00 -> XXXx`, or `0000 -> XX00 -> XXX0 -> XXXx` when a matching subrouter exists.
6. Read full files after the header establishes relevance. Read an explicitly requested source target directly, or use source when docs are missing, stale or insufficient.

Routing patterns:

- `0000-*`: main route and schema.
- `XX00-*`: chapter router linked from the overview.
- `XXX0-*`: optional subrouter linked from its chapter.
- `XXXx-*`, with `x` in `1-9`: concrete detail linked from its matching subrouter when present, otherwise from the chapter.
- `9999-backlog.md`: deferred work only, not source of truth.

If docs do not use this format, fall back to targeted search and directory listing.

## Scout Prompt Shape

```text
Scout this specific area: <target/question>.

Read-only. For broad discovery, start at docs/0000-overview.md when present.
Probe at most 20 header lines. Route by brief/tags and the actual file path;
accept legacy headers without requiring tags or adding metadata. Use targeted
search if routing metadata is missing or formatted differently. Follow
0000 -> XX00 -> XXXx, or the matching XXX0 subrouter when one exists.
Read explicitly requested source directly, or when docs are missing, stale
or insufficient.

Return concise findings for the main agent:
- relevant docs, files, symbols, and commands
- evidence with paths and line references where useful
- risks or gaps
- recommended next step

Do not edit files. Do not produce a user-facing final answer.
```
