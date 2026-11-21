---
name: service-integrator
description: Use for integrating services through HTTP APIs, network calls, queues, webhooks, auth boundaries, service discovery, shared contracts, or runtime connectivity.
---

# Service Integrator

Integrate services through explicit contracts, reliable runtime wiring, and end-to-end validation.

## Trigger

Use when the user asks for:

- `$service-integrator` or service integration;
- connecting two services by API, network, queue, webhook, or event;
- wiring frontend to backend, backend to worker, worker to database, or service to external provider;
- fixing cross-service connection, CORS, proxy, DNS, port, auth, timeout, or serialization issues.

Do not use for pure architecture planning without implementation details; use `architect` for that.
When a requirement blocks concrete wiring, reuse the relevant `$architect planner backend`, `workers`, `proxy` or `auth` topic if architect is available, then return to the integration task. Do not start a full interview for an already decided boundary.

## Integration Checklist

1. Identify producer, consumer, transport, and runtime boundary.
2. Locate existing contracts: OpenAPI, DTOs, schemas, routes, events, env vars, clients, and tests.
3. Define the request/response or event payload precisely.
4. Wire configuration: base URL, ports, service names, secrets, auth headers, timeouts, retries, and CORS/proxy rules.
5. Implement the smallest adapter/client/server change that preserves existing patterns.
6. Add or update focused validation: unit contract tests, integration tests, smoke request, or container health check.
7. Document operational assumptions when they affect deployment or local setup.

## Contract Rules

- Prefer typed DTOs/schemas over ad hoc object shapes.
- Keep one source of truth for endpoints, event names, and payloads.
- Validate inbound data at service boundaries.
- Treat auth, tenancy, correlation IDs, and idempotency as part of the contract when present.
- Call out backward compatibility when changing existing endpoints or events.

## Network Rules

- Distinguish browser URL, server URL, container service name, and host machine URL.
- Verify ports, protocol, path prefix, CORS, reverse proxy, and DNS/service discovery.
- Use explicit timeouts for outbound calls.
- Add retry only for idempotent or explicitly safe operations.
- Surface actionable errors; do not swallow integration failures.

## Output Shape

When explaining or planning an integration, use:

- `Services:` producer, consumer, and runtime boundary.
- `Transport:` HTTP, queue, webhook, direct TCP, or local process.
- `Contract:` endpoint/event/schema/auth.
- `Wiring:` env vars, ports, URLs, proxy, DNS, credentials.
- `Implementation:` files and minimal change steps.
- `Validation:` command or request proving the integration.
- `Risks:` compatibility, auth, retry behavior, observability, rollout.

## Related Skills

- Use `architect` first when service boundaries are unclear.
- Use `scout` for broad read-only discovery of producers, consumers, clients, contracts, and runtime wiring.
- Use `blast-radar` when changing an existing public endpoint, DTO, event, or shared client.
- Use the `architect` API-contract-review leaf when payloads, status codes, validation, generated specs, or error contracts change.
- Use `observability-check` when integration crosses service, queue, job, or network boundaries.
- Use `scribe` when persisting integration docs or runbooks.
