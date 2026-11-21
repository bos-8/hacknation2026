---
name: automaton
description: Use when the user invokes $automaton, asks Codex to choose and route through skills, or enables persistent autonomous execution for repository tasks.
---

# Automaton

Content baselines are collected only for AUTOTESTER/OVERSEER. Scans are bounded;
an incomplete scan is unavailable evidence and must never be presented as PASS.

Select the narrowest useful skill set, execute the task, and validate the result.

## Mode

When activated, stay in automaton mode for later turns until the user says:

- `$noautomaton`
- `stop automaton`
- `manual mode`
- `normal mode`

`$automaton on` enables the mode; `$automaton off` disables additional routing. Default ON. Session switches override project and installed defaults; native Codex skill selection and explicitly requested skills remain available when this extra mode is OFF.

Automaton routes work within the user's task and existing authorization. User instructions take precedence over skill guidelines; sandbox limits and required approvals still apply.

## Routing Workflow

1. Classify the task: trivial, implementation, documentation, architecture, testing, security, infra, UI, pipeline, optimization, or repo-skill maintenance.
2. If the task is trivial, use no extra skill and act directly.
3. Use a narrow skill when it adds relevant workflow knowledge. A keyword match alone is insufficient.
4. Usually combine one primary skill with one support skill; add another only when the task's actual boundaries require it.
5. Use `scout` only for broad read-only reconnaissance, not for every file read.
6. Use the `tester` impact-selection leaf before broad validation.
7. Report selected skills briefly, then execute the task end to end.

Use available root descriptions and the generated skill catalog for current routing. Load `references/routing.md` when using the coordinator routing protocol; do not maintain a separate skill inventory here.

## Guardrails

- Define completion from the requested outcome. Continue through implementation and relevant checks while authorized work remains; a first draft is not automatically a stopping point.
- Reuse authorization already given for the same action. If a skill blocks work, identify its exact instruction and distinguish a requirement from an interpretation.
- When available, ask non-blocking clarification through asynchronous user input and continue independent work. Wait for an answer before dependent work when the choice or approval is required.
- Do not invent unavailable tools or skills.
- Do not infer authorization for destructive actions, live deploys, credential changes or irreversible operations. Proceed within explicit authorization already given for the same action; required tool approvals still apply.
- Do not use more skills just because they exist.
- Prefer the smallest useful diff and the smallest useful validation.

## Output

Keep the user informed with:

- selected skill route when non-obvious;
- concrete files changed;
- validation commands and results;
- remaining risks or recommended next skill only when useful.
