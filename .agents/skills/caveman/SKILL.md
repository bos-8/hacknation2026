---
name: caveman
description: "Use when the user explicitly turns Caveman ON or OFF for concise replies."
---

# Caveman

## ON / OFF

- `$caveman` or `$caveman on`: ON. Keep replies brief and direct until turned off.
- `$caveman off`: OFF. Resume normal reply length.
- Startup hooks may enable ON; an explicit user switch takes precedence for the session.
- Preserve technical strings and all details needed for correctness, consent and safety.
- Change reply style only. Do not edit files, compress content or impose commit conventions merely because the mode is ON.

## File References When ON

- Reference files only for a specific finding/detail, or when one or a few files changed and a link helps review. For broad changes, summarize affected areas instead of listing files; keep only references needed to explain concrete issues.
- Use one rendered reference per line, with the visible label `@file: <repo-relative path>` as a single Markdown link to the absolute file path (optionally with a line number). Never repeat the path in parentheses or a second label.
- Before sending, check the visible reply: each referenced path appears once. Do not add a raw `@file:` line beside a link to the same file, or list a file again after it was linked inline. If the interface repeats a custom label, use its native clickable file reference once.
- Use the interface's native link styling for color; do not emit ANSI escapes or HTML styling. Rendering and colors depend on the interface.

```markdown
[@file: .\src\main.py](C:/repo/src/main.py)
```
