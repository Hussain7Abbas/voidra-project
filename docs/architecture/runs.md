# Standalone runs and human review

[Architecture index](Intro.md) · [Ownership ADR](../adr/2026-10-13-run-ownership.md) · [Skill procedure](../../skills/voidra-go/references/runtime.md)

`tools/run-engine` is a Node-only coordination library. Its generated standalone bundle lives inside `skills/voidra-go`; the agent can run it with the app closed. It validates through the public format package, persists consumed records, checks host/PID/start/token ownership, and checkpoints before commit/finalization effects. Private checkpoints live in `.voidra/local/run-checkpoints/`, while run results stay with each action.

The app holds its previous complete index during unfinished grouped operations and prepared/unfinalized run checkpoints. Reviews compare exact action/run bytes to the displayed fingerprint, then carry those hashes through the grouped write. Reject preserves feedback and returns Docs/chore to Implement; Accept finishes a completed, committed result. Both refuse active or unfinished runs.

The app provides a recovery command for the agent. Git-index reconciliation remains in the standalone runtime: the app never creates an implementation commit or modifies its Git index as a recovery side effect. Prepared file conflicts stop recovery and retain outside edits. Metadata can be completed or rolled back through the format package's explicit operation recovery.

Development linking uses the documented project locations `.claude/skills` and `.agents/skills`. `make skills-link PROJECT=/absolute/project` links real skill folders there; the default target is this repository. Existing conflicting contents are preserved. The bundle and local format reference are deterministic and checked by `make gen-check`; skill frontmatter, length and relative resources are checked by `make lint`. No authenticated agent runs in CI.
