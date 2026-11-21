# Observability

Add signals that help operators detect, diagnose, and recover from real failures.

Focus on platform collectors, dashboards, alerts and deployment health. Use `observability-check` for application instrumentation and correlation through code paths.

## Rules

- Start from user-visible failure modes and critical dependencies.
- Prefer structured logs with correlation IDs where request tracing matters.
- Add metrics for latency, traffic, errors, saturation, queues, and resource pressure.
- Separate liveness from readiness when the platform supports both.
- Alert on symptoms and SLO burn, not every noisy internal event.
- Avoid logging secrets, tokens, PII, or full request bodies unless explicitly safe.

## Validation

- Confirm the app emits expected logs or health responses locally when possible.
- For dashboards or alerts, document what must be checked in the remote system.

## Output Shape

- `Signals:` logs, metrics, traces, health checks.
- `Failure Modes:` what each signal detects.
- `Dashboards/Alerts:` threshold, owner, and response expectation.
- `Validation:` local checks or remote verification required.
- `Risks:` noisy alerts, missing correlation, sensitive data in logs.
