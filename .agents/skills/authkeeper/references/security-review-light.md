# Security Review Light

Find realistic application security risks quickly and recommend the smallest useful mitigation.

## Invocation

Load through `$authkeeper review` or for a focused application-security pass.

## Trigger

Use when:

- a code path accepts untrusted input;
- a change touches identity, tenancy, permissions, secrets, outbound requests, filesystem access, or sensitive logs;
- the user wants a fast pre-merge security pass.

## Workflow

1. Identify entry points, trust boundaries, actors, and sensitive assets.
2. Check authentication and authorization separately.
3. Inspect input validation, escaping, query construction, template rendering, path handling, deserialization, and outbound request construction.
4. Check secrets, tokens, PII, tenant IDs, and credentials in config, logs, errors, telemetry, cache, and artifacts.
5. Prioritize exploitable issues and realistic privilege mistakes over style-only concerns.
6. Recommend the smallest mitigation that meaningfully reduces risk.

## Output

- `Findings:` highest risk first.
- `Evidence:` file/path/symbol and attack or abuse path.
- `Impact:` concrete consequence.
- `Fix:` smallest mitigation.
- `Residual Risk:` what remains unchecked.

## Related Skills

- Use `branches/auth-security.md` for deep auth/session/IAM review.
- Use `codex-security:*` skills for full scans only when installed and applicable; otherwise use the repository's security tooling and report coverage limits.
- Use `infra-builder` secrets-runtime leaf for deployment secrets.
