# Next.js App Router

Prefer Server Components and narrow boundaries. Add client code only where browser interactivity requires it.

## Invocation

Load through `$frameworker nextjs` or when Next.js App Router dominates the framework task.

## Workflow

1. Establish installed Next.js/React and runtime versions from manifests and lockfiles before choosing APIs or cache behavior. Inspect `app/` or `src/app/`, locale segments, route handlers, `proxy.ts` or `middleware.ts`, pages/layouts, server actions, BFF/server modules, env validation, auth/session/cookies, and cache model.
2. Reuse existing conventions for aliases, styling, tests, i18n, schema placement, auth flow, and package layout.
3. Choose the narrowest correct boundary:
   - Server Component for server-rendered reads;
   - Server Action or Server Function for trusted mutations;
   - Route Handler for HTTP endpoints, webhooks, or BFF APIs;
   - Client Component only for interactivity, browser APIs, or client state.
4. Keep `"use client"` as low as possible. Never import server-only modules, secrets, DB clients, or private config into client code.
5. Validate input and auth inside every server action or route handler.
6. Treat cache behavior as part of the contract: invalidation, tags, revalidation, dynamic routes, and user-specific data boundaries.

## Output

- `Boundary:` server/client/route/action choice.
- `Data Flow:` where data is fetched, mutated, cached, and invalidated.
- `Safety:` auth, env, secret, and serialization risks.
- `Validation:` typecheck, lint, tests, build, or route smoke checks.

## Related Skills

- Use the `architect` API-contract-review leaf for route or response shape changes.
- Use `authkeeper` for auth/session/cookie flows.
- Use `ui-ux-designer` for screen and interaction work.
