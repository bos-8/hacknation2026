---
name: skill-auditor
description: Use for auditing or standardizing Skillpack skills, including frontmatter, trigger descriptions, router/leaf boundaries, metadata, config wiring, and install readiness.
---

# Skill Auditor

Audit installable skills and their routing contracts, not ordinary application code.
Use skill-creator conventions when designing a new skill.

## Workflow

1. Run `scripts/audit_skills.py --skills-root <skills-directory>` with Python 3.11+ for portable installed-structure/resource checks.
   Equivalent `.ps1` and `.sh` launchers use the same backend and arguments.
2. In the source checkout, also run `scripts/modules/audit-skills.ps1 -Detailed`; fix reported failures before editorial cleanup.
3. Review narrow triggers, reachable leaves, meaningful duplication and instruction density. Load `references/maintainer-policy.md` only for the detailed source policy.
4. Regenerate the README/catalog with `scripts/modules/sync-skill-index.ps1` when roots or resource paths change. Do not duplicate automatic discovery in config.
5. Validate by impact: prose needs resource checks, routing needs pressure-suite validation, and packaging/discovery/installer changes or release preparation need config validation and a package build. Installed-only audits report unavailable source checks honestly.

## Reporting

Report blocking failures, material warnings, duplication and validation limits.
Distinguish structurally validated scenarios from model-executed evidence; neither
an unopened package nor an unrun model probe establishes installation/behavior.
Recommend new branches only when they remove real complexity.
