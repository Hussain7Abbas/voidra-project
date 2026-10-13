# Standalone runtime

Use Node 24.13.0+. Resolve the installed skill folder from the skill path (`${CLAUDE_SKILL_DIR}` in Claude Code), then run `node <skill-folder>/scripts/runtime.mjs <command>`. The project defaults to the current directory; `--project <folder>` selects it explicitly. Commands return JSON and exit 0/1. `help` lists flags.

- `start --agent claude-code|codex [--owner-pid PID]`: validates the queue, atomically persists ownership, consumption and the start result, and returns the checkpoint (including ownerToken). A null result means an empty queue. An unsupported phase requires no work or commit. The folder must already be a local Git repository.
- `heartbeat --token TOKEN`: proves PID/start/token ownership, then updates the heartbeat.
- `prepare --token TOKEN --report FILE`: validates current records, allowed commit paths and successful checks; persists the prepared Review result and commit checkpoint.
- `commit --token TOKEN --message TEXT`: checks prepared bytes and HEAD, persists intent, and uses a separate Git index to commit this action. Matching action/run trailers reconcile an existing commit instead of creating another.
- `finalize --token TOKEN`: records the commit hash, reconciles only the selected index entries and releases its own lock. This metadata cannot be inside the commit that it names; leave it for the next planning commit.
- `fail --token TOKEN --summary TEXT`: writes a failed run, preserves work for inspection and releases its own lock.
- `inspect --run RUN`: reads a checkpoint. `recover --run RUN`: explicit recovery after the owner exits; a live or unverifiable owner is never cleared. Recovery without a commit returns to Implement with an interrupted result. Recovery with a matching commit finalizes it. Outside edits cause conflicts and are preserved. Repeat recovery is idempotent.

Write the report to `.voidra/local/report-<run-id>.json` (private, never committed):

```json
{
  "summary": "What changed and any remaining issues.",
  "paths": ["README.md"],
  "checks": [{"name": "Documentation reviewed", "passed": true}, {"name": "npx voidra@0 check", "passed": true}]
}
```

Paths are exact project-relative changed files. Include additions/deletions; exclude `.git`, `.voidra/local` and other actions. Do not stage unrelated changes yourself. The helper adds the current action and run record. Git hooks still run. A failed check cannot prepare Review. During preparation/finalization the app holds its last complete view until checkpoints finish.

Validate with `npx --yes voidra@0 check .` after each completed helper operation. If it reports an unfinished operation, inspect the journal and use `npx --yes voidra@0 recover <op-id>` (or explicitly roll back) before run recovery. Never overwrite a conflicting outside edit automatically. Consumed records remain evidence after interruption and prevent undo.

A heartbeat older than two minutes displays a warning; the owner identity still controls recovery. Keep heartbeat current while working. After Review rejection, queue/run again: read the saved feedback and create a follow-up commit with the same action trailer and a new run trailer.
