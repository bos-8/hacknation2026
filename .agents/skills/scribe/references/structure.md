# Structure

Read the first valid `docs/0000-*` document for the repository's header schema.
Honor explicit repository requirements. Do not migrate existing headers as part
of an unrelated edit.

## Headers

For a new tree without an established schema, use only `brief` and `tags`:

```yaml
---
brief: "Routes to system architecture documentation."
tags: [architecture, routing]
---
```

- `brief` explains when to read the document in one sentence.
- `tags` is a short, nonempty YAML list of relevant topics; prefer stable lowercase labels and avoid near-duplicates.
- `version` and `author` are optional. Include them only when supplied or required; do not invent an author, assign a version or bump it automatically.
- Keep routing metadata early so header-only reads can select the right document.

Do not add a `file` field or `<!-- @file: ... -->` comment by default: both repeat
the document path. Preserve legacy fields when an existing schema or consumer
requires them; update a retained path field after translation or relocation.
Remove legacy metadata only during an authorized cleanup after checking consumers.

### Dates

Do not add `created` or `updated` by default. Git carries the recorded change
history, but an exported Markdown file may lose that context. Include dates when
the repository, user or standalone deliverable needs them. Preserve existing
`created` values; refresh an existing `updated` when changing the document.
Use the current-time helper for new timestamps. Do not set an old document's
creation date to today or infer missing historical dates.

Keep existing extra metadata unless its removal is requested. These rules apply
to generated documentation, not the `name`/`description` schema of `SKILL.md`,
and do not force frontmatter onto conventional entrypoints such as `README.md`.

## Bodies

Keep routers short: purpose, links to child routes, and essential context. Concrete documents contain the relevant behavior, decisions, source paths, commands, and validation details. Include only sections that help the reader.

This schema applies to documentation in `docs/`. Repository memory in `.ai/` follows the `repo-memory` contract described in `memory-layout.md`.
