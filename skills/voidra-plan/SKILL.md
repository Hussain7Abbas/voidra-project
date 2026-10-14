---
name: voidra-plan
description: Run only queued Voidra Discovery and planning stages, proposing
  questions, plans, slices or Research findings. Preserve source files,
  repository instructions, HEAD and tags; stop before implementation.
license: AGPL-3.0-or-later
metadata:
  version: "0.2.2"
  format-version: "1"
---

Read the repository instructions, profile, action and feedback. Use [Discovery](references/discovery.md), [Plan](references/plan.md), [Research](references/research.md), [runtime](references/runtime.md) and [format](references/format.md).

Use this skill's bundled runtime. Every `start` must include `--mode plan` and your agent name. Null means no queue remains; a non-started phase is already stopped at the planning boundary. Never switch to go mode to bypass this invocation's restrictions.

For Release at Plan, use only the Plan section of [local releases](references/release.md) and stop at Review; never enter finalization. For other planning actions, dispatch the project's template architecture skill following Discovery's procedure. Publish question frontiers, exact three-file plans or linked slices through `planning`. Resolve only explicit delegated choices with reasons. Research publishes findings and proposed ideas through `research`; human-only steps use `human` and stop. Continue the remaining queued planning actions in order.

Write only `.voidra/` and settled-term additions to the root GLOSSARY.md through the helper during Discovery. Preserve all existing glossary bytes. Make no source or instruction writes, commits, amendments, tags or pushes. The helper compares source snapshots, HEAD and tags and refuses implementation preparation/commits in plan mode. A glossary symlink escape is refused. Never alter locks, checkpoints or journals by hand or approve your own plan.

Validate every completed write/group with `npx --yes voidra@0.2.2 check .`; inspect diagnostic paths and stop on structural errors or this action's stale gate. If interrupted, use explicit runtime recovery and stop. On failure, record its reason with `fail`. Report actual evidence, dispatched architecture skill and gate reached. User instructions take precedence.
