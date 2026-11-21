# Help

Show this quick command card when the user asks for `$scribe help`.

| Command | What it does |
|---|---|
| `$scribe scout` | Read-only routing through `0000 -> XX00 -> XXXx` or `0000 -> XX00 -> XXX0 -> XXXx` |
| `$scribe watch` | Enable documentation-aware guidance for the current chat |
| `$scribe routing` | Same as scout, without implying subagent use |
| `$scribe create-taxonomy` | Create `0000` and the first useful `XX00` routers |
| `$scribe taxonomy` | Explain the four-digit numbering method |
| `$scribe reform` | Migrate old docs into RepoRoute structure |
| `$scribe validate` | Check taxonomy, links, Markdown, and Mermaid presence |
| `$scribe memory` | Clarify read or save intent; route to `$repo-memory read` or `$repo-memory write` |
| `$scribe structure` | Apply headers and body structure rules |
| `$scribe markdown` | Use GitHub Markdown extensions only when useful |
| `$scribe mermaid` | Add focused Mermaid diagrams |

Preflight:

```text
scripts/reporoute-preflight.ps1
scripts/reporoute-preflight.sh
```

Preflight checks structure only. It does not start a scout subagent.

Watch:

```text
scripts/reporoute-watch.ps1
scripts/reporoute-watch.sh
```

Watch prints session guidance. It does not silently edit files or start subagents.

Tests:

```text
tests/test-fixtures.ps1
tests/test-fixtures.sh
```

Fixture tests verify that a valid docs tree passes and a broken docs tree fails.

Default route:

```text
read-only task -> branches/read.md
file-changing task -> branches/write.md
```
