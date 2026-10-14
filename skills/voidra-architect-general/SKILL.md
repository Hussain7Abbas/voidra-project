---
name: voidra-architect-general
description: Run Discovery and propose plans or thin slices for Voidra actions
  using the general project profile. Stops for questions or plan approval;
  writes planning records and settled glossary terms without implementing or
  committing.
license: AGPL-3.0-or-later
metadata:
  version: "0.2.2"
  format-version: "1"
---

Read the repository instructions, `.voidra/README.md`, the general profile, target action and its questions/feedback. Use the [planning procedure](references/planning.md) and the generated [format and lifecycle reference](references/format.md). This skill works without the app. If no action ID was provided, select the first unblocked agent action in the personal queue; never invent user answers or select a human action.

Inspect code and rejected ideas before asking whether a feature exists. Read relevant architecture and glossary pages. Profile answers marked inferred, assumed or open are not confirmed facts. Preserve the person's constraints; distinguish a source-backed inference from a delegated choice.

During Discovery ask all currently actionable questions in one prerequisite frontier. Do not ask questions whose prerequisites are unanswered. Every question explains why, offers lettered options with one recommendation, allows free text and lets the person delegate. Persist the question frontier with the bundled helper before presenting it in chat, then stop until the person answers. Planning writes are already authorized by invoking this skill; do not ask whether to save questions. Settle domain terms through concrete examples and update only the root glossary, preserving established definitions.

When scope is clear, propose requirements with explicit exclusions, a blueprint with public testing seams and only ADR proposals that pass all three criteria, and observable acceptance criteria. For Bootstrap use the profile to propose the smallest useful path through setup, a working behavior and verification. Choose tooling from confirmed constraints; ask when an unknown materially changes scope or architecture.

If work cannot fit one agent session, split it into thin demonstrable child slices, each crossing the required data/logic/interface/tests layers. Order them with dependencies, explain each deliverable and stop for their individual planning loops. Avoid separate database-only, UI-only or test-only slices.

Use bundled `scripts/architecture.mjs` for proposals, with JSON on stdin. It validates the whole project, preserves earlier question rounds, applies expected-hash grouped writes, enforces answered prerequisites and stops at gates. See the procedure for exact input. Validate each completed write with `npx --yes voidra@0.2.2 check .`. Never invent approval, alter the plan hashes to bypass a gate, start implementation, change source/instruction/ADR files, commit, tag or push. An active run lock or conflict requires stopping for the owner/recovery workflow.

For a parent with slices, explain which unblocked child to plan first. For a plan, summarize its scope, seams, exclusions and ADR proposals and leave it at Plan waiting for approval. Report exactly the questions or gate reached; never call a proposal approved. Describe planned acceptance checks as planned; report only checks actually executed as passed.
