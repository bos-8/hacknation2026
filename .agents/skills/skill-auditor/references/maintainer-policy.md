# Maintainer Policy

Load for detailed source-checkout policy or a finding that needs interpretation.

## Audit Checklist

- Frontmatter has `name` and `description`; folder name and declared name match.
- `description` starts with `Use when` or `Use for` and has a narrow trigger.
- Body has an H1 and concise actionable sections.
- `agents/openai.yaml` exists with `interface.display_name`, `interface.short_description`, and a default prompt mentioning `$skill-name`.
- Router skills list their leaf skills; leaf skills avoid broad orchestration.
- Local Markdown links and `branches/`, `references/`, `scripts/`, or `tests/` resource paths resolve to real files.
- Every branch and reference Markdown file is reachable from `SKILL.md`, directly or through another routed instruction file.
- The plugin manifest bundles the `skills/` directory; portable config does not duplicate automatic discovery entries.
- A `skills.config` override uses a supported `name` or fully qualified `path` selector; machine-specific paths stay install-local.
- Initial discovery metadata stays within the repository's 8000-character guardrail. This is not Codex's runtime token budget; `skills.max_context_tokens` governs the complete available-skills catalog.
- The skill config fragment is included by `config/profiles/default/manifest.json`.
- A canonical `tests/pressure-prompts/<skill-name>.md` file covers positive and negative routing behavior.
- `tests/pressure-prompts/run-pressure-prompts.ps1` validates every suite; model-backed execution remains explicit and bounded.
- Plugin submission coverage contains exactly five positive and three negative cases.
- Detect stale renamed-skill references throughout roots, branches and references; keep intentional language-specific content valid.
- UI YAML, submission-case counts and editorial rules are Skillpack policy, not universal Codex discovery requirements.
- Separate structural fixture validation from model-executed routing evidence; report unexecuted cases explicitly.

## Quality Rules

- Required shape: YAML frontmatter, `name`, `description`, H1, and concise `##` sections.
- Avoid boilerplate sections that add tokens but no routing or execution value.
- Prefer explicit relationships such as `Related Skills` only when delegation is useful.
- Keep examples short and only include them when they prevent ambiguity.
- Preserve English skill bodies unless a skill is intentionally language-specific.
