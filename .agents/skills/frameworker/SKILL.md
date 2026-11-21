---
name: frameworker
description: "Use for Next.js App Router or NestJS routes, layouts, server actions, controllers, modules, services, DTOs, bootstrapping, and framework boundaries."
---

# Frameworker

Route framework-specific application work to the narrowest framework leaf.

Before selecting APIs or cache behavior, establish the installed framework and runtime versions from manifests, owning lockfiles and runtime declarations. This applies when loading a leaf directly; preserve the detected version contract.

## Trigger

Use when the task centers on:

- `$frameworker`, Next.js, or NestJS framework work;
- Next.js App Router structure, server/client boundaries, route handlers, Server Actions, cache behavior, or page/layout work;
- NestJS modules, controllers, services, DTOs, guards, pipes, interceptors, filters, providers, or bootstrapping.

## Branch Routing

Load only the leaf that matches the framework:

| Need | Leaf |
| --- | --- |
| Framework detection, mixed Next/Nest app flow, or unclear framework boundary | `branches/application-framework.md` |
| Next.js App Router work | `references/nextjs-app-router.md` |
| NestJS backend work | `references/nestjs-backend.md` |

For data schema, SQL, Prisma, migrations, or query work, prefer `databaser`. For language-only implementation, prefer `code-engineer`.
If a frontend/backend deployment boundary is genuinely undecided, reuse `$architect planner frontend` or `$architect planner backend` when available; existing framework work needs no architecture interview by default.

## Output

- `Framework:` framework and runtime boundary.
- `Boundary:` route/page/action/controller/module/service choice.
- `Safety:` auth, validation, secrets, serialization, and cache risks.
- `Validation:` exact checks or why they could not run.
