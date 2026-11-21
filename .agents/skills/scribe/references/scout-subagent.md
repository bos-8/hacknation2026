# Scout Subagent

Use only when `$scribe scout` needs broad read-only discovery and the runtime supports subagents.

Profile:

- configured read-only scout profile, otherwise inherited model/reasoning defaults;
- override model/reasoning only when supported and authorized; do not infer pricing;
- read-only;
- bounded target;
- concise report;
- no user-facing final answer.

Prompt:

```text
Scout this repository area: <target>.

Read-only. For broad discovery, start at docs/0000-overview.md when present,
inspect relevant headers, then route through 0000 -> XX00 -> XXXx or
0000 -> XX00 -> XXX0 -> XXXx. Read an explicitly requested source target
directly, or use source when docs are missing, stale or insufficient.

Return only:
- Found
- Evidence
- Gaps
- Next

Do not edit files.
```

If no subagent is available, run `context-routing.md` inline.
