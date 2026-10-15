# Local run coordination

Extends [root instructions](../../AGENTS.md). This scope implements deterministic Node run/intake helpers shared by the desktop and standalone skill runtime. It has no Electron, SQLite or authenticated agent dependency.

For projects explicitly opted into `taskTracking: 1`, new architecture slices and human blockers use the shared `newTaskFields` defaults. Preserve target-release/placement fields through existing action transitions. Backlog work is not runnable; use shared queue eligibility rather than bypassing it in runtime helpers. Legacy projects retain their previous behavior. Regenerate bundled assets whenever these shared rules change.

- Keep planning-file rules and writes in `voidra`. Own local process identity, run ownership/checkpoints and git side-effect reconciliation here.
- Heartbeat age is a warning, never proof that a live owner may be cleared. Compare host, PID/start identity and token before recovery or further effects.
- Intake uses shared atomic profile creation, preserves existing glossary/instruction bytes and executes no Git command. Its only writes outside planning are the explicitly authorized glossary and AGENTS.md/CLAUDE.md pointers. Keep every inferred answer source-linked; null remains unresolved. Standalone generated assets resolve relative to the copied skill folder.
- Intake validation pointers use the current package version, matching release-aligned skill commands. Regenerate bundled intake scripts after changing that guidance.
- Direct architecture proposals use shared schemas/grouped writes, preserve question answers and stop at gates without Git or source effects. Golden examples are generated and checked for freshness; keep local skill assets self-contained.
- Git identity reads are shared with the desktop. Queue/start blocker checks use package completion rules and guard dependency bytes; start markers consume those dependencies before work.
- Tests use real temporary repositories, files, processes and git. Never fake an agent as evidence that a real skill ran.
- Keep the run architecture, skill runtime/reference generation and phase evidence current with public helper changes. Runtime changes need source/bundle synchronization before linking or agent checks.

`CLAUDE.md` contains only the sibling instruction pointer.

- P08 planning proposals share the active run token and stop atomically with its result and lock release. `voidra-plan` uses explicit plan mode; source snapshots, HEAD/tags and existing glossary bytes must be preserved. Public CLI summaries must not expose full source fingerprints.
- Implementation preparation requires approved bytes, no overlap with starting user edits, passing checks and both review parts for gated types. Research and human blockers finish without implementation commits. Keep runtime bundles and shared planning guides synchronized for both Go and Plan skills.
- In opted-in task-tracking projects, runtime-created Research follow-up ideas, architecture slices and human blockers use shared release defaults. Keep standalone generated runtimes synchronized and test both adapter labels without describing deterministic engine checks as authenticated agent evidence.

- `scripts/knowledge-goldens.ts` creates valid, exactly approved examples of ADR criteria/naming and settled glossary additions. Generate/check them with the other catalogs; never describe their scripted documentation outputs as real-agent execution.

- `git.ts` reads real trailer history and validates GitHub repository remotes. `planning-commit.ts` owns root-only previewed planning commits, private staging, `commit --only` with literal paths, durable operation trailers and selected-index reconciliation under a Git lock. Preserve unrelated/partial staging, recognize successful commits before retry, and retain concurrent index conflicts. Pending planning operations block agent startup; queue/run writes guard the planning lock. Assignment uses the runner’s configured Git identity before durable consumption.

- Release planning stops at exact Review; accepted execution binds version/tag/message/paths and member bytes in the private checkpoint. Reconcile a prepared approved commit intent, actual run-trailer commit and matching local tag. Atomically update release/members/run/checkpoint; human members retain checklist semantics. Recover only this run’s interrupted grouped writes after owner verification. Never move a conflicting tag or overwrite outside edits. Terminal Release intake atomically queues work using real Git identity.

- Sync context uses actual Git trailers and reachable revisions, not timestamps. Validate exact HEAD/range before a planning-only grouped report; the shared package protects confirmed values and persists consumption. Recover only contained Sync receipts from reachable history through the shared dead-owner/expected-byte protocol. Preserve unprocessed commits on branch switches or changed evidence. Generated Sync goldens normalize identities/revisions only after checking actual helper output.

- Startup rejects selected Git subfolders before run writes, comparing canonical worktree roots so linked worktrees remain valid. Discovery/Plan preserve absent Git and need no configured identity to plan. Only current approved Feature Bootstrap Go implementation initializes missing Git, after durable ownership/consumption, with no synthetic setup commit. Ordinary implementation needs Git; unassigned implementation needs configured identity. Planning guards bind Git presence as well as HEAD/tags; implementation preserves pre-existing non-Git source bytes. The first Bootstrap result commit includes the frozen initial public planning baseline; never include private local state or automatically stage pre-existing source. Outside baseline edits stop preparation. Test validity in a fresh clone as well as the working tree. Keep first-commit/recovery and generated-runtime checks current.
