---
name: infra-builder
description: "Use for infrastructure, environments, deployment topology, Docker, cloud resources, IaC, networking, observability, or runtime secrets."
---

# Infra Builder

One visible Infra Builder skill. Route first, then load only the topology branch or one leaf.

## Branch Routing

| Intent | Read |
| --- | --- |
| infrastructure topology, runtime contracts, environments, deployment units, local/production setup | `branches/topology.md` |

## Direct Leaf Commands

| Command intent | Read |
| --- | --- |
| `$infra-builder docker`, Dockerfiles, Compose, images, health checks, volumes, local containers | `references/docker.md` |
| `$infra-builder cloud`, current cloud services, provider selection, pricing-sensitive choices | `references/cloud-research.md` |
| `$infra-builder iac`, Terraform, OpenTofu, Pulumi, Bicep, CloudFormation, state, plans | `references/iac.md` |
| `$infra-builder networking`, ports, DNS, TLS, ingress, routing, firewalls, service connectivity | `references/networking.md` |
| `$infra-builder observability`, logs, metrics, traces, health checks, dashboards, alerts | `references/observability.md` |
| `$infra-builder secrets`, env vars, secret stores, runtime config, rotation, permissions | `references/secrets-runtime.md` |

If intent is mixed, read `branches/topology.md` first, then the narrow leaf.

## Guardrails

- Use `architect` for system topology and rollout decisions.
- For unresolved ingress or capacity decisions, reuse `$architect planner proxy` or `$architect planner topology` when that skill is available; skip the full interview when one topic suffices.
- For requested execution on remote targets, use `remote-worker` when available; planning infrastructure does not itself authorize remote operations.
- Use `scout` for broad read-only discovery of services, runtimes, ports, deployment files, and environment contracts.
- Use `pipeliner` when infrastructure is provisioned or deployed through CI/CD.
- Use `authkeeper` for IAM, secret handling, and least privilege.
- Use the `code-engineer` optimizer leaf for cloud cost, resource sizing, or performance tuning.
- Run obvious existing checks directly; use `tester` when choosing checks, investigating results or writing tests needs its workflow.
- Inspection and plans do not authorize apply, deployment or resource deletion. Require authorization for the actual target and reuse consent already given.
