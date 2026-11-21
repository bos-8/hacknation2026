# API Contract Review

Review contract changes from the consumer's point of view first.

## Invocation

Load through `$architect contract` or when contract compatibility dominates the task.

## Trigger

Use when:

- REST, GraphQL, RPC, queue, webhook, or event payloads change;
- DTOs, validation rules, schemas, generated specs, or error shapes change;
- compatibility, versioning, migration, or staged rollout matters.

## Workflow

1. Identify contract surfaces and consumers.
2. Check breaking changes: removed fields, renamed fields, new required inputs, stricter validation, type narrowing, semantic shifts, changed defaults, status code changes, or error-shape changes.
3. Prefer additive changes over in-place breaking changes.
4. If breaking change is necessary, require versioning, migration notes, or staged rollout.
5. Check examples, generated specs, docs, clients, tests, and fixtures when present.
6. Recommend the smallest compatible implementation path first.

## Output

- `Verdict:` compatible, risky, or breaking.
- `Surface:` endpoint/event/schema/DTO/error shape.
- `Evidence:` exact files, fields, or examples.
- `Mitigation:` additive change, versioning, migration, or rollout.
- `Validation:` contract tests, generated spec, client build, or fixture checks.

## Related Skills

- Use `feature-flag-rollout` when a contract change needs staged exposure.
- Use `blast-radar` to find consumers and generated contracts.
- Use `service-integrator` when two services must be adapted together.
- Use the `tester` test-authoring leaf when contract-test design needs its workflow; run established contract checks directly.
