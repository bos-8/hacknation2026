# Gitignore And Gitkeep

Inspect existing root/nested `.gitignore`, tracked files and the project tooling
before adding rules. Preserve user rules and use the narrowest useful patterns.
Use repository rules for shared generated/private artifacts and local Git excludes
for personal-only files. `.gitignore` does not protect already tracked content.

For dotenv files, retain safe `.example` templates deliberately. Dot-prefixed
families can use `.env`, `.env.*`, then `!.env.example` and `!.env.*.example`.
For `env.prod` / `env.dev`, prefer observed exact names: a broad `env.*` rule can
hide source files such as `env.py`. Templates still need a content scan.

`.gitkeep` is a conventional tracked placeholder, not a Git feature. Add one only
when a required empty directory must exist after checkout; do not populate cache,
dependency or runtime directories unnecessarily. To ignore a known directory's
contents while keeping its placeholder, use a contained pattern such as:

```gitignore
/data/uploads/*
!/data/uploads/.gitkeep
```

Keep parent directories traversable: ignoring the parent itself prevents a child
exception from working. Check positive/negative examples with `git check-ignore
-v --no-index -- <paths>` and inspect tracked files and the resulting diff. Never
delete local data or silently untrack files as a side effect of editing rules.
Use [Pre-push secrets](./pre-push-secrets.md) before publication.

Reference: [Git ignore pattern semantics](https://git-scm.com/docs/gitignore).
