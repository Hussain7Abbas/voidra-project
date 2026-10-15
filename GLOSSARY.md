# Voidra Project glossary

[Vision](VISION.md) · [Documentation](docs/intro.md)

| Term | Meaning |
| --- | --- |
| Action | A unit of work with a type, lifecycle and actor, recorded in `.voidra/actions/`. |
| Task | A board card for an idea or executable action; a promoted idea/action pair appears once, with linked child tasks for larger work. |
| Target release | A task's planned package version, nullable in Backlog and distinct from completed historical `releasedIn` membership. |
| Board column | Backlog, TODO, In progress, Review or Done; organization and progress derived without granting lifecycle approval. |
| Idea | A backlog item that must be promoted into an action before it can run. |
| Slice | A child action delivering a thin, independently demonstrable path through the necessary layers. |
| Gate | A human checkpoint for answers, plan approval or result acceptance. |
| Stage | A lifecycle step such as Discovery, Plan, Implement, Verify, Review or Done. |
| Seam | A public boundary at which tests observe behavior. |
| Run | One skill invocation processing queued actions as far as their gates permit. |
| Run result | A record of one action's run, including checks, changes, commit and remaining issues. |
| Run-start record | Persisted evidence of the action and records an agent consumed before beginning work. |
| Queue | A person's ordered, uncommitted list of actions to run. |
| Profile | Template-defined answers describing the project's problem, users, architecture and constraints. |
| Answer status | Whether an answer is confirmed, inferred, assumed or open. |
| Assumption | An agent-decided answer or assumed profile value, retained at its source. |
| ADR | A project-wide architecture decision record for a hard-to-reverse, surprising tradeoff. |
| Template | Versioned profile questions, an architecture skill and optional lifecycle overrides. |
| Skill | Instructions and references a coding agent follows without requiring the app. |
| Approval revision | The exact contents of the plan files or review proposal accepted by a person. |
| Operation checkpoint | A durable record used to reconcile an interrupted mutation or external side effect. |

The product glossary describes app concepts. This repository's release phases live in [the v1 plan](plan/main.md) and [the v1.1.0 plan](plan-v1.1.0/main.md); its own `.voidra/` has tracked product work since P09.
