# GitLab CI

- Inspect `.gitlab-ci.yml`, included templates and the target instance/version.
  Use `workflow: rules` and job `rules` deliberately to avoid duplicate branch/MR
  pipelines; check `needs` against the jobs that can actually exist.
- Select compatible runner tags/images. Give jobs appropriate timeouts; separate
  dependency caches from expiring delivery artifacts.
- Use protected/masked variables or scoped identities without putting credentials
  in YAML or logs. Keep untrusted MR code away from privileged runners and secrets;
  preserve protected environment and deployment approvals.
- Use CI Lint with includes resolved when available. Report local syntax checks
  separately from server validation and the actual pipeline result.

Use `pipeliner` for deeper design or failure triage when available. Check current
syntax and CI Lint in the [official reference](https://docs.gitlab.com/ci/yaml/).
