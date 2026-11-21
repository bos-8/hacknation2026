---
name: observability-check
description: "Use for a focused runtime-visibility review covering structured logs, metrics, traces, correlation IDs, health signals, errors, and telemetry."
---

# Observability Check

Review whether a runtime path can be diagnosed after it fails.

## Trigger

Use when:

- a change adds or alters important runtime behavior;
- a flow crosses service, queue, job, worker, or network boundaries;
- debugability or operability is part of the acceptance bar.

## Workflow

1. Identify critical steps, remote calls, retries, queues, jobs, and failure points.
2. Check request, correlation, tenant, trace, or job IDs flow through the path where relevant.
3. Prefer structured logs at boundaries and failures, not noisy logs on every line.
4. Check metrics for success, failure, latency, volume, and saturation where operationally important.
5. Check trace boundaries around network, queue, and job edges when tracing exists.
6. Ensure errors carry actionable context without leaking secrets or sensitive data.
7. Keep metric labels low-cardinality. Put safe request/job/trace IDs in structured logs and trace fields for correlation; do not expose secrets or personal data.

## Output

- `Gaps:` highest-impact observability gaps first.
- `Signals:` logs, metrics, traces, health checks.
- `Fix:` smallest practical instrumentation.
- `Diagnosable After Change:` what operators can confirm.
- `Risk:` noise, missing correlation, or sensitive data exposure.

## Related Skills

- Use `infra-builder` observability leaf for dashboards, alerts, and platform-level signals.
- Use `authkeeper` for sensitive data in logs.
- Use `service-integrator` for cross-service tracing needs.
