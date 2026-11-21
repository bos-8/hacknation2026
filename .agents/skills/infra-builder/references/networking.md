# Networking

Make traffic paths explicit: caller, entrypoint, protocol, port, route, trust boundary, and failure mode.

## Rules

- Identify public, private, and internal-only network surfaces.
- Keep port mappings, DNS names, routes, and TLS termination explicit.
- Prefer least exposure: only publish what external callers need.
- Call out trust boundaries between browser, edge, backend, worker, database, and third-party services.
- Include timeout, retry, and load-balancing behavior when relevant.
- Avoid hard-coded hostnames when environments require different endpoints.

## Validation

- Use config validation for reverse proxies, ingress, or Compose networking when available.
- Use smoke checks for DNS, TLS, health endpoints, and service-to-service calls when feasible.

## Output Shape

- `Path:` caller to target with protocol and port.
- `Exposure:` public/private/internal surfaces.
- `TLS/DNS:` certificates, hostnames, termination point.
- `Validation:` config checks and smoke checks.
- `Risks:` open ports, CORS, mixed content, timeouts, routing drift.
