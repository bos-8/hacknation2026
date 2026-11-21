# Validation

Use after creating, reforming, or moving docs.

Checks:

- `docs/0000-overview.md` exists.
- Doc filenames match `NNNN-slug.md` or `NNNN-slug.<lang>.md`.
- Chapter router docs use `XX00`.
- Optional subrouter docs use `XXX0`, where the third digit is non-zero.
- Concrete docs end in `1-9`.
- `0000-overview.md` links every chapter router.
- Every subrouter is linked from its `XX00` chapter.
- A concrete doc is linked from its matching `XXX0` subrouter when present, otherwise from `XX00`.
- Local Markdown links point to existing files.
- New default headers contain a nonempty `brief` and topic `tags` list; review optional `version`/`author` and retained dates against the repository schema.
- Mermaid checks run only when Mermaid blocks exist.

Script coverage:

- Every public checker, preflight/watch command and timestamp helper has `.ps1`,
  `.sh` and `.py` entrypoints. Python checks use only the standard library and
  accept a positional root, `--root` or `-Root`; PS1/SH retain their existing syntax.
- `reporoute-preflight.*` checks current docs tree status and prints a short hint.
- `tests/test-fixtures.*` verifies positive and negative docs fixtures.
- `check-taxonomy.*` checks overview and filename shape.
- `check-links.*` checks local Markdown links and concrete-to-router links.
- `check-markdown.*` checks empty headings and unclosed fences.
- `check-mermaid.*` detects Mermaid blocks and skips strict syntax unless CLI tooling exists.

Basic native checks cover fence boundaries/headings and route links. For optional
parser-backed checks, use Python `--strict` or individual `--strict-metadata`,
`--strict-markdown`, `--strict-mermaid` flags, with `--tool-root` pointing at
installed validation-only Node dependencies. `--file <docs-name.md>` limits these
checks to selected documents. PS1 equivalents are `-Strict`, `-StrictMetadata`,
`-StrictMarkdown`, `-StrictMermaid`, `-ToolRoot`, `-File`; SH accepts Python flags.

Strict YAML requires nonempty `brief` and a nonempty string `tags` list; optional
`author`/`version` must be nonempty strings. Conventional entrypoints may omit
headers. Legacy fields/dates are preserved. Duplicate keys, unsupported tags and
schema errors fail. Missing strict tools return unavailable, not PASS. Never
silently migrate legacy headers just to pass a newly enabled strict policy.
Markdown uses CommonMark-aware linting; Mermaid validates syntax without rendering
or allowing document scripts/network resources. Basic mode stays stdlib/native.
Manual review still covers stale claims, wrong commands and architecture meaning.

The installed skill includes pinned manifests under `assets/document-validation`.
To enable optional strict tools, run `npm ci --prefix <skill>/assets/document-validation
--ignore-scripts --no-audit --no-fund`, then select that directory as `--tool-root`.
Basic checks and the installer do not install or require these Node packages.
