---
name: pipeliner
description: "Use for CI/CD pipelines, GitHub Actions, GitLab CI, Azure Pipelines, build/release workflows, deploy jobs, failing logs, cache, artifacts, or automation gates."
---

# Pipeliner

Route CI/CD design, maintenance, and failure triage to the narrowest pipeline leaf.

## Trigger

Use for `$pipeliner`, pipeline YAML, workflow jobs, CI/CD scripts, release automation, deploy jobs, build matrices, GitHub Actions, GitLab CI, Azure Pipelines, Jenkins, caches, artifacts, environments, approvals, secrets, permissions, deployment gates, or failing pipeline logs.

## Branch Routing

Load only the leaf that matches the task:

| Need | Leaf |
| --- | --- |
| Creating, editing, reviewing, or improving pipeline structure | `branches/pipeline-design.md` |
| `$pipeliner triage`, failing CI/CD/build/test/deploy logs, root-cause isolation, or rerun command selection | `references/ci-fail-triage.md` |

## Scope

Apply the selected workflow to the requested pipeline or failure. Use preview behavior for deployment checks and report validation that requires remote CI.

## Related Skills

Run established local checks directly; use `tester` for coverage selection, result investigation or test authoring. Use `authkeeper` for secrets/token scopes, `service-integrator` for deploy connectivity, `blast-radar` for pipeline contract impact, and `feature-flag-rollout` for rollout gates.
