# Quality Branch

Improve code only where it makes the change clearer, safer, or easier to maintain.

## Core Rule

Follow Clean Code, DRY, KISS, YAGNI, and SOLID when they improve clarity and maintainability. Do not apply them mechanically.

## Trigger

Use when the task involves:

- writing or refactoring non-trivial code;
- unclear names, duplicated logic, oversized functions, tangled modules, or hidden side effects;
- choosing abstractions, boundaries, responsibilities, or error handling;
- reviewing code quality beyond pure correctness.

Do not use for trivial one-line edits unless the user explicitly asks for clean code review.

## Decision Rules

- Prefer readable names over comments that explain bad names.
- Prefer small focused functions when extraction removes real complexity.
- Extract repeated logic with the same responsibility into a named function once it has multiple real call sites; tolerate coincidental similarity when abstraction would obscure intent.
- Keep behavior local and explicit.
- Minimize side effects and shared mutable state.
- Preserve existing repository patterns unless they are clearly harmful.
- Add abstractions only when they reduce real complexity or protect a real boundary.
- Do not add unused extensibility, generic frameworks, or speculative configuration.

## Efficient Workflow

1. Identify the smallest quality issue that affects the task.
2. Fix only the local code path unless shared behavior is involved.
3. Keep public contracts stable unless the task requires changing them.
4. Add focused validation for changed behavior.
5. Report only meaningful clean-code decisions, not every rename.

## Anti-Patterns

- Refactoring unrelated code to satisfy a style preference.
- Creating abstractions before two or more real call sites justify them.
- Hiding control flow behind clever helpers.
- Adding comments that restate code.
- Over-validating internal values already guaranteed by types or trusted callers.
- Presenting a readability refactor as an optimization without baseline and repeat measurement.
