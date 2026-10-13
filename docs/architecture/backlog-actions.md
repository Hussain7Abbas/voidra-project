# Backlog, actions and slices

[Architecture index](Intro.md) · [Format API](../format/api.md) · [P06](../../plan/phase-06-backlog-actions-and-lifecycles.md)

The backlog creates and edits new, needs-info, ready and rejected ideas. Rejection requires a reason. Promotion atomically writes an action and reciprocal links, using the selected type's engine-defined first stage. Rejected and already-promoted ideas cannot be promoted again; reopening is an explicit edit. Existing unknown fields survive edits.

The shared package supplies creation, editing, promotion and checklist operations. All use whole-project validation and expected hashes, and write planning files only. The app refuses mutations during active or unresolved runs/operations. Description conflicts expose reload and an explicit overwrite of current description bytes; stale metadata is not restored. Cycles and missing references fail before any target write. Cancellation preserves the action and its history and removes it from the personal queue. Human cancellation preserves unchecked steps rather than pretending they were completed.

A human task has steps and no agent stages. Its last completed step completes it unless child slices remain. Done human tasks unblock agents. Blocker records are hash-guarded when queueing and starting; run-start consumption includes dependencies. A cancelled blocker remains unfinished. Parents are also blocked while children remain unfinished.

Aggregate parents finish only when every child is Done/Released or a completed human task. A parent with its own implementation retains its own Review; a parent with plan files retains exact plan approval. An aggregate parent with no own work or plan uses `completedBySlices: true`, preserving the individual child gates. Human cancellation and aggregate completion without a parent plan require metadata advertising voidra 0.2.0. The format remains 1, existing valid projects remain readable, and older clients give the minimum-reader notice. The strengthened parent check enforces the vision's existing completion rule; it does not repair files silently.

The SQLite index is a disposable version-4 cache for actions, runs, profiles and ideas; plan bodies and question rounds are cached with their action. Invalid identities are excluded from unique-key inserts and their diagnostics remain visible. Prepared writes retain the previous complete cache. Deleting the cache rebuilds from files.

The board filters type, status, assignee and who does the work. Cards sit in their own stage; child cards carry parent context in that stage. Text marks blocked work. Action pages show a stage timeline, editable Markdown with a safe preview, plans, run results, dependencies, child slices, links and checklists. Markdown uses the P03 renderer/sanitizer; a reversible library selection does not meet the ADR bar by itself. The layout follows Ink & Iris and applies containment to board columns.

Git identity is read with Git's effective project configuration. Missing name/email is explained and work can stay unassigned. No Git write is performed here. P07 supplies the question/plan/review gates and inbox, P08 expands skill execution beyond Docs/chore, P09 adds planning commits and richer queue coordination, and P10 adds persisted undo.
