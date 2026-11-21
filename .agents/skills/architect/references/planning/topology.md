# Topology And Scale Questions

Use for deployment-unit boundaries and the load/reliability constraints that
justify them. Reuse directly when another workflow needs only this decision.

Ask only unresolved questions:

- Is this a new system or an incremental change? Which current boundaries and
  compatibility commitments must remain?
- How many registered, active and concurrently active users are expected? What
  requests/jobs per second, payload sizes, bursts and growth estimates are known?
- Is one deployable application, a modular monolith, separately deployed frontend
  and backend, or independent services needed? What concrete ownership, release,
  isolation or scaling requirement justifies the split?
- What latency, availability, recovery-time/data-loss targets, operating budget
  and team deployment capabilities constrain the choice?

Capture an agreed deployment shape and its reasons, scale assumptions and review
triggers. A user count alone does not determine capacity. Prefer the smallest
supported design; do not assume microservices, HA or multi-region are required.
