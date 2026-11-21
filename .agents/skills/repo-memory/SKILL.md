---
name: repo-memory
description: Use when the user explicitly asks to save, read, search, restore, or hand off repository-local AI memory and notes under .ai/.
---

# Repo Memory

Use explicit repo-local memory under `.ai/` for reviewable project context. Route first, then load only the read or write branch.

## Branch Routing

| Intent | Read |
|---|---|
| read, load, search, restore, inspect existing memory | `branches/read.md` |
| save, write, update, create, handoff, summarize session memory | `branches/write.md` |

If intent is mixed, read first, then write only after user intent is clear.

## Rules

- Store only information that is safe to commit.
- Never store secrets, tokens, private keys, credentials, session dumps, logs, auth state, or generated cache.
- Prefer short memory notes: decisions, conventions, architecture context, current plan, and handoff summaries.
- Offer a save when a durable decision, architecture change, important finding, completed milestone or agreed plan would help a future session. Wait for explicit user approval before any manual save. Do not repeat a declined offer without materially new context; routine reads, trivial edits and prompt counts do not warrant reminders.
- Use `.ai/router.md` as the memory map.
- Do not create `.ai/` on startup. Require a user save request or explicitly enabled autosave.
- `autosave_on_exit: true` (or `SKILLPACK_AUTOSAVE_ON_EXIT=ON`) must be active at `SessionStart` to authorize a normal-exit checkpoint. New installs default ON; explicit OFF preferences are preserved; explicit legacy `memory_autosave` preferences are retained as a migration alias. Turning OFF revokes the save; turning ON after startup does not enable it for that session. Startup never creates `.ai`; autosave does not authorize unrelated writes or bypass tool permissions.

## Direct Commands

| Command intent | Read |
|---|---|
| `$repo-memory read` | `branches/read.md` |
| `$repo-memory write` | `branches/write.md` |
| `$repo-memory save` | `branches/write.md` |
| `$repo-memory search` | `branches/read.md` |

## Hook Behavior

- `repo-memory-session-start.*` checks for `.ai/`, tells the agent whether memory is available to load, and stores a repository fingerprint in plugin state. It never creates repository files.
- Neither `UserPromptSubmit` nor `Stop` counts prompts or issues periodic memory reminders. The model judges whether useful new context warrants a save proposal; manual saves still require explicit user approval.
- If the user agrees to save memory, use the write branch and the repo script when available.
- With AUTOSAVE_ON_EXIT ON at startup, stage a safe curated checkpoint outside the repository at meaningful milestones using the runtime-native command and explicit session identity provided by startup. Normal `SessionEnd` writes it to `.ai/memories/YYYY-MM-DD/` and links it from `.ai/router.md`. Without staged context it saves only a bounded file-change inventory, explicitly labeled as lacking a curated summary. Shutdown cannot create a fresh model summary. Do not copy raw transcripts or file contents, or claim staging is a completed save. Missing startup state skips automatic saves.
