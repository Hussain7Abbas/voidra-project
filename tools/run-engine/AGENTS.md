# Local run coordination

Extends [root instructions](../../AGENTS.md). This scope implements deterministic Node run/intake helpers shared by the desktop and standalone skill runtime. It has no Electron, SQLite or authenticated agent dependency.

- Keep planning-file rules and writes in `voidra`. Own local process identity, run ownership/checkpoints and git side-effect reconciliation here.
- Heartbeat age is a warning, never proof that a live owner may be cleared. Compare host, PID/start identity and token before recovery or further effects.
- Intake uses shared atomic profile creation, preserves existing glossary/instruction bytes and executes no Git command. Its only writes outside planning are the explicitly authorized glossary and AGENTS.md/CLAUDE.md pointers. Keep every inferred answer source-linked; null remains unresolved. Standalone generated assets resolve relative to the copied skill folder.
- Direct architecture proposals use shared schemas/grouped writes, preserve question answers and stop at gates without Git or source effects. Golden examples are generated and checked for freshness; keep local skill assets self-contained.
- Git identity reads are shared with the desktop. Queue/start blocker checks use package completion rules and guard dependency bytes; start markers consume those dependencies before work.
- Tests use real temporary repositories, files, processes and git. Never fake an agent as evidence that a real skill ran.
- Keep the run architecture, skill runtime/reference generation and phase evidence current with public helper changes. Runtime changes need source/bundle synchronization before linking or agent checks.

`CLAUDE.md` contains only the sibling instruction pointer.
