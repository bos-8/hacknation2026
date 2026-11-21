# Implementation

Route language-level implementation to the narrowest useful language leaf.

## Trigger

Use when:

- the task is mostly code or scripting in a specific language;
- no framework/domain skill is more specific;
- the repo has mixed languages and the agent must choose the right language conventions;
- the user asks for generic implementation, cleanup, or helper code.

Do not use when a narrower stack skill applies first, such as `frameworker` for Next.js/NestJS or `databaser` for SQL/PostgreSQL/Prisma.

## Workflow

1. Detect the language, runtime, package manager, and tooling from repo files.
2. Use `scout` for read-heavy language/runtime discovery across large repos.
3. Choose the narrow leaf:
   - `references/python.md` for Python modules, scripts, tests, typing, and tooling.
   - `references/powershell.md` for Windows-first PowerShell scripts and automation.
   - `references/abap.md` for SAP and ABAP artifacts.
   - For other languages, use the repository's established runtime and tooling directly; do not invent a missing language leaf.
4. Reuse existing naming, formatting, lint, type, and test conventions.

## Related Skills

- Use the `authkeeper` security-review-light leaf when code handles untrusted input, secrets, files, or outbound calls.
- Use `dependency-upgrade-safe` for runtime or package upgrades.
