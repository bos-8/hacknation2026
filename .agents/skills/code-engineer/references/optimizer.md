# Optimizer

Optimize only after defining what must get faster, cheaper, smaller, or less resource-heavy.

## Invocation

Load through `$code-engineer optimize` or when measured optimization dominates the task.

## Trigger

Use when the task involves:

- slow runtime paths, high latency, low throughput, or heavy memory use;
- large frontend bundles, slow page loads, or expensive rendering;
- slow SQL/ORM queries, missing indexes, N+1 behavior, or inefficient data access;
- long builds, slow tests, slow CI pipelines, or cache strategy improvements;
- cloud/runtime cost reduction, queue pressure, or resource saturation;
- reviewing a proposed optimization for correctness and regression risk.

Do not use for pure readability refactors; use `branches/quality.md` for that.

## Core Rule

No optimization claim without a baseline and a repeat measurement. If measurement is unavailable, state the assumption and keep the change reversible.

## Workflow

1. Define the target metric: latency, throughput, memory, bundle size, build time, query count, or cost.
2. Capture a baseline from logs, profiler output, benchmark, query plan, bundle analyzer, or CI timing.
3. Identify the bottleneck before changing code.
4. Prefer the smallest change that affects the measured bottleneck.
5. Preserve behavior and public contracts unless the user accepts a breaking optimization.
6. Re-measure and compare against the baseline.
7. Run correctness validation for the affected path.

## Decision Rules

- Prefer algorithmic or data-access fixes before micro-optimizations.
- Do not add caches without invalidation, ownership, size, and freshness rules.
- Avoid global memoization for user-specific, auth-sensitive, or mutable data.
- Optimize hot paths, not code that is merely visible.
- Keep readability unless the performance gain is measured and worth the tradeoff.
- Treat parallelism, batching, pooling, retries, and prefetching as load-shaping tools with failure modes.

## Output Shape

- `Target:` metric and desired outcome.
- `Baseline:` observed current value or missing measurement.
- `Change:` smallest optimization applied or proposed.
- `Validation:` correctness checks and performance re-measurement.
- `Risks:` cache invalidation, stale data, concurrency, memory growth, degraded readability, cost shift.

## Related Skills

- Use `blast-radar` when an optimization changes shared contracts or hot shared modules.
