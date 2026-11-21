# Docker

Prefer small, reproducible container runtimes with explicit build, run, health, and storage contracts.

## Rules

- Use multi-stage builds when they reduce runtime size or isolate build dependencies.
- Keep runtime images minimal, but do not sacrifice required diagnostics.
- Pin base images according to repo policy and document runtime versions.
- Run as non-root when the app supports it.
- Copy only required files into images; avoid leaking `.env`, credentials, caches, or local artifacts.
- Add health checks for long-running services when the platform can use them.
- Define ports, volumes, networks, and env vars explicitly in Compose.
- Keep local Compose defaults developer-friendly and production deployment concerns separate.

## Validation

- Prefer `docker compose config` for Compose syntax.
- Prefer `docker build` or the repo's existing container build command for Dockerfiles.
- Use smoke checks for exposed ports and health endpoints when possible.

## Output Shape

- `Image:` base image, stages, runtime user, copied files.
- `Runtime:` ports, env vars, volumes, networks, health checks.
- `Validation:` commands run or required.
- `Risks:` image size, secrets, permissions, persistence, host-specific assumptions.
