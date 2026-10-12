# P01 — Format and the `voidra` package

> **Milestone:** M1 · **Needs:** P00 · **Status:** see [main.md](main.md)

## Outcome

One package that defines, reads, writes and checks every `.voidra/` file, published to npm as `voidra` 0.x, so that skills can run `npx voidra check` and the app can use the same rules.

## Requirements

### In scope

- The format specification in `docs/format/`: one page per file type, versioning and examples.
- `packages/voidra`:
  - zod schemas for every file type;
  - Markdown-with-frontmatter reading and writing;
  - random IDs;
  - lifecycle rules as data, with an engine;
  - single-file and cross-file validation;
  - approval fingerprints, atomic writes, expected-hash checks and durable operation recovery;
  - format versioning and migrations;
  - the `voidra` CLI.
- JSON Schema export, plus a `pnpm gen` script that writes the reference pages for the docs and the skills. CI fails if they are stale.
- The fixture catalog from [main.md](main.md#fixture-catalog), except `large`, which a script generates.
- Publishing `voidra` 0.1.0 to npm.

### Out of scope

The app, the skills and the template content.

## Blueprint

### File types (proposed fields; final in P01-01)

| File | Frontmatter (main fields) | Body |
| --- | --- | --- |
| `voidra.json` (JSON) | `format`, `project.id`, `project.name`, `template.id`, `template.version`, `createdWith` | — |
| `README.md` | — | Generated guide for people and agents |
| `.gitignore` | — | `local/` |
| `profile/<block>.md` | `block`, `title`, answers: `id`, `question`, `answer`, `status` (confirmed, inferred, assumed or open), `source`, `updatedAt` | Notes |
| `backlog/<idea-id>.md` | `id`, `title`, `status` (new, needs-info, ready, promoted or rejected), `reason`, `promotedTo`, `createdBy`, `createdAt` | Description |
| `actions/<act-id>/action.md` | `id`, `type`, `title`, `stage`, `status`, `doneBy` (agent or you), `assignee`, `parent`, `blockedBy`, `links`, `commits`, `planApproval` (`by`, `at`, hashes of the three plan files), `reviewDecision` (revision, decision, feedback, author, time), `createdBy`, `createdAt`, `updatedAt` | Description; steps for actions done by you |
| `actions/<id>/questions.md` | Rounds: `round`, `askedAt`; questions: `id`, `text`, `why`, `options` (`label`, `description`, `recommended`), `allowFreeText`, `answer` (`choice`, `text` or `agent-decides`; `by`; `at`), `agentChoice` | — |
| `actions/<id>/requirements.md` | `action` (approval is stored in `action.md` to avoid hashing a file containing its own approval) | Required sections: Goal, Out of scope |
| `actions/<id>/blueprint.md` | `action` | Required sections: Approach, Testing seams, Proposed ADRs |
| `actions/<id>/acceptance.md` | `action` | A list of checkable criteria |
| `actions/<id>/runs/<time>-<agent>-<run-id>.md` | `id`, `action`, `agent` (claude-code or codex), `startedAt`, `consumedRecords`, `endedAt`, `fromStage`, `toStage`, `outcome` (running, advanced, waiting, failed or interrupted), `commit` (optional until known), `checks` | Start record followed by the final summary; a running record has no `endedAt` |
| `releases/<version>.md` | `version`, `actions`, `status`, `tag`, `date` | Notes |
| `local/pending-actions.md` | `queuedBy`, `queuedAt` | An ordered checklist of action IDs |
| `local/run.lock` (JSON) | `ownerToken`, `pid`, process-start identity, `agent`, `host`, `run`, `action`, `startedAt`, `heartbeatAt` | — |
| `local/operations/<op-id>.json` (JSON) | `id`, operation kind, action/run ID, expected hashes, before/after snapshots, phase/checkpoint and external-effect identities | Local recovery journal; never committed |

### Rules

- **IDs:** a prefix (`act`, `idea`, `q`, `run` or `op`) plus 6 random lowercase Crockford base32 characters. A collision check runs when a record is created.
- **Writing is byte-stable.** Reading and then writing a file without changes produces identical bytes. Unknown fields and the body are preserved.
- **Libraries:** `yaml` to parse frontmatter while keeping order and comments; zod for schemas and JSON Schema; `node:util` `parseArgs` for the CLI, so it has no extra dependencies.
- **Lifecycles** are data: the types, stages, gates and allowed transitions from VISION.md section 7. Templates may override them, and overrides are validated against the engine's invariants.
- **Review routing** comes from lifecycle data, including the rejection target. Implementation types accept to Done and reject to Implement; Research accepts to Done and rejects to Discovery. Release rejection returns to Plan; acceptance records authorization and stays pending agent finalization in Review. Released requires evidence of the release commit and tag. Overrides must supply valid rework stages and preserve required human gates.
- **Approval fingerprints (D21):** for actions with a plan gate, `action.md` stores SHA-256 hashes of the exact bytes of `requirements.md`, `blueprint.md` and `acceptance.md`, with author and time. Formatting counts as a change. The package rechecks all three before a gate decision or any further implementation/rework. A missing, invalid or changed file makes the approval stale; the engine routes these actions to Plan with a notice before resumption, while the read-only validator only reports the problem. Historical approval data is preserved for the decision index. A request includes the revision displayed by the app so a concurrent edit cannot approve unseen content. Docs/chore and Research require no plan files or plan approval. Release uses the same hash calculation as part of its Review approval and returns to the release-review flow on invalidation (P12), without adding a separate plan gate.
- **Writes and recovery:** resolve paths against the project, reject escapes through `..` or symlinks, and check expected current hashes before writing. Write a same-directory temporary file, flush it and atomically rename it; preserve the existing file on failure before replacement. A multi-record operation journals before/after snapshots before replacing files. After interruption, reconcile already-applied steps and complete or roll back only when current hashes match the journal. An unrelated outside edit stops recovery with a conflict rather than being overwritten. Validate the complete intended record set before starting, then validate it again after the grouped operation completes.
- **Public helpers:** document the writer, approval and recovery boundaries used by the app and expose corresponding CLI helpers for the skills. Final command names and schemas are fixed in P01-01, with examples, rather than leaving lock and recovery behavior to free-form agent instructions. `voidra check` only reports incomplete operations; it never repairs them.
- **Cross-file checks** cover:
  - links to records that don't exist;
  - cycles in `blockedBy`;
  - parent and child consistency;
  - a stage that isn't valid for the action's type;
  - a status that contradicts the questions or plan files;
  - truncated frontmatter, as left by an agent that stopped mid-write.
- **CLI:** `voidra check [path] [--json]` exits with 0 when valid, 1 for problems and 2 for usage errors. `voidra migrate [--dry-run]` and `voidra version` complete the set.
- **Format gate:** the package knows the newest format it supports. A newer project is reported as "needs voidra ≥ X", never parsed loosely.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P01-01 | Format specification v1 | 5 | — | `docs/format/` has a page per file type with examples. An ADR records "Markdown with YAML frontmatter, one file per record". |
| P01-02 | Reading and writing | 5 | P01-01 | Byte-stable round trips across every fixture, including CRLF, BOM, an empty body and unknown fields. |
| P01-03 | Schemas for every file type | 8 | P01-02 | Every valid fixture parses. Every broken fixture fails with the file, the field and a readable message. |
| P01-04 | IDs | 2 | — | Correct format; collisions are detected when a record is created. |
| P01-05 | Lifecycle rules and engine | 5 | P01-03 | All seven types with their stages, gates and rejection targets. Research never transitions to Implement, and Release never transitions to Done or Released from app acceptance alone. Allowed and forbidden transitions and invalid template rework stages are tested. |
| P01-06 | Cross-file validation | 5 | P01-03, P01-05 | Each cross-file problem above has a fixture that produces it. |
| P01-07 | CLI | 3 | P01-06, P01-12, P01-13 | Human and JSON output, exit codes 0, 1 and 2, and paths relative to the project. The documented approval/write/recovery helpers enforce the same rules as the app-facing API. Tested by running the built CLI. |
| P01-08 | Format versioning and migrations | 5 | P01-03 | The `newer-format` fixture reports the needed version. A sample migration runs with `--dry-run` and for real on a fixture copy. Deprecation markers are scanned. |
| P01-09 | Generated references and JSON Schema | 3 | P01-05 | `pnpm gen` writes `docs/format/reference/` and the shared skill references. CI fails when they are stale. |
| P01-10 | Fixtures | 3 | P01-03 | Every fixture in the catalog exists (`large` is generated by a script), each with its expected `voidra check` result. |
| P01-12 | Approval revisions | 5 | P01-03, P01-05 | Each of the three files is changed independently, including whitespace-only edits; its approval becomes stale and implementation is refused until approval is given again. A gate request using an old displayed revision is rejected. No approval record hashes itself. Docs/chore and Research still run without plan files, and Release invalidates its Review approval rather than requiring a new plan gate. |
| P01-13 | Atomic writer and operation recovery | 8 | P01-02, P01-03 | Tests interrupt every write/checkpoint boundary, recover a two-record mutation, reject hash conflicts and path escapes, and prove recovery can be repeated without duplicating records. The documented app API and skill CLI helpers use these same primitives. |
| P01-11 | Publish `voidra` 0.1.0 | 2 | P01-07, P01-08, P01-09, P01-10, P01-12, P01-13 | Publish only after all package stories pass, including the approval and recovery helpers. `npx voidra@0.1.0 check` works from a clean temporary folder. The package metadata lists AGPL-3.0-or-later, the repository and the `bin` entry. |

## Tests

- **Unit:** schemas, round trips, IDs, the lifecycle engine, cross-file checks, migrations and the format gate. 90% line coverage.
- **Integration:** run the built CLI against every fixture and compare its output with the expected snapshot.
- **Writer and recovery seams:** real temporary folders, expected-hash conflicts, failed rename/write, interruptions between related-record writes, repeat recovery and symlink/path containment. Inject failures at explicit checkpoints, not by mocking the filesystem.
- **Approval seam:** all three files, formatting-only changes, invalid/missing files and edits between display and approval; direct CLI usage enforces the same rule as the app.

## Failure and recovery

- Invalid YAML reports the file and line.
- A truncated file is reported as "incomplete write". The validator never edits files.
- A newer format version never produces a write.
- An unfinished operation is reported with its ID and affected paths. Recovery is explicit, preserves the journal on conflict and does not silently repair agent output from outside the operation.

## Exit criteria

- Coverage is at least 90%, every fixture behaves as expected, the generated references are current, and `voidra` 0.1.0 is on npm.

## Hand-off

- This package is the contract between the app and the skills, so keep it free of Electron and UI code.
- Run stories in dependency order, not numeric order; the approval/writer helpers precede CLI acceptance and npm publication. P01-11 is always last.
- Make changes to the format through `docs/compatibility.md`. Every schema change updates its spec page in the same commit.
