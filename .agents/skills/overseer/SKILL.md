---
name: overseer
description: "Use when the user enables or disables independent review of completed task changes."
---

# Overseer

## ON / OFF

- `$overseer on` enables independent read-only review; `$overseer off` disables this extra review. Default OFF.
- Use the installed `overseer` agent profile for correctness/security. When overseer_reviewers=2, add `overseer-delivery` for tests, scope and operability.
- Give reviewers the actual task, changed-file scope, revision and observed check outcomes. They report findings, not edits or new authorization.
- Require JSON with status PASS or CHANGES_REQUIRED and findings containing priority, path and evidence. Fix relevant blocking findings and repeat affected checks; limit automatic review to two rounds.
- SubagentStart/Stop callbacks record actual reviewer activity and invalidate review when files change during review. Receipts are evidence of review activity, not proof that the model is correct.
- When delegation or the requested profile is unavailable, call the mode helper's unavailable action with kind=review and a safe reason. Never substitute an inline self-review for a claimed independent review.
- Stop is advisory, with one verification request and bounded review rounds. It can continue with missing or unavailable reviews; state that outcome explicitly and never present continuation as approval.
