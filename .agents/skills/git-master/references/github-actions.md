# GitHub Actions

- Inspect `.github/workflows/`, repository events, runner OS and existing checks
  before editing. Choose triggers deliberately; check PR/fork behavior and avoid
  duplicate or recursive workflow runs.
- Set minimal `GITHUB_TOKEN` permissions, pin third-party actions to reviewed
  immutable commits, and keep credentials in secrets/OIDC. Treat event fields as
  untrusted input; pass them as data rather than interpolated shell code.
- Never execute untrusted PR code with privileged `pull_request_target` access.
  Separate validation from deployment credentials, environments and approvals.
- Set appropriate timeouts/concurrency; cache dependencies and publish artifacts
  separately. Validate YAML and the affected checks, then distinguish local
  validation from the actual hosted run.

Use `pipeliner` for deeper design or failure triage when available. Verify changing
features/action versions against [GitHub's security guide](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
