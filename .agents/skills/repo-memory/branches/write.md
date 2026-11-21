# Repo Memory Write

Use when the user chooses to save, update, or hand off repository-local memory under `.ai/`.

## Workflow

1. Require a user request or explicitly enabled autosave before creating `.ai/`. Autosave checkpoints use the hook's staging helper and are flushed only at `SessionEnd`; do not run the immediate-save workflow below for a staging request.
2. Store only safe-to-commit information: decisions, conventions, architecture context, current plan, and handoff summaries.
3. Never store secrets, tokens, credentials, private keys, session dumps, logs, auth state, or generated cache.
4. Prefer the repo script when available:

```powershell
@'
Memory content here.
'@ | pwsh -NoLogo -NoProfile -File .\scripts\modules\save-ai-memory.ps1 -Title 'Short title' -Brief 'One-sentence summary.' -Tag skillpack
```

The script writes a timestamped Markdown file under `.ai/memories/YYYY-MM-DD/`.

## Optional Router Sections

When supported by the saved context, keep short **TODO**, **Planned** and **Project direction** sections in `.ai/router.md`. Use TODO for agreed open actions, Planned for accepted future work, and Project direction for ideas, tradeoffs or questions still under consideration. Distinguish proposals from decisions and implemented behavior; never invent a backlog. Link to dated notes for detail, preserve unrelated router text, and remove or update completed/stale items during an authorized save. Omit empty sections.

## Fallback

If scripts are unavailable, create `.ai/memories/YYYY-MM-DD/YYYYMMDD-HHMMSS-unique-topic.md` manually with the repository Markdown header format and update `.ai/router.md` with a link to the new note. Preserve existing router text and legacy notes.
