# Topology Branch

Build infrastructure as explicit runtime contracts: what runs, where it runs, how it is configured, how it is reached, and how it is observed.

## Trigger

Use when the task involves:

- local or production runtime setup;
- infrastructure topology, environments, deployment units, or service hosting;
- Docker, Compose, cloud resources, IaC, networking, observability, or runtime secrets;
- translating an architecture plan into deployable infrastructure.

Use `architect` first when the service boundaries or target topology are still undecided.

## Workflow

1. Identify services, dependencies, ports, storage, queues, jobs, and runtime contracts.
2. Separate local development, CI, staging, and production concerns.
3. Choose the narrow leaf needed for the requested infrastructure surface.
4. Keep configuration explicit: env vars, secrets, volumes, networks, health checks, and ownership.
5. Validate with the smallest useful local or dry-run command.
6. Report operational risks: secrets, persistence, network exposure, cost, drift, and rollback.

A review, design or plan request authorizes inspection and preparation. Apply,
deployment and resource deletion require authorization for that target; reuse
consent already given in the session without asking again.
