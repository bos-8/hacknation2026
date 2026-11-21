# NestJS Backend

Keep controllers thin, services cohesive, DTOs explicit, and DI boundaries clear.

## Invocation

Load through `$frameworker nestjs` or when NestJS dominates the framework task.

## Workflow

1. Inspect modules, controllers, services, DTOs, pipes, guards, interceptors, filters, config, bootstrap path, and persistence pattern.
2. Keep controllers as HTTP adapters. Put orchestration and business rules in services.
3. Put validation in DTOs/pipes, authorization in guards/policies, and cross-cutting behavior in interceptors/filters.
4. Preserve dependency injection clarity with explicit providers/tokens where useful.
5. Keep configuration typed and centralized.
6. Preserve public contracts: DTO shape, serialization, validation side effects, status codes, and error responses.
7. Add API docs only if the repo already uses them or the task clearly benefits.
8. Validate with typecheck, affected tests, module boot sanity, or endpoint checks.

## Output

- `Module Boundary:` affected module/providers.
- `Contract:` DTOs, validation, serialization, errors.
- `Auth/Guards:` authN/authZ changes.
- `Validation:` exact checks.

## Related Skills

- Use the `architect` API-contract-review leaf for endpoint contracts.
- Use `authkeeper` for guards/session/token behavior.
- Use `databaser` for Prisma, PostgreSQL, or SQL data layer changes.
