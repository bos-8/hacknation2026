# PostgreSQL Prisma

Design schema and queries with both Prisma ergonomics and PostgreSQL behavior in mind.

## Invocation

Load through `$databaser combined` or when Prisma and PostgreSQL concerns must be reviewed together.

## Workflow

1. Inspect `schema.prisma`, migration history, seed scripts, access code, connection settings, and generated client usage.
2. Prefer backward-compatible expand-contract changes when possible.
3. Design schema intentionally: clear names, explicit relations, unique constraints, indexes from access patterns, and deliberate referential actions.
4. Keep queries selective with `select` and `include`; avoid over-fetching.
5. Think in PostgreSQL terms: indexes, filters, sort keys, joins, nullability, locks, transaction isolation, and migration risk.
6. Keep data access out of controllers/UI unless the repo already uses that boundary.
7. For risky data changes, provide rollout: schema, backfill/dual-write if needed, code switch, cleanup.
8. Validate with schema validation, migration generation/apply check, query tests, or affected integration tests.

Before applying migrations, confirm the actual database/environment without exposing credentials. Prefer a disposable database for checks. Use existing explicit authorization for real targets; do not infer it from a request to generate or review a migration.

## Output

- `Schema:` models, relations, constraints, indexes.
- `Migration:` expand/contract, backfill, data safety.
- `Query:` select/include, transaction, performance.
- `Validation:` exact Prisma/Postgres checks.

## Related Skills

- Use the `architect` API-contract-review leaf when DB changes alter API behavior.
- Use the `code-engineer` optimizer leaf for measured query performance work.
- Use `feature-flag-rollout` for staged migrations.
