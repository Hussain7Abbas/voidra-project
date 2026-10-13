# Run ownership and durable commit checkpoints

[ADR index](Intro.md) · [Tracer bullet](../../plan/phase-03-tracer-bullet.md)

The standalone skill runtime and app share Node run-coordination helpers, while all planning schemas and grouped writes come from `voidra`. Run locks identify host, PID/process start and a random owner token. A two-minute heartbeat age warns that the agent may have stopped; it never authorizes clearing a live or unverifiable owner. The app reevaluates an existing lock every two seconds and on file changes.

Before work the grouped start operation persists the consumed action/queue records, run-start result, running action, owned lock and private checkpoint. Prepared results and commit intent are durable before Git effects. Both `Voidra-Action` and `Voidra-Run` trailers identify a completed commit on retry. The commit contains prepared metadata; its own hash is recorded afterward as a planning change. A separate Git index keeps unrelated staged entries out of the commit, and guarded reconciliation updates only selected entries. No helper pushes or amends a commit.

Explicit recovery refuses live owners, preserves conflicting outside edits, reconciles a matching commit and repeats without another commit. Uncommitted interrupted work returns to Implement with a failed/interrupted result for inspection. Persisted consumption remains evidence for undo blocking. The app holds its last complete index during unfinished grouped operations and prepared/unfinalized run checkpoints.

This is local optimistic coordination between cooperating writers, not a sandbox against hostile filesystem replacement. Git hooks still run and can cause a detectable conflict if they alter prepared bytes. The v0 skill requires an existing local Git repository and handles Docs/chore only; other types produce a clear unsupported result.

On macOS, the bundled, repository-owned read-only libproc helper obtains PID/start identity at microsecond resolution. It runs inside both agents’ write sandboxes; the setuid system `ps` does not. A live process with a legacy identity remains unverifiable and cannot be cleared. A missing lock also requires checking the checkpoint’s original owner. Recovery atomically rotates the token when it takes ownership, so a resumed old owner stops. Private checkpoint readers reject symlink components before reading.

The app copies a `/voidra-go recover …` or `$voidra-go recover …` command. The agent completes or rolls back an interrupted group and reconciles the run. The app never performs Git-index reconciliation: its only future Git write remains Commit planning changes.
