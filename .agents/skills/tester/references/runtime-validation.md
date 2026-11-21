# Tester Runtime Validation

Run the smallest validation set that proves the changed behavior.

## Invocation

Load through `$tester runtime` or when running and interpreting checks dominates the task.

## Selection Heuristic

- Docs-only: structure/markdown checks if available; no build unless docs affect generated artifacts.
- Type/interface changes: typecheck plus affected tests.
- UI behavior: component/unit tests, e2e/screenshot only when visual flow risk exists.
- API/controller/service changes: unit tests plus integration/smoke request where practical.
- Database/migration changes: migration validation plus affected integration tests.
- Package/config/tooling changes: install/build/lint/typecheck as relevant.
- Security/auth changes: auth tests plus manual/security checks from `authkeeper`.

## Command Rules

- Prefer repo scripts over ad hoc commands.
- Use package-manager scripts when present: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- On Windows, use PowerShell syntax and quoted paths.
- Keep destructive validation inside owned disposable fixtures with verified target paths. Changes to real data, deployments or external resources require existing task authorization.
- If a command fails due missing deps/network/sandbox, report the limitation and exact rerun command.

## Result Handling

If validation fails:

1. Identify the first real failure.
2. Distinguish test failure from environment failure.
3. Fix only if it is in scope.
4. Re-run the narrow failing command.

Report exact commands run and outcomes.
