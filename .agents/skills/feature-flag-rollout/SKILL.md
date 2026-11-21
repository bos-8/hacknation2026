---
name: feature-flag-rollout
description: "Use for changes requiring a feature flag, gradual rollout, dark launch, experiment gate, kill switch, rollback path, or rollout review."
---

# Feature Flag Rollout

Use feature flags as operational rollout controls, not as permanent hidden configuration.

## When To Use

- A feature should be dark-launched or rolled out gradually.
- A risky behavior change needs an operational off switch.
- A migration needs old and new behavior to coexist temporarily.
- The team needs rollout notes, rollback conditions, or cleanup criteria in addition to code changes.
- A PR adds a flag and needs review for safety, observability, and stale-flag risk.

Do not use for ordinary static settings, environment constants, or one-time config unless runtime rollout control matters.

## Workflow

1. Define flag name, owner, default state, target users/tenants/environments, and intended cleanup path.
2. Preserve old behavior until the new path is explicitly enabled.
3. Put the flag check at the highest useful boundary; avoid burying checks across many layers.
4. Define flag-off handling for new, queued and in-flight work. Disabling the flag does not undo completed writes or external effects; specify recovery or compensation where needed.
5. Add observability for enablement, usage, and failure modes.
6. Include rollout stages, rollback conditions, and cleanup criteria.
7. Treat cleanup as part of the contract: owner, removal trigger, stale flag detection, and removal of dead fallback paths after rollout completes.

## Implementation Rules

- Name flags by capability or behavior, not ticket number.
- Prefer fail-closed defaults for risky or externally visible behavior.
- Keep read paths and write paths consistent; partial flagging can corrupt state.
- For state-changing features, verify that the fallback can handle state already produced by the enabled path, or define recovery before rollout.
- Avoid flag checks inside tight loops or deeply repeated hot paths unless cached safely.
- Keep tests for both disabled and enabled paths while the flag exists.
- Do not expose internal flag names or sensitive rollout logic to untrusted clients unless intended.
- Document how to turn the feature off during incident response.

## Related Skills

- Use `architect` when the flag affects service boundaries, contracts, or migration strategy.
- Use `blast-radar` when flagging a shared path may affect callers, tests, docs, jobs, or generated contracts.
- Use `pipeliner` when rollout stages or flag changes are controlled by CI/CD or deploy gates.
- Run established checks directly; use the `tester` impact-selection leaf when enabled/disabled coverage selection needs its workflow.
- Use `authkeeper` when flag scope depends on users, tenants, roles, claims, or permissions.
