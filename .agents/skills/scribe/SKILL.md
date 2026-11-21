---
name: scribe
description: "Use for creating, updating, restructuring, validating, reading, or routing RepoRoute documentation."
---

# Scribe

One visible RepoRoute skill. Keep it cheap: route first, then load only one branch or leaf.

## Branch Routing

| Intent | Read |
|---|---|
| read, scout, route, discover context | `branches/read.md` |
| write, create, update, reform, validate documentation | `branches/write.md` |
| repository memory, including `$scribe memory` | `references/memory-layout.md` |

If intent is mixed, read first, then write.

## Direct Leaf Commands

| Command intent | Read |
|---|---|
| `$scribe taxonomy` | `references/taxonomy.md` |
| `$scribe help` | `references/help.md` |
| `$scribe watch` | `references/watch.md` |
| `$scribe create-taxonomy` | `references/create-taxonomy.md` |
| `$scribe routing` or `$scribe scout` | `references/context-routing.md` |
| `$scribe scout-subagent` | `references/scout-subagent.md` |
| `$scribe memory` | `references/memory-layout.md` |
| `$scribe organize` | `references/organization.md` |
| `$scribe structure` or `$scribe header` | `references/structure.md` |
| `$scribe validate` | `references/validation.md` |
| `$scribe reform` | `references/reformation.md` |
| `$scribe lang` | `references/language.md` |
| `$scribe markdown` or `$scribe alerts` | `references/markdown-extensions.md` |
| `$scribe mermaid` | `references/mermaid-diagrams.md` |

## Guardrails

- Default new documentation headers to `brief` and `tags`; `version` and `author` are optional. Preserve existing dates and repository-specific schemas; load `references/structure.md` for header changes.
- When timestamps are present or requested, use the skill's `scripts/get-current-time.ps1`, `.py` or `.sh` in the selected runtime, preferring a repository-mandated helper. Never guess dates or add them by default.
- Omit redundant `<!-- @file: ... -->` path comments in new Markdown; preserve the repository's actual metadata schema.
- Load `references/language.md` for translations or non-English documentation. Use `.md` for English and `.pl.md` for Polish; preserve conventional entrypoint names such as `README.md` and `AGENTS.md`.
- `./docs/*` is the default location for all durable repository documentation.
- `.ai/*` is repository memory, read or written only when the user requests that operation. Documentation work does not authorize memory writes.
- `0000-overview.md` is the root router.
- `XX00-*` files are chapter routers linked from `0000-overview.md`.
- `XXX0-*` files are optional subrouters linked from the matching `XX00-*` chapter.
- Concrete files end in `1-9`; link them from the matching `XXX0-*` subrouter when it exists, otherwise directly from `XX00-*`.
- Allow both `0000 -> 0300 -> 0301` and `0000 -> 0300 -> 0310 -> 0311`.
- Do not load Mermaid or subagent leaves unless needed.
- Preflight hooks are read-only checks; they must not auto-start scout subagents.
- Watch mode is session guidance only; it must not silently edit files.
