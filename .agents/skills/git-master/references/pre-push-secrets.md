# Pre-push Secrets

Before creating a commit for publication, inspect its exact staged blobs. Before
an authorized push, inspect the outgoing commit range for the intended remote/base,
including intermediate versions later deleted or corrected. Limit blocking findings
to the publication candidate. A clean worktree is not evidence of clean outgoing history.
If the first-push base/range cannot be established, state the uncovered scope.

- Check tracked/staged dotenv files (`.env`, `.env.*`, `env`, `env.*`), private
  keys, auth/credential files, tokens, logs, dumps and generated artifacts. Keep
  actual environment values out of commits; permit needed `.example` templates
  only after checking that their contents are placeholders, not real credentials.
- Use an available scanner with redacted output and explicit range/index coverage,
  e.g. [Gitleaks](https://github.com/gitleaks/gitleaks), verifying its installed
  version's options. Do not upload content to an external scanner without authority.
- Use Skillpack's `scan-changed-files --staged --outgoing` to inspect actual index
  and outgoing blobs against the local upstream. Supply `--base <revision>` when
  needed; a first-push scan can explicitly use `--outgoing --all-history`.
  Missing scope, large blobs, submodules/LFS and scan limits are unavailable
  coverage, not PASS. Without these flags the helper inspects working-tree files
  only. Its patterns do not certify arbitrary data; recheck changed candidates.
- Treat findings as potential secrets until verified. Report path/key/line and
  kind, never values. Resolve real or unresolved sensitive findings before
  publication; do not silently allowlist them or suppress tests to obtain green.
- Keep local env files intact. Correct candidate commits/ignore rules within the
  authorized scope; do not rewrite shared history or rotate credentials silently.
  Already exposed credentials require the owner's rotation/revocation response;
  deleting the latest copy does not revoke them or remove older copies.

Report scope (index/range/files), tool, findings and uncovered areas. A passed
pattern scan is not a guarantee that arbitrary data contains no secrets. This
leaf guides the agent; it does not install or enforce a native Git pre-push hook.
