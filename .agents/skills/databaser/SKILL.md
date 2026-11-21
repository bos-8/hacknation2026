---
name: databaser
description: "Use for SQL, PostgreSQL, Prisma, schema design, migrations, relations, indexes, transactions, query performance, or data safety."
---

# Databaser

Route database, SQL, ORM, schema, migration, and query work to the narrowest data leaf.

## Trigger

Use when the task centers on:

- `$databaser`, SQL, PostgreSQL, or Prisma work;
- SQL queries, PostgreSQL behavior, indexes, relations, constraints, transactions, locks, or query plans;
- Prisma schema, migrations, generated client usage, select/include shaping, or data-access safety.

## Branch Routing

Load only the leaf that matches the data surface:

| Need | Leaf |
| --- | --- |
| Database scope detection or mixed ORM/database change | `branches/data-access.md` |
| Prisma schema/client/migration ergonomics | `references/prisma.md` |
| PostgreSQL or SQL behavior, indexes, transactions, and query plans | `references/postgresql.md` |
| Combined Prisma plus PostgreSQL rollout, schema, migration, and query work | `references/postgresql-prisma.md` |

For API response changes caused by data changes, pair with the `architect` API-contract-review leaf. For measured query performance, pair with the `code-engineer` optimizer leaf.
For unresolved storage, consistency or recovery requirements, reuse `$architect planner data` when available instead of inventing constraints; skip it for already specified SQL/schema work.

## Output

- `Data Surface:` schema, query, migration, model, or access layer affected.
- `Safety:` compatibility, data loss, locking, rollout, and backfill risks.
- `Query:` select/include, SQL shape, transaction, index, or performance concerns.
- `Validation:` exact Prisma, SQL, migration, integration, or smoke checks.
