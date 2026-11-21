# Watch

Use when the user asks for `$scribe watch` during a chat.

Watch mode is a session-level guidance mode, not a background daemon.

While active:

- run or consider preflight before broad repo work;
- use `branches/read.md` for documentation-aware answers;
- suggest relevant `./docs` routes before source inspection;
- after file-changing work, mention docs that may need updates;
- use `branches/write.md` only when the user asks to create or update docs;
- do not auto-start scout subagents;
- do not silently edit files.

Status message:

```text
Scribe watch active: documentation-aware guidance is on for this chat.
```

Stop phrase:

```text
$scribe watch off
```

When stopped, return to normal on-demand `$scribe` behavior.
