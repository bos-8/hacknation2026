# Tester Test Authoring

Write tests that prove behavior and prevent regressions without coupling to implementation details.

## Invocation

Load through `$tester author` or when regression-test design dominates the task.

## Test Choice

- Unit tests for pure logic, validators, mappers, services, and isolated branches.
- Integration tests for API routes, database behavior, auth checks, queues, and cross-module contracts.
- E2E tests for critical user workflows and browser/runtime integration.
- Contract tests for shared API, event, DTO, schema, or generated client behavior.
- Regression tests for confirmed bugs before or with the fix.

## Good Test Rules

- Name tests by behavior, not implementation.
- Arrange only necessary state.
- Assert observable outcomes.
- Include edge cases at boundaries: empty, invalid, unauthorized, missing, duplicate, expired, or concurrent inputs.
- Keep fixtures small and explicit.
- Avoid snapshot tests unless stable structure matters.
- Avoid mocking the unit under test.
- Prefer one clear reason for failure per test.

## Bug Fix Flow

1. Reproduce the bug with a failing or targeted test when feasible.
2. Apply the smallest fix.
3. Verify the new test fails before the fix when practical.
4. Re-run the targeted test and nearby affected checks.

## Avoid

- Testing private implementation details.
- Broad brittle mocks that duplicate production logic.
- Adding tests that only assert framework behavior.
- Writing large e2e tests when a unit or integration test proves the risk.
