# Skill release distribution

Extends [root instructions](../../AGENTS.md). This Node-only tool copies checked source skills/templates to the distribution repository; it never installs into a real user home.

- Prevalidate the immutable staged release before any push. Preserve unrelated skills/catalog fields and refuse dirty, diverged or changed destinations. Never force-push, rewrite existing commits or change the active GitHub account.
- Invoke the destination's own make validate, skills-config and single-skill make publish. Each outgoing skill commit contains only that skill; publish shared templates/catalog/docs separately afterward. Stop at the first failure and report prior completed publication honestly.
- Dry runs use an isolated temporary clone, show the actual binary-capable diff and change paths, and never write the requested destination or its remote. Tests use real temporary repositories and the pinned genuine publishing fixture, never authenticated CI writes.
- Preserve AGPL-3.0-or-later and each skill's self-contained assets. Keep fixture provenance and the distribution architecture/evidence current.

Keep CLAUDE.md as only @AGENTS.md with a trailing newline.
