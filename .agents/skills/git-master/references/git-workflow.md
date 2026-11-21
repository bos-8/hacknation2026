# Git Workflow

1. Inspect repository status, diff, branch, upstream and remote destination. Avoid
   printing remote credentials; confirm the target without exposing userinfo.
2. Select only task-owned changes, review the staged diff and run relevant checks,
   including [Pre-push secrets](./pre-push-secrets.md) before publication.
   Read [Messages](./messages.md) before creating a commit. Do not silently stage
   unrelated changes or overwrite a dirty worktree.
3. For an authorized push, check the explicit remote/branch and expected CI or
   deployment effects. On divergence, inspect the incoming history and choose a
   merge/rebase consistent with existing policy and the user's scope.
4. Do not automatically force-push, delete branches, discard work or bypass hooks.
   A requested history rewrite needs scoped authorization; verify the expected
   remote commit and use a lease rather than an unconditional force.
5. Report the commit ID and actual destination/result when changed. A rejected
   push or pending CI remains unresolved; do not hide it with success wording.

Reference: [Git push and lease semantics](https://git-scm.com/docs/git-push).
