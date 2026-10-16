# Executable skills

Extends [root instructions](../AGENTS.md). Skills are project-local agent instructions with self-contained references and runtime assets. Keep SKILL.md concise; move detailed procedures into referenced files.

- Use public `voidra` schemas, validation and grouped writes. Validate after each completed write or group. Runtime, local format references and process helper are generated through `make gen`; never hand-edit generated assets.
- `voidra-go` dispatches template planning and runs approved implementations, Research and human blockers. `voidra-plan` uses the same contained helper in explicit planning-only mode. Both have self-contained generated format, template and native-process assets.
- `voidra-architect-general` proposes question frontiers, plans and linked slices; its helper writes planning and settled glossary terms only. It does not approve or implement its own proposals.
- Run ownership requires host, PID/start identity and token. Heartbeat age cannot authorize clearing a live owner. Stop on outside-edit conflicts, gate stops or lost ownership.
- Lint metadata, length and relative resources with `make lint`, and check artifact freshness with `make gen-check`. Real agent checks run locally using the root procedure, never in CI.
- `make skills-link` preserves conflicting contents and links only real skill folders into `.claude/skills` and `.agents/skills` under the selected project.

- ADR proposals and implementation require all three criteria: hard to reverse, surprising without context and a real trade-off. Preserve existing ADR naming or use date and title. Planning never writes accepted ADRs; approved implementation may write them. Add only settled glossary terms and preserve existing meanings. Knowledge goldens are deterministic examples and do not count as real-agent evidence.

Keep the sibling CLAUDE.md containing only `@AGENTS.md` and a trailing newline.

- voidra-release creates/queues local Release work; Go plans and stops at Review before committing/tagging. Plan mode never finalizes. Runtime owns commit/tag recovery and completed-member updates. Keep the Release guide self-contained in Go/Plan and generated intake scripts/references current.

- `voidra-sync` reads real outside commits and writes only source-linked profile/proposals plus its Sync record. It never replaces confirmed answers, queues proposals or writes source/Git/glossary/instructions. Ship its matching template copies and generated runtime/format/notices. Repeat and partial-write recovery must preserve proposal identities and refuse live owners/outside edits.

- Every distributable Voidra skill declares metadata.version and metadata.format-version in SKILL.md and retains the full AGPL LICENSE. The app builds hash markers from complete payloads. Release copies remain owned here; make skills-sync prevalidates and uses the distribution repository’s own single-skill publishing rules.

- Validation commands pin the exact declared library version. The release alignment helper updates skill/ref commands; intake/app-created planning READMEs derive the current package version. Regenerate standalone assets after changing that guidance.

- Workflow Go uses the runtime's `taskRunKind`: Planning asks edge-case questions and publishes an exact plan/subtasks, TODO is idle, In progress implements, Review performs separate read-only QA and security. Keep `references/quality.md` bundled in Go/Plan; Plan mode cannot publish a QA result. Real-client verification must exercise the new owned routes rather than treating an implementation's self-check as QA. Go/Sync UI launch only opens the selected app with a copied invocation; no skill is submitted automatically.
