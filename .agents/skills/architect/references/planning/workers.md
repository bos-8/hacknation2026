# Workers And Queues Questions

Use for jobs, asynchronous execution and message delivery requirements.

- Which tasks are slow, CPU/GPU intensive, scheduled, bursty or safe to detach
  from an interactive request? Is an existing worker sufficient?
- Is a queue required for durable retries/backpressure, or is a simpler existing
  job mechanism enough? What throughput, concurrency and delay are acceptable?
- How should duplicate delivery, retries, ordering, cancellation, timeouts and
  dead-letter/recovery handling work? Which effects must be idempotent?
- Who owns job state/results, progress visibility, shutdown/draining and secrets
  needed by workers? Are resource isolation and independent scaling justified?

Capture the job lifecycle and producer/consumer contract before choosing a broker.
Do not promise exactly-once effects or unlimited retries; define the failure and
recovery behavior needed for the actual task.
