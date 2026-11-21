---
name: tester
description: "Use when choosing test coverage, adding regression tests, or investigating test behavior; routine execution of an established check needs no extra routing."
---

# Tester

Route testing work to the smallest useful leaf, then write tests only when they reduce real regression risk.

## Trigger

Use when the user asks for:

- `$tester` or a testing/QA decision requiring workflow guidance;
- build/lint/typecheck/test scope selection or investigation of results;
- writing unit, integration, e2e, contract, migration, or regression tests;
- proving a bug fix or behavior change.

## Branch Routing

Load only the narrow leaf that matches the task:

| Need | Leaf |
| --- | --- |
| Testing strategy, QA scope, or generic validation planning | `branches/strategy.md` |
| `$tester impact`, validation matrix, or what to run | `references/impact-selector.md` |
| `$tester runtime`, running/explaining validation commands, or interpreting command outcomes | `references/runtime-validation.md` |
| `$tester author`, writing/updating/reviewing tests, or regression coverage | `references/test-authoring.md` |

Routine execution of an already established check needs no extra skill routing.

For failing logs, prefer the `pipeliner` CI-fail-triage leaf first. For broad release gates, run the full suite requested by the user.

## Core Rules

- Evidence before completion claims.
- Validate changed behavior, not unrelated systems.
- Prefer targeted checks first; broaden only when the change crosses shared contracts or core flows.
- Do not claim tests pass unless the command completed successfully in the current run.
- If validation cannot run, explain why and give the exact next command.

## Output Shape

When reporting validation:

- `Changed surface:` files, contracts, or behavior affected.
- `Selected checks:` commands and why they are enough.
- `Result:` pass/fail/blocked with evidence.
- `Remaining risk:` what was not covered.
