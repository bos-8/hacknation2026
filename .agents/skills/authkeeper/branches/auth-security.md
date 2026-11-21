# Auth Security

Validate authentication and authorization behavior with a practical security-first workflow.

## Core Workflow

1. Identify assets, actors, trust boundaries, and protected operations.
2. Locate auth entry points: login, callbacks, middleware, guards, interceptors, route handlers, API clients, and storage access.
3. Verify authentication: identity proof, session/token creation, expiry, refresh, revocation, and logout.
4. Verify authorization: role/claim checks, object ownership, tenant isolation, and deny-by-default behavior.
5. Check browser security: cookies, CSRF, CORS, redirects, and token exposure.
6. Check secrets and file access: `.env`, private keys, upload paths, generated files, logs, and backups.
7. Run dependency audit when requested or when dependency changes or findings make it relevant.
8. Report findings with evidence, impact, fix, and validation.

## Security Checks

- Default deny. Allow only explicit, necessary access.
- Apply least privilege to users, services, tokens, database roles, IAM, filesystem paths, and CI secrets.
- Validate authorization server-side even if the UI hides actions.
- Treat tenant ID, owner ID, and resource ID checks as security boundaries.
- Keep tokens out of logs, URLs, localStorage, and client bundles unless the architecture explicitly requires it.
- Keep secrets out of repositories, generated packages, artifacts, logs, errors, fixtures, screenshots, and docs.
- Prefer short-lived tokens and explicit refresh/revocation behavior.
- Use typed claims and schemas at trust boundaries.
- Cookies: `HttpOnly`, `Secure` on HTTPS, `SameSite=Lax` or `Strict` by default, narrow scope, explicit expiry, CSRF protection for unsafe cookie-auth methods, and session rotation after login or privilege changes.
- Files: keep protected files outside public/static directories, validate uploads, and verify that the actual filesystem target stays within the authorized root by resolving or rejecting symlinks/junctions before access. Lexical normalization alone is insufficient. Keep `.env`, keys, and local auth state ignored by git.

## Dependency Audit

Detect the package manager from lockfiles. For JS/TS, prefer `pnpm audit` when `pnpm-lock.yaml` exists. For other stacks, use the repo's established audit command. If audit needs network and fails, report the limitation. Do not run automatic fixes unless explicitly asked.

## Output Shape

Use findings-first output:

- `Finding:` concise issue.
- `Evidence:` file, line, route, config, command output, or behavior.
- `Impact:` realistic consequence.
- `Fix:` smallest safe change.
- `Validation:` command, test, request, or manual check.

If no issue is found, state what was checked and any remaining audit gaps.
