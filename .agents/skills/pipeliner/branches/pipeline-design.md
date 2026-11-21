# Pipeline Design

Build CI/CD pipelines that are explicit, repeatable, least-privilege, and easy to debug.

## Use When

- Creating, editing, or reviewing pipeline YAML, workflow jobs, CI/CD scripts, release automation, deploy jobs, build matrices, caches, artifacts, environments, approvals, secrets, permissions, or deployment gates.
- Improving GitHub Actions, GitLab CI, Azure Pipelines, Jenkins, or similar automation.

## Pipeline Shape

Prefer clear stages: checkout, setup runtime/package manager, install, lint/typecheck, test, build/package, security/audit when relevant, artifact publish, and gated deploy.

Do not combine unrelated checks into one opaque script step unless the repo already centralizes them.

## Safety Rules

- Use least-privilege permissions for tokens and jobs.
- Scope secrets to the smallest environment/job possible.
- Never echo secrets or write them to artifacts, logs, cache, or test fixtures.
- Pin third-party actions to versions or SHAs according to repo policy.
- Avoid deployment from untrusted forks.
- Separate pull-request validation from protected-branch release/deploy workflows.
- Use concurrency groups for deploy workflows when duplicate deploys would be risky.

## Cache And Artifact Rules

Cache dependencies, not stale-prone build outputs. Include lockfile and runtime version in cache keys. Tolerate cache misses. Upload only artifacts needed for review, deploy, or debugging, with intentional retention.

## Validation And Reporting

Validate changed YAML and run equivalent local checks when feasible. Use preview modes for deployment scripts. Report the workflow, changed stages, permission and secret boundaries, artifact handling, and any checks that require remote CI.
