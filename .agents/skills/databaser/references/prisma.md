# Prisma

Use Prisma ergonomics without hiding database risk.

## Invocation

Load through `$databaser prisma` or when Prisma dominates the task.

## Workflow

1. Inspect `schema.prisma`, migration history, generated client usage, seed scripts, and access-code conventions.
2. Model relations explicitly with clear names, deliberate referential actions, and access-pattern-driven indexes.
3. Prefer backward-compatible expand-contract migrations for production data.
4. Keep queries selective with `select` and `include`; avoid over-fetching and accidental N+1 patterns.
5. Keep validation, authorization, and DTO serialization outside the Prisma client layer unless the repo already centralizes them there.
6. Watch for generated client drift after schema edits.
7. Validate with Prisma schema validation, migration generation/apply checks, generated client checks, and affected tests.

Before applying migrations, confirm the actual database/environment without exposing credentials. Prefer a disposable database for checks. Use existing explicit authorization for real targets; do not infer it from a request to generate or review a migration.

## Output

- `Schema:` models, relations, constraints, indexes.
- `Migration:` generated migration, expand/contract, and data safety.
- `Client:` select/include, transaction, generated client use.
- `Validation:` exact Prisma commands and affected tests.
