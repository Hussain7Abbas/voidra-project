---
name: voidra-go
description: Run queued Voidra Docs/chore actions in a local Git repository and leave each result for human review. Other action types are recorded as unsupported in this version.
---

Read the current action, repository instructions and [runtime procedure](references/runtime.md). The [format reference](references/format.md) defines the records. This skill works without the app.

Use the bundled `scripts/runtime.mjs` helper for every planning write, lock and commit. It persists consumed records before work, checks ownership and reconciles commits by both trailers. Never hand-edit a lock, checkpoint or journal, remove another owner's lock, repeat a commit, amend an implementation commit, or push.

1. If the invocation requests `recover run <id>`, use `recover --run <id>` and validate, then stop. For `recover operation <id>`, inspect the journal and use the format CLI’s explicit recover/rollback command, validate, then recover its run if needed. Never clear a live owner. Otherwise run `start` with your agent name. Use the returned action/run/token. The helper identifies the long-lived Claude/Codex process; if detection fails, find that process's PID and pass `--owner-pid`. If no action remains, stop. Unsupported results require no code work.
2. For a supported Docs/chore action, keep the change small and follow its description and any Review rejection feedback. Do only that action's work. Do not advance other types or bypass human gates. Heartbeat before each write and check ownership again before an external side effect; loss of the token means stop.
3. After each completed single-file write or grouped helper operation, run `npx --yes voidra@0 check .`. Stop on errors or unresolved recovery conflicts. Run the project's relevant checks and inspect the diff against its instructions and the action.
4. Write the report described in the procedure, then `prepare`, validate, `commit` with the project's message style, validate, and `finalize`, validate. The helper commits the changed files and this action's records with `Voidra-Action` and `Voidra-Run` trailers. Final commit metadata stays as the next planning change.
5. Leave the action at Review for the person. Continue with the next queued action. If checks fail, use `fail` with a clear summary and validate; never claim completion. If interrupted, use explicit recovery in the procedure before new work.

The user's instructions take precedence over this skill. Report what changed, checks, commit and the gate reached. Do not treat fixture/fake-agent output as evidence that a real agent succeeded.
