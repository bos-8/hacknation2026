---
name: briefer
description: Use for turning plans, investigations, repositories, modules, or architecture decisions into concise actionable briefs, summaries, or handoff packets.
---

# Briefer

Turn messy context into a short, decision-ready brief with facts, assumptions, risks, and next actions.

## Trigger

Use for a brief, summary, recap, executive summary, handoff, "what is this repo about", plan summary, repo/module brief, decision brief, or concise post-investigation packet.

Do not use for full documentation pages unless the user asks to persist docs; use `scribe` for that.

## Codebase-First Rule

If a question can be answered by reading repo files, docs, configs, package manifests, or existing summaries, inspect them instead of asking the user. Prefer:

1. `docs/0000-overview.md` when present;
2. README and AGENTS/instructions files;
3. package/config files;
4. source tree, tests, scripts, deployment files;
5. recent user discussion when repo evidence is not available.

Separate confirmed facts from assumptions.

## Workflow

1. Identify the brief type: `plan`, `repo`, `module`, `decision`, `handoff`, or `status`.
2. Gather only the smallest useful context.
3. Extract the goal, current state, important constraints, open decisions, risks, and next actions.
4. Ask one targeted question only if a missing answer would materially change the brief.
5. Produce a concise brief; prefer bullets and short sections.
6. If the user asks to save it, delegate persisted Markdown structure to `scribe`.

## Output Shape

Include only the relevant goal, confirmed facts, assumptions, risks, next actions
and unresolved decisions. Handoffs/status briefs include actual validation.

## Related Skills

- Use one-question-at-a-time pressure questioning only when the brief needs unresolved decisions clarified.
- Use `scout` for fast read-only repo reconnaissance when a repo/module brief needs broad discovery.
- Use `architect` before briefing unresolved system topology.
- Use `scribe` when the brief must be saved under `docs/`.
- Use `repo-memory` when the brief should become repo-local AI memory.
