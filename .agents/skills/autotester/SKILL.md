---
name: autotester
description: "Use when the user enables or disables automatic validation after implementation."
---

# Autotester

## ON / OFF

- `$autotester on` enables automatic affected checks; `$autotester off` disables this extra automation.
- Defaults are OFF; a session switch overrides project and installed defaults.
- Use `tester` impact selection and runtime validation; avoid duplicating its workflows here.
- Execute explicit argument arrays with the installed `hooks/skillpack/modes_core.py run-tests` helper, passing cwd, session_id and commands on stdin as JSON.
- The helper records actual process exit codes against the task revision. Report FAILED, STALE, UNAVAILABLE or NOT_RUN truthfully; a plan or agent-written assertion is not PASS.
- Git and a complete bounded task baseline are required for receipts. Use environment-based credentials; raw command arguments are excluded from receipts.
- Stop is advisory: it requests verification once, then allows continuation with actual outcomes. Continuation never proves PASS; report incomplete checks explicitly.
- Existing task/repository checks and permissions remain applicable when this mode is OFF. Post-deploy checks must fit the authorized environment.
