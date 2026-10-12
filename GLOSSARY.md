# Voidra Project glossary

[Vision](VISION.md) · [Documentation](docs/intro.md)

| Term | Meaning |
| --- | --- |
| Action | A unit of work with a type, lifecycle and actor, recorded in `.voidra/actions/`. |
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

The product glossary is distinct from this repository's phase plan: product actions are not created for this project's phases until dogfooding begins in P09.
