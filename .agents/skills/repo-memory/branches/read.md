# Repo Memory Read

Use when loading, listing, searching, or restoring repository-local memory from `.ai/`.

## Workflow

1. Check whether `.ai/` exists. If not, say no repository memory exists and do not create it.
2. Start with `.ai/router.md`. Fall back to legacy `.ai/000-overview.md` and `.ai/memory/` when reading older repositories; never rewrite old notes just to read them.
3. Use repo scripts when available:

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\modules\read-ai-memory.ps1
```

Search memory notes:

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\modules\read-ai-memory.ps1 -Query 'config profile'
```

Show full matching notes:

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\modules\read-ai-memory.ps1 -Query 'config profile' -Full
```

## Fallback

If scripts are unavailable, list `.ai/router.md` and recent `.ai/memories/*/*.md` files with targeted reads.
