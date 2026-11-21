# Cloud Research

Use current primary sources before recommending cloud services whose features, pricing, quotas, or names may have changed.

## Research Rules

- Browse when the user asks for current, latest, best, pricing, limits, managed services, or provider-specific recommendations.
- Prefer official provider docs, pricing pages, changelogs, service quotas, and architecture references.
- State the date-sensitive assumption when a recommendation depends on pricing, availability, or regional support.
- Compare managed services against operational burden: backups, upgrades, HA, monitoring, IAM, network exposure, and lock-in.
- Do not recommend a cloud service only because it is popular; tie it to the workload and constraints.

## Output Shape

- `Need:` workload, scale, region, compliance, budget, and operational constraints.
- `Options:` 2-3 viable services or patterns.
- `Tradeoffs:` cost, complexity, lock-in, operations, scaling, and security.
- `Recommendation:` one default path and why.
- `Sources:` official links used for current facts.

## Related Skills

- Use `architect` when service boundaries or topology are undecided.
- Use `references/iac.md` when the selected service must be provisioned declaratively.
- Use `authkeeper` for IAM and secret access.
- Use the `code-engineer` optimizer leaf for cost or resource-sizing decisions.
