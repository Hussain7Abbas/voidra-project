# Executable skills

Extends [root instructions](../AGENTS.md). Skills are project-local agent instructions with self-contained references and runtime assets. Keep SKILL.md concise; move detailed procedures into referenced files.

- Use public `voidra` schemas, validation and grouped writes. Validate after each completed write or group. Runtime, local format references and process helper are generated through `make gen`; never hand-edit generated assets.
- `voidra-go` dispatches template planning and runs approved implementations, Research and human blockers. `voidra-plan` uses the same contained helper in explicit planning-only mode. Both have self-contained generated format, template and native-process assets.
- `voidra-architect-general` proposes question frontiers, plans and linked slices; its helper writes planning and settled glossary terms only. It does not approve or implement its own proposals.
- Run ownership requires host, PID/start identity and token. Heartbeat age cannot authorize clearing a live owner. Stop on outside-edit conflicts, gate stops or lost ownership.
- Lint metadata, length and relative resources with `make lint`, and check artifact freshness with `make gen-check`. Real agent checks run locally using the root procedure, never in CI.
- `make skills-link` preserves conflicting contents and links only real skill folders into `.claude/skills` and `.agents/skills` under the selected project.

Keep the sibling CLAUDE.md containing only `@AGENTS.md` and a trailing newline.
