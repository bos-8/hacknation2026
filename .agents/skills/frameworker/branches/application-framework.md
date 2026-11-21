# Application Framework

Detect the framework boundary before choosing a leaf.

## Workflow

1. Identify installed framework/runtime versions from manifests, lockfiles and runtime declarations, then inspect structure: `app/`, `src/app/`, `pages/`, `next.config.*`, `middleware.ts`, `proxy.ts`, `main.ts`, `app.module.ts`, `*.module.ts`, controllers, services, DTOs, and decorators.
2. Route Next.js App Router UI/server-boundary work to `references/nextjs-app-router.md`.
3. Route NestJS backend module/controller/service work to `references/nestjs-backend.md`.
4. If both frameworks are involved, keep the handoff explicit: frontend route/action/BFF boundary first, then backend controller/service contract.
5. Pair with the `architect` API-contract-review leaf when request/response shape changes.
6. Pair with `authkeeper` when sessions, cookies, guards, roles, or tokens change.
7. Pair with `tester` for focused validation commands.
