# Standalone runtime

Use Node 24.13.0+. Resolve the installed skill folder from the skill path (`${CLAUDE_SKILL_DIR}` in Claude Code), then run `node <skill-folder>/scripts/runtime.mjs <command>`. The project defaults to the current directory; `--project <folder>` selects it explicitly. Commands return JSON and exit 0/1. `help` lists flags.

- `start --agent claude-code|codex [--owner-pid PID]`: validates the queue, atomically persists ownership, consumption and the start result, and returns a bounded action/run/phase/token summary; full snapshots remain private. A null result means no pending request is eligible. In versioned ordered-intent projects, blocked/gated requests remain while the first eligible request in Actions order runs; legacy queues retain strict first-entry behavior. Reordering never requeues consumed requests. A non-started phase already stopped at a gate and requires no work or commit. Use `--mode plan` for planning-only execution. Discovery/Plan can start without Git and preserve its absence. An existing repository must be selected at its canonical worktree root, including linked worktrees; subfolders are refused before run writes. Go initializes a missing repository only for Feature Bootstrap at Implement/Verify with current exact plan approval, after persisting ownership and consumption. Other implementation requires Git. No setup commit is created; the normal first result commit carries action/run trailers and the initial shared planning records so a fresh clone validates. That frozen baseline excludes private local state and pre-existing source; outside baseline edits stop the run.
- `heartbeat --token TOKEN`: proves PID/start/token ownership, then updates the heartbeat.
- `release-plan --token TOKEN --report FILE`: writes a structured Release proposal and stops at Review with no version/Git effects. See [releases](release.md).
- `prepare --token TOKEN --report FILE`: validates current records, allowed commit paths and successful checks; persists the prepared Review result and commit checkpoint.
- `commit --token TOKEN --message TEXT`: checks prepared bytes and HEAD, persists intent, and uses a separate Git index to commit this action. Matching action/run trailers reconcile an existing commit instead of creating another.
- `finalize --token TOKEN`: records the commit hash, reconciles only the selected index entries and releases its own lock. This metadata cannot be inside the commit that it names; leave it for the next planning commit.
- `fail --token TOKEN --summary TEXT`: writes a failed run, preserves work for inspection and releases its own lock.
- `inspect --run RUN`: reads a checkpoint. `recover --run RUN`: explicit recovery after the owner exits; a live or unverifiable owner is never cleared. Generic recovery without a commit records an interrupted result. A verified approved Release intent can resume its prepared commit and tag. Recovery with a matching commit finalizes it. Release recovery reconciles matching local tags and atomically completed member updates; conflicting tags are never moved. Outside edits cause conflicts and are preserved. Repeat recovery is idempotent.

Write the report to `.voidra/local/report-<run-id>.json` (private, never committed):

```json
{
  "summary": "What changed and any remaining issues.",
  "paths": ["README.md"],
  "checks": [{"name": "Documentation reviewed", "passed": true}, {"name": "npx voidra@1.1.1 check", "passed": true}]
}
```

Paths are exact project-relative changed files. Include additions/deletions; exclude `.git`, `.voidra/local` and other actions. Do not stage unrelated changes yourself. The helper adds the current action/run and, for Release, its proposal record. `finalize` owns the local tag and Released updates; human members retain their checklist stage semantics. Git hooks still run. A failed check cannot prepare Review. During preparation/finalization the app holds its last complete view until checkpoints finish.

Validate with `npx --yes voidra@1.1.1 check .` after each completed helper operation. If it reports an unfinished operation, inspect the journal and use `npx --yes voidra@1.1.1 recover <op-id>` (or explicitly roll back) before run recovery. Never overwrite a conflicting outside edit automatically. Consumed records remain evidence after interruption and prevent undo.

A heartbeat older than two minutes displays a warning; the owner identity still controls recovery. Keep heartbeat current while working. After Review rejection, queue/run again: read the saved feedback and create a follow-up commit with the same action trailer and a new run trailer.

## Planning commands

- `planning --token TOKEN --report FILE`: publishes questions, plans or slices through the installed architecture procedure, records a stopped run and releases the lock.
- `choices --token TOKEN --report FILE`: resolves only unanswered agent-decides choices; report is an array of `{question,choice,reason}`.
- `guard --token TOKEN --report FILE`: verifies the implementation boundary before edits; report is an array of exact relative file paths.
- `research --token TOKEN --report FILE`: publishes findings, recommendation and proposed ideas without code or commits.
- `human --token TOKEN --report FILE`: creates a human checklist and blocks this action.

Use `.voidra/local/` for reports, never a source path. Planning-only runs may use planning/choices/research/human, but cannot prepare or commit implementation. Planning proposal effects preserve repository files, Git presence, HEAD and tags. Glossary additions are made atomically by the helper during Discovery. Snapshot mismatches stop and preserve the conflicting work.

Projects explicitly upgraded to release-aware tasks require Voidra 1.1.0. Their Backlog actions cannot run until moved to TODO with a target release. Runtime-created Research ideas, human blockers and architecture slices receive release metadata through the shared helper. Preserve existing target releases and historical `releasedIn` values; changing board organization never grants plan/review approval. Profile-change drafts still require explicit human activation, which fills a missing target release from the project's selected package. Do not enable tracking, clear gates or retag existing work as an incidental planning edit.

- `release-options`: read-only selected package metadata and Xeploy stable bump choices, also usable without an active owner.
