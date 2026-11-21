# PostgreSQL and SQL

Design SQL and PostgreSQL changes around correctness, performance, and rollout safety.

## Invocation

Load through `$databaser postgresql` or when SQL/PostgreSQL dominates the task.

## Workflow

1. Inspect schemas, migrations, indexes, constraints, access paths, slow queries, and transaction boundaries.
2. Design indexes from real filters, joins, sort keys, uniqueness needs, and cardinality.
3. Treat nullability, defaults, foreign keys, cascade behavior, and uniqueness as public data contracts.
4. Consider locks, transaction isolation, long-running migrations, backfills, and online rollout risk.
5. Keep query results narrow; avoid broad `SELECT *` in application paths.
6. Use `EXPLAIN` when planning is enough. `EXPLAIN ANALYZE` executes the query, including writes; confirm the target and use a disposable database or existing explicit authorization before mutating real data.
7. Validate with migration checks, query tests, integration tests, smoke queries, or plan inspection.

## Output

- `Schema:` tables, constraints, indexes, relations.
- `Query:` filters, joins, sort, plan, transaction, lock risk.
- `Rollout:` deploy order, backfill, compatibility, rollback.
- `Validation:` exact SQL/PostgreSQL checks.
