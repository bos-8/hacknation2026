# Defensive Programming

Protect boundaries and invariants without adding noisy checks everywhere.

## Invocation

Load through `$code-engineer defensive` or when boundary hardening dominates the task.

## Validate At Boundaries

Add defensive checks at:

- user input, request bodies, query params, forms, and CLI args;
- API, event, queue, webhook, and file boundaries;
- auth, tenancy, ownership, and permission boundaries;
- filesystem paths, uploads, generated files, and external process calls;
- external service responses and untrusted JSON.

Inside trusted internal code, prefer strong types and clear invariants over repeated runtime checks.

## Guard Rules

- Fail fast when continuing would corrupt state or hide a bug.
- Return actionable errors that identify the invalid boundary condition.
- Before recursive delete, move, or file exposure, verify the actual filesystem target against the allowed root by resolving or rejecting symlinks/junctions. Do not rely on lexical normalization alone.
- Treat `null`, `undefined`, empty strings, and missing env vars explicitly at boundaries.
- Use retries only for idempotent or explicitly safe operations.
- Do not catch errors just to log and continue with broken state.

## Invariants

Document and enforce invariants that matter:

- ownership and tenant match before accessing resources;
- state transitions are valid;
- amounts, counts, dates, and identifiers are within allowed ranges;
- a transaction either fully commits or rolls back.

## Anti-Patterns

- Defensive checks around every local variable.
- Catch-all handlers that hide failures.
- Silent fallback to insecure defaults.
- Returning `null` for multiple unrelated failure modes.
- Retrying non-idempotent operations without an idempotency key.
