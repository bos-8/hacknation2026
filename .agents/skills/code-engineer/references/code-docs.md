# Code Docs

Add code documentation only when it helps future readers or IDE users understand intent, contracts, or constraints.

Use descriptive English identifiers first. Add inline comments only for information
that names cannot express clearly, or when encoding it in a name would make that
name unwieldy. API documentation describes contracts and is separate from
redundant narration of the implementation.

## Invocation

Load through `$code-engineer docs` or when native code documentation dominates the task.

## When To Document

Add native doc comments for:

- exported/public functions, classes, methods, hooks, components, modules, or scripts;
- non-obvious parameters, return values, thrown errors, side effects, or async behavior;
- security, auth, tenancy, idempotency, retry, caching, or transaction constraints;
- invariants that callers must preserve;
- APIs used across service, package, or module boundaries.

Use the language-native format:

- TypeScript/JavaScript: TSDoc/JSDoc.
- Python: docstrings.
- C#: XML docs.
- PowerShell: comment-based help for scripts/functions.
- Java/Kotlin: Javadoc/KDoc.
- C/C++: documentation comments supported by the project, such as Doxygen `@brief`.

Keep summaries concise and immediately attached to the declaration so the editor
can show them on hover. Document public/reusable functions and non-obvious helper
contracts; do not add boilerplate to every trivial private function.

File/module summaries are optional. Use `@brief` only where the language's
documentation tooling supports it; otherwise use a native module docstring,
JSDoc summary or PowerShell `.SYNOPSIS`. Do not require a file-path header.

## When Not To Comment

Do not add comments that:

- restate the code;
- explain obvious assignments or control flow;
- compensate for bad names that can be improved;
- describe old behavior after a change;
- duplicate type information already clear from signatures.

## Good Comment Shape

Keep comments short and contract-focused:

```ts
/**
 * Creates a session cookie for a verified user.
 * Requires a server-side session id; never pass raw access tokens here.
 */
export function createSessionCookie(sessionId: string): string {
  // ...
}
```

## Inline Comments

Use inline comments for intent, invariants, edge cases, external constraints, or non-obvious tradeoffs. Keep them near the relevant line.
