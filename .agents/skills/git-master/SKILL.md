---
name: git-master
description: "Use for Git operations, domain-prefixed commits, pre-push secret checks, gitignore/gitkeep, or GitHub/GitLab repository and review workflows."
---

# Git Master

Handle the requested repository operation using its actual host and conventions.
Load only the matching branch or shared leaf; ordinary code edits do not require
this skill merely because the project uses Git.

## Routing

| Request | Read |
| --- | --- |
| `$git-master messages`, commit wording or a commit/push request | `references/messages.md` |
| `$git-master pre-push-secrets`, secrets/env checks before publication | `references/pre-push-secrets.md` |
| `$git-master gitignore-gitkeep`, ignore rules or empty directory placeholders | `references/gitignore-gitkeep.md` |
| `$git-master git`, local Git, branches, staging, merge or push | `branches/git.md` |
| `$git-master github`, GitHub repository, pull request or Actions | `branches/github.md` |
| `$git-master gitlab`, GitLab repository, merge request or CI | `branches/gitlab.md` |

## Shared Rules

- Inspect status, staged/unstaged changes, branch and target remote before mutation;
  preserve work outside the task. Read-only inspection grants no publication rights.
- Reuse existing scoped authorization. Verify the actual diff and relevant checks
  before committing, pushing, merging, tagging or publishing; account for CI/deploy
  triggers. Do not reset, clean, rewrite shared history or bypass protections as a
  convenience.
- Use an available host connector or authenticated CLI without requesting pasted
  credentials. If user authentication is the only blocker, ask and yield.
- Read `references/messages.md` before preparing commit or squash messages from
  any branch. Report the actual commit/push/CI outcome separately.
- Before publication from any branch, read `references/pre-push-secrets.md` and
  check the actual outgoing content. Use `references/gitignore-gitkeep.md` when
  creating or correcting ignore rules; ignoring files is not a secret scan.

For substantial pipeline design or failing-run investigation, use `pipeliner` when
available. The short hosting leaves below cover platform-specific entry checks.
