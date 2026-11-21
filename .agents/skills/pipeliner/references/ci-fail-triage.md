# CI Fail Triage

Find the first real failure. Ignore downstream noise until the root cause is clear.

## Invocation

Load through `$pipeliner triage` or when failing pipeline logs dominate the task.

## Trigger

Use when:

- a pipeline, pre-commit hook, or local validation step is red;
- the task starts from logs, stack traces, command output, or CI screenshots;
- the user needs the smallest fix and exact rerun command.

## Workflow

1. Locate the first meaningful failure marker: compiler diagnostic, failed assertion, thrown exception, missing file, auth/network failure, permission error, or non-zero child command.
2. Classify: environment, config, auth, network, dependency, lint, type, build, test, migration, Docker, deploy, or runtime.
3. Narrow to the exact file, command, contract, or external condition.
4. Prefer fixing the source over silencing the symptom.
5. Call out flakiness or external dependency failure only when evidence supports it.
6. End with root cause, smallest fix, and exact validation to rerun.

## Output

- `Root Cause:` one clear cause.
- `Evidence:` log excerpt or command section.
- `Fix:` smallest safe corrective action.
- `Rerun:` exact command or CI job.
- `Residual Risk:` only if signal remains uncertain.

## Related Skills

- Use `branches/pipeline-design.md` when CI structure must change.
- Run an obvious established rerun directly; use the `tester` impact-selection leaf when choosing the rerun set needs its workflow.
- Use `dependency-upgrade-safe` when failure comes from version changes.
