---
name: code-engineer
description: "Use for substantial code refactoring, language-specific scripting, or measured optimization when no narrower framework skill fits."
---

# Code Engineer

Route code implementation, refactoring, quality, language, and optimization work to the narrowest leaf.

## Branch Routing

| Intent | Read |
| --- | --- |
| generic language-level implementation, scripting, helpers, mixed-language routing, no narrower framework skill | `branches/implementation.md` |
| `$code-engineer quality`, writing/refactoring/reviewing code quality, naming, duplication, boundaries, maintainability | `branches/quality.md` |

## Direct Leaf Commands

| Command intent | Read |
| --- | --- |
| `$code-engineer optimize`, performance, latency, throughput, memory, bundle, query, build, CI speed, cost, resource use | `references/optimizer.md` |
| `$code-engineer docs`, code comments, docstrings, JSDoc/TSDoc, hover help | `references/code-docs.md` |
| `$code-engineer defensive`, validation, invariants, guard clauses, path safety, retries | `references/defensive-programming.md` |
| `$code-engineer python`, Python modules, scripts, tests, typing, tooling | `references/python.md` |
| `$code-engineer powershell`, `.ps1`, `.psm1`, automation, Windows-first shell work | `references/powershell.md` |
| `$code-engineer abap`, SAP ABAP, CDS, RAP, DDIC, BAPI, transports | `references/abap.md` |

If intent is mixed, read the branch first, then the narrow leaf.

## Guardrails

- Prefer narrower framework, database, architecture, infra, pipeline, UI, auth, or security skills when they dominate the task.
- Keep the smallest useful diff.
- Preserve public contracts unless the task requires changing them.
- Preserve existing repository patterns unless clearly harmful.
- Use English names for new variables, functions, classes and modules; preserve external contract names unless their migration is authorized. Prefer names that explain purpose without long, unwieldy identifiers.
- Extract logic used in two or more places into a focused function when it represents the same responsibility. Do not merge unrelated behavior merely because its syntax looks similar; reuse alone does not prove a performance gain.
- Run affected checks. Load `tester` when selecting validation, investigating runtime behavior or authoring tests needs a dedicated workflow; routine existing checks need no extra skill.
- Do not present optimization as complete without baseline and repeat measurement.

## Reporting

Summarize the change and actual validation results, including failed or unavailable checks. Add runtime, artifact, compatibility or risk details only when material; do not force a fixed response template for small changes.
