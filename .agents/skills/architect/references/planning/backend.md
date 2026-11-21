# Backend Questions

Use for API ownership, runtime boundaries and synchronous service work.

- What business capabilities and external integrations belong in the backend?
  Which modules/services already own them?
- Is one API/runtime enough, or are independent ownership, isolation, release or
  scaling requirements forcing separate services?
- Which synchronous APIs, streaming connections and third-party calls need
  contracts, deadlines, idempotency and compatibility during rollout?
- Which runtime/tooling and operating constraints are fixed? What work should
  leave request handling because of duration, retry or resource requirements?

Capture capability ownership, API boundaries and failure/compatibility contracts.
Use the workers topic for unresolved asynchronous ownership and the data topic
for storage decisions; avoid adding a service merely to create another layer.
