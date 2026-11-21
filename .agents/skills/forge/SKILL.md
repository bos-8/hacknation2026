---
name: forge
description: "Use when the user selects a project delivery level: OFF, DEMO, POC, PROD or ENTERPRISE."
---

# Forge

## Delivery Level

`$forge off|demo|poc|prod|enterprise` selects the session level; default OFF. Project defaults may live in `.skillpack.json`. Explicit session choices take precedence.

| Level | Expectation |
| --- | --- |
| OFF | Add no delivery requirements beyond the task and repository rules. |
| DEMO | Clearly label sample data, mocks and functionality not yet implemented. |
| POC | Make the agreed scope and critical integrations work; identify remaining simplifications and limits. |
| PROD | Complete the agreed scope without hidden mocks, with appropriate auth, validation, tests, observability, deployment and recovery. |
| ENTERPRISE | Add justified capacity, HA/DR, auditability and evolution analysis based on actual SLOs, RTO/RPO, load and cost. |

Levels never weaken repository requirements or grant spending, deployment, destructive actions or scope expansion. Assess enterprise needs before adding infrastructure; distinguish implemented behavior from a future plan. Test/review automation is controlled independently by AUTOTESTER and OVERSEER.
