---
name: architect
description: "Use for system design, guided architecture decisions, service boundaries, dependency maps, rollout design, or API/schema/event contract review."
---

# Architect

Route architecture, topology, rollout, and public contract work to the narrowest architecture leaf.

## Trigger

Use for `$architect`, architecture, system design, service maps, dependency maps, integration plans, API contracts, DTOs, schemas, events, webhooks, or implementation plans that must preserve contracts and rollout safety.

Do not use for small isolated code edits unless the change crosses service, module, public contract, or rollout boundaries.

## Branch Routing

Load only the leaf that matches the task:

| Need | Leaf |
| --- | --- |
| Service boundaries, topology, dependency maps, integration plans, rollout architecture, or implementation slicing | `branches/system-design.md` |
| `$architect planner`, focused requirements questions before a material architecture choice/change | `branches/planner.md` |
| API, schema, DTO, message, event, GraphQL, RPC, webhook, generated spec, or error-contract compatibility | `references/api-contract-review.md` |

## Shared Planning Topics

Load only the topic whose decision is unresolved. Other branches/skills may reuse
these leaves without starting the full planner interview.

| Command / topic | Read |
| --- | --- |
| `$architect planner topology`, monolith/services, users, load and scale | `references/planning/topology.md` |
| `$architect planner frontend`, client delivery and frontend/backend split | `references/planning/frontend.md` |
| `$architect planner backend`, API ownership and service boundaries | `references/planning/backend.md` |
| `$architect planner data`, storage, consistency and database scale | `references/planning/data.md` |
| `$architect planner workers`, jobs, queues and async delivery | `references/planning/workers.md` |
| `$architect planner proxy`, ingress, TLS and network exposure | `references/planning/proxy.md` |
| `$architect planner auth`, identities, tenants and authorization | `references/planning/auth.md` |

For concrete service wiring, pair with `service-integrator`. For deployability and runtime topology, pair with `infra-builder`.

## Output

- `Goal:` what the system must achieve.
- `Current State:` existing services/modules and constraints.
- `Target Shape:` service/module boundaries and dependency direction.
- `Contracts/Data Flow:` APIs, events, schemas, DTOs, env vars, storage, request/event/job paths.
- `Slices/Risks/Validation:` ordered implementation steps, rollout/security/performance risks, and checks.
