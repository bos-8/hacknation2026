---
name: dependency-upgrade-safe
description: "Use for dependency, framework, runtime, package-manager, or toolchain upgrades requiring the smallest safe change and focused validation."
---

# Dependency Upgrade Safe

Keep upgrades small, reviewable, and validated against the real consumers.

## Trigger

Use when:

- a package, framework, runtime, lockfile, toolchain, or peer dependency changes;
- upgrade risk must be estimated or contained;
- compatibility fixes are needed after a version bump.

## Workflow

1. Identify the repository's package manager, pinned version and owning lockfile(s), then the direct/transitive upgrade and real consuming apps/packages. Preserve package-manager and lockfile ownership unless their migration is requested.
2. Inspect changelog or release notes when the version delta may include breaking changes.
3. Check likely blast radius: runtime behavior, build tooling, tests, generated code, types, config, and peer dependencies.
4. Look for breaking areas first: renamed APIs, changed defaults, stricter validation, peer dependency shifts, output changes, or runtime requirements.
5. Make the smallest code/config updates needed to restore compatibility.
6. Pair the upgrade with narrow validation.
7. Call out deferred cleanup separately so the upgrade stays reviewable.

## Output

- `Upgrade:` package/tool and version delta.
- `Risk:` likely break areas.
- `Patch:` minimal compatibility changes.
- `Validation:` exact focused commands.
- `Deferred:` cleanup or migration work not included.

## Related Skills

- Use the `pipeliner` CI-fail-triage leaf when an upgrade breaks a pipeline.
- Run established checks directly; use the `tester` impact-selection leaf when choosing upgrade coverage needs its workflow.
- Use stack-specific skills for framework/runtime migrations.
