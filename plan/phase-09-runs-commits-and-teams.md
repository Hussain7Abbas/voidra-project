# P09 — Runs, commits and teams

> **Milestone:** M2 (completes it) · **Needs:** P08 · **Status:** see [main.md](main.md)

## Outcome

The loop is safe for daily use and for teams: a run picker, live run state, commits linked to actions, planning commits, assignment and conflict handling. Dogfooding starts.

## Requirements

### In scope

- **Run screen:**
  - pick and order unblocked actions done by the agent, with yours and unassigned ones first;
  - the queue persists;
  - live running state from the lock, with stale-lock handling from P03.
- **Commit links:**
  - read git history for `Voidra-Action` trailers and list the commits on each action;
  - open a commit on GitHub when the project has a GitHub remote;
  - record commits that have no trailer, for P12's sync suggestion.
- **Commit planning changes:**
  - preview the changed `.voidra/` files and enter a message;
  - build an explicit list of previewed new, modified and deleted `.voidra/` paths; exclude `.voidra/local/` even when a local file was force-added to git;
  - register selected new files with git before `git commit --only` on the explicit path list. Preserve unrelated staged entries and partial staging, and recheck the previewed file hashes before committing;
  - refuse when nothing has changed;
  - when the folder isn't a git repository, disable the button and explain why.
- **Teams:**
  - starting an unassigned action assigns it to the person running it;
  - after a pull, changes on disk refresh the app;
  - git conflict markers inside `.voidra/` files show a **conflicted** state with guidance;
  - ID collisions are rejected when records are created.
- **Performance baseline** with the generated `large` fixture: measure the time to open, board interactions and index rebuild, and record the numbers.
- **Dogfooding:** run `voidra-init` on this repository and start tracking new ideas and bugs there.

### Out of scope

Undo (P10) and releases (P12).

## Blueprint

- Git is called through `execFile` with argument arrays, never a shell string. Reads use `git log` with trailer formatting.
- The planning commit is the app's only git write (invariant 2 in [main.md](main.md#invariants)).
- Do not pass the whole `.voidra/` directory as an unchecked pathspec. Use literal paths and argument arrays, including filenames containing spaces, newlines or pathspec metacharacters. Snapshot the affected index entries and HEAD before staging; journal this operation and restore only entries it changed if it fails before a commit. Do not reset, stash, amend or rewrite unrelated user changes.
- Refuse a planning commit during an active agent run or unresolved git merge/rebase. If HEAD or index entries change concurrently, stop and refresh the preview rather than overwriting them. After a crash, reconcile a commit using a unique planning-operation trailer before deciding whether to retry; a successful commit is not reported as undone because later metadata/index reconciliation failed.
- `voidra-init` also creates the glossary and instruction pointer outside `.voidra/`. The planning button cannot commit those files. Its result explains this and points to a separate explicit agent/git commit for those files; it never silently expands the button's allowed paths.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P09-01 | Run screen | 5 | — | Only queueable actions can be picked. The order is kept. The running state is live. |
| P09-02 | Commit links | 5 | — | Commits with trailers appear on their actions, and commits without them are recorded. Tested on real temporary repositories. |
| P09-03 | Commit planning changes | 5 | P01-13, P03-11 | A completely untracked `.voidra/` commits successfully. New, modified and deleted previewed planning files are committed, while force-tracked `local/`, unrelated staged files and partial staging remain untouched. Tests also cover unusual filenames, an active run, merge/rebase state, preview changes and failure after staging. Retrying after a completed commit creates no duplicate. The empty and no-repository cases are handled. |
| P09-04 | Assignment and team refresh | 3 | P09-01 | Starting an action assigns it. Pulled changes appear without a restart. |
| P09-05 | Conflicts | 5 | — | The `conflicted` fixture shows the conflicted state with guidance, and the app never writes into a conflicted file. |
| P09-06 | Performance baseline | 3 | — | Numbers for the `large` fixture are recorded in the evidence file and compared with a proposed budget: open under 2 seconds on Apple Silicon. |
| P09-07 | Dogfooding | 2 | P09-03 | This repository has its own `.voidra/` that passes `voidra check`, and new ideas and bugs are tracked there. |

## Tests

- **Unit:** trailer parsing, the planning commit's path rules, conflict detection and queue ordering.
- **End-to-end:** queue and run several actions; see their commits; commit planning changes; a conflict fixture; a simulated pull refresh.
- **Git integration:** real temporary repositories with an untracked `.voidra/`, deletions, force-tracked `local/`, unrelated staged and partially staged code, pathspec-like filenames, git hook failures and interrupted planning commits. Compare unrelated index entries before and after, including on failure.

## Failure and recovery

- A git error is shown with git's own message. Before commit success, recover only the operation's own index changes; after success, reconcile and report the existing commit. Concurrent user changes are preserved and unresolved recovery conflicts are reported.
- A conflicted file blocks writes to that record only.

## Exit criteria

Every story is accepted, M2 is reached, and dogfooding has started. Update the milestone in [main.md](main.md).

## Hand-off

- Test git behaviour on real temporary repositories; don't mock git.
