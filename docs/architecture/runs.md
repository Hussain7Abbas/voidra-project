# Standalone runs and human review

[Architecture index](Intro.md) · [Ownership ADR](../adr/2026-10-13-run-ownership.md) · [Skill procedure](../../skills/voidra-go/references/runtime.md)

`tools/run-engine` is a Node-only coordination library. Its generated standalone bundle lives inside `skills/voidra-go`; the agent can run it with the app closed. It validates through the public format package, persists consumed records, checks host/PID/start/token ownership, and checkpoints before commit/finalization effects. Private checkpoints live in `.voidra/local/run-checkpoints/`, while run results stay with each action.

The app holds its previous complete index during unfinished grouped operations and prepared/unfinalized run checkpoints. Reviews compare every presented action-directory file to the displayed fingerprint, then carry those hashes through the grouped write. Reject preserves feedback and follows each type’s rework target: implementation types to Implement, Research to Discovery and Release to Plan. Accept finishes implementation/Research; Release stays in Review pending agent finalization. All decisions refuse active or unfinished runs. See [questions, gates and inbox](questions-gates-inbox.md).

The app provides a recovery command for the agent. Git-index reconciliation remains in the standalone runtime: the app never creates an implementation commit or modifies its Git index as a recovery side effect. Prepared file conflicts stop recovery and retain outside edits. Metadata can be completed or rolled back through the format package's explicit operation recovery.

Development linking uses the documented project locations `.claude/skills` and `.agents/skills`. `make skills-link PROJECT=/absolute/project` links real skill folders there; the default target is this repository. Existing conflicting contents are preserved. The bundle and local format reference are deterministic and checked by `make gen-check`; skill frontmatter, length and relative resources are checked by `make lint`. No authenticated agent runs in CI.
