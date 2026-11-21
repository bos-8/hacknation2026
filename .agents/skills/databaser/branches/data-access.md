# Data Access

Classify the data surface before choosing a leaf.

## Workflow

1. Inspect the real repo for `schema.prisma`, migrations, seed scripts, SQL files, query builders, repositories, service access patterns, generated clients, and connection configuration.
2. Route Prisma-specific model, migration, generated client, and `select`/`include` work to `references/prisma.md`.
3. Route raw SQL, PostgreSQL indexes, constraints, locks, transactions, EXPLAIN plans, and query behavior to `references/postgresql.md`.
4. Route mixed Prisma/PostgreSQL schema, migration, rollout, and query-shaping changes to `references/postgresql-prisma.md`.
5. Treat migrations as rollout changes: assess compatibility, backfill, locking, deploy order, and rollback options.
6. Keep data access out of controllers/UI unless the repo already uses that boundary.
7. Pair with `tester` for migration validation, integration tests, or query smoke checks.
