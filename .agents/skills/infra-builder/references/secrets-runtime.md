# Secrets Runtime

Keep runtime configuration explicit and keep secrets out of code, logs, artifacts, caches, and generated files.

## Rules

- Separate public config, private config, and secrets.
- Use secret stores or platform-managed secrets where available.
- Scope secrets to the smallest service, job, environment, or service account.
- Prefer rotation-friendly names and injection patterns.
- Never echo secrets in scripts or CI logs.
- Do not put secrets in Docker images, Compose files committed to repo, test fixtures, caches, or artifacts.
- Use `authkeeper` for IAM, least privilege, cookies, tokens, and security-sensitive auth flows.

## Validation

- Check example env files contain placeholders only.
- Check deploy scripts and CI steps do not print sensitive values.
- Confirm runtime config names are documented for operators.

## Output Shape

- `Config:` public env/config values.
- `Secrets:` names, owners, scopes, and injection method.
- `Rotation:` how credentials can be replaced.
- `Validation:` leak checks or dry-run checks.
- `Risks:` overbroad access, accidental logging, image/artifact leakage.
