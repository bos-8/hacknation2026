# IaC

Treat infrastructure code as versioned contracts with reviewable plans, stable state, and clear ownership.

## Rules

- Prefer declarative resources and explicit dependencies over hidden imperative setup.
- Keep state backend, locking, workspace/environment, and provider versions explicit.
- Separate reusable modules from environment overlays only when reuse is real.
- Keep variables typed and documented when the tool supports it.
- Mark sensitive outputs and avoid committing secrets or generated credentials.
- Avoid broad IAM permissions; delegate IAM review to `authkeeper` when needed.
- Use import/migration plans for existing resources instead of recreating stateful infrastructure.

## Validation

- Run format and validation commands when available.
- Use plan/dry-run output before applying changes.
- Never imply apply/deploy happened unless the apply command actually ran.

## Output Shape

- `State:` backend, workspace/environment, ownership.
- `Resources:` created/changed infrastructure.
- `Plan:` expected changes and migration notes.
- `Validation:` fmt/validate/plan commands.
- `Risks:` drift, destructive replacement, secrets, IAM, state locking.
