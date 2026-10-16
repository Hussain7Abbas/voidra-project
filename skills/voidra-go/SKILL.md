---
name: voidra-go
description: Run queued Voidra actions through Discovery, planning,
  implementation and verification in a local Git repository. Leave questions,
  exact plans, Research findings or committed results for human decisions.
license: AGPL-3.0-or-later
metadata:
  version: "1.1.1"
  format-version: "1"
---

Read the repository instructions, project profile, glossary, action, earlier runs and rejection feedback. Use the [runtime procedure](references/runtime.md) and [format reference](references/format.md). This skill works without the app.

Use the bundled runtime for planning writes, ownership and commits. Discovery/Plan preserves absent Git; approved Bootstrap Go initializes Git after durable consumption. Select the actual worktree root for existing repositories. Never hand-edit locks, checkpoints or journals, clear another owner, approve your own plans/results, amend, tag or push. Persisted consumption precedes work. Heartbeat and check ownership before writes; lost ownership means stop.

1. For explicit recovery, use the runtime's recovery procedure, validate and stop. Otherwise `start` with your agent name. Null means no queued action is currently eligible (the queue may contain blocked or gated requests). Preserve waiting requests; never clear them or requeue consumed work implicitly. A phase other than `started` is already stopped; summarize its gate and continue to the next queued action.
2. Read the returned action. For Feature, Bug, Improvement/refactor or Profile change in Discovery or Plan, read [Discovery](references/discovery.md) and [Plan](references/plan.md), and dispatch the project's template architecture skill. Publish its proposal through this run's `planning` command, then stop this action at questions, approval or slices. Never fabricate answers. Resolve only explicit agent-decides choices through `choices`, with reasons.
3. For Release, use [local releases](references/release.md): Plan proposes and stops at Review; accepted Review allows the guarded version/changelog commit and local tag. Never tag yourself.
4. For Research, use [Research](references/research.md); publish findings and proposed ideas without code or commits. For a human-only step, use `human` to create instructions and a checklist that blocks this action, then stop it.
5. For Implement or Verify, follow [implementation and review](references/implementation.md). Before editing each batch, `guard` the exact paths. A changed plan, consumed record or overlapping user edit stops work. Fix checks and both reviews before preparing the report.
6. `prepare`, validate, `commit` using the project's message style, validate, and `finalize`, validate. Leave implementation results at Review; Release finishes at Released. Commit trailers identify the action and run; interrupted commits reconcile instead of repeating.
7. Continue eligible requests in order. In versioned ordered-intent projects, the runtime selects the first eligible request in the Actions sequence, skipping blocked/gated entries without consuming them. Legacy queues keep strict first-entry behavior. If work fails, use `fail` with the reason and validate; do not claim completion or invent a passing check.

Validate after each completed file write or grouped operation with `npx --yes voidra@1.1.1 check .`. An unrelated stale gate may remain; stop for structural errors or a stale gate belonging to this action. Report actual checks, changed paths, commits and gates. Call results at Review waiting for a human decision; do not call them Done. The user's instructions take precedence over the skill.
