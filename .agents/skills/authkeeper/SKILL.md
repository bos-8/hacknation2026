---
name: authkeeper
description: "Use for application security, authentication, authorization, sessions, tokens, secrets, least privilege, focused security review, or redacting supplied sensitive data into realistic fictional examples for sharing."
---

# Authkeeper

Route auth, secrets, least privilege, security review, and privacy-safe sharing to the narrowest branch or leaf.

## Trigger

Use for `$authkeeper`, auth/security hardening, authentication, authorization, RBAC/ABAC, sessions, cookies, JWT, OAuth/OIDC, API keys, CSRF, least privilege, protected files, uploads, secrets, env vars, permission checks, dependency vulnerability checks, injection, SSRF, unsafe deserialization, filesystem access, or sensitive logging.

Use a stack-specific auth skill first when one clearly applies, for example Keycloak/OIDC. Use full security scan skills when the user asks for a repository-wide security scan.

## Branch Routing

Load only the leaf that matches the task:

| Need | Leaf |
| --- | --- |
| AuthN/AuthZ, cookies, sessions, tokens, secrets, least privilege, protected files, dependency audit | `branches/auth-security.md` |
| `$authkeeper review`, fast application security pass, trust boundaries, injection, SSRF, deserialization, filesystem access, sensitive logging | `references/security-review-light.md` |
| `$authkeeper censor`, anonymize provided records/logs, replace identifying data with realistic fictional values for sharing | `branches/censor.md` |

## Scope

Apply the selected branch to the requested boundary. A targeted auth fix does not require a repository-wide review or unrelated dependency audit. Report concrete evidence and validation limits.
When identity/provider/tenant requirements are undecided, reuse `$architect planner auth` if available; an existing targeted auth fix or censor request needs no architecture interview.

## Related Skills

- Use stack-specific auth skills for named providers.
- Use `scout` for broad read-only discovery of auth entry points, protected routes, guards, middleware, config, and secrets surfaces.
- Use `service-integrator` for cross-service auth wiring.
- Use `blast-radar` when changing auth contracts used by multiple modules.
- Use security scan skills for broad repository security reviews.
