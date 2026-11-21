# Test Impact Selector

Select the minimum defensible validation set for the actual change.

## Invocation

Load through `$tester impact` or when selecting the validation scope dominates the task.

## Trigger

Use when:

- a change needs validation planning;
- the user asks what to run;
- broad validation would be slow and a focused set is enough.

## Workflow

1. Map changed files to package, app, module, runtime boundary, and public contracts.
2. Start with the nearest fast check that covers touched behavior.
3. Escalate only for shared utilities, contracts, schemas, migrations, build config, auth/security, or deploy paths.
4. Separate must-run checks from optional confidence checks.
5. If scope is uncertain, state residual risk instead of pretending coverage is complete.
6. Return commands in fastest-signal order.

## Output

- `Must Run:` exact commands.
- `Optional:` confidence checks.
- `Skipped:` broad checks intentionally not run.
- `Risk:` behavior not covered by the selected set.

## Related Skills

- Use `references/runtime-validation.md` when executing selected commands.
- Use the `architect` API-contract-review leaf for public contract changes.
- Use `feature-flag-rollout` for enabled/disabled path validation.
