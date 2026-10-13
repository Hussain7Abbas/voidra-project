# Public package API

[Format index](Intro.md) · [CLI contract](cli.md) · [Documentation index](../intro.md)

The ESM `voidra` package exports typed helpers from `index.js` and declarations from `index.d.ts`. It requires Node 24.13.0+, uses zod 4.6.7 and yaml 2.9.1, and has no Electron dependency.

| Boundary | Contract |
| --- | --- |
| `parseRecord(file, bytes)` / `serializeRecord(record, data?, body?)` | UTF-8 Markdown frontmatter, JSON and JSON run locks. Unchanged bytes survive; deliberate edits preserve existing YAML nodes/comments and untouched body. Cyclic/non-JSON YAML values and incomplete frontmatter fail. |
| `schemas`, `plainSchemas`, `validateRecord(kind, record)` | Structural and conditional record/body checks. Unknown object keys survive. Diagnostics contain code, project-relative file, field, line and message. |
| `checkProject(root, options?)` / `inspectFiles(files, options?)` | Read-only whole-project checks. A newer metadata format/minimum package version stops other parsing. `ProjectFiles` maps project-relative names to bytes. |
| `createId(prefix, existing?, random?)` | Six lowercase Crockford characters. Existing IDs are collision checked with bounded retries. RNG injection is only for deterministic tests. |
| `lifecycles`, `validateLifecycles(rules)`, `transition(action, event, context, rules?)` | Data and pure transitions for all seven types. Full overrides preserve required gates and name a valid rejection stage. Context supplies open-question state, current validated plan/review revision and decision/evidence fields. No filesystem or git work occurs. |
| `planRevision(bytes)`, `approvalCurrent(approval, revision)` | Exact SHA-256 hashes of requirements, blueprint and acceptance, plus a deterministic displayed revision. No action-file self-hash. |
| `getPlanRevision(root, actionId, options?)` / `approveAction(root, id, by, revision, options?)` | Validate current disk records; approve only the displayed revision. Recheck all three plan hashes and action bytes in the grouped write. Preserve old plan approvals. Release approval records Review acceptance and waits for agent commit/tag finalization. |
| `applyOperation(root, manifest, options?)` | Optional operation ID, changes `{path, expectedHash, content}`. Null expected hash means absent; null content means delete. Validate the complete target, acquire an exclusive local writer lock, persist before/after snapshots, flush same-directory temporary files, rename and validate again. |
| `recoverOperation(root, id, options?)` | Explicit complete or `rollback: true`. Preflight every current snapshot before replacing any. Refuse outside edits or a live owner. Repeated completed recovery returns its receipt; switching a rollback to commit fails. |
| `migrateProject(root, options?)` | Explicit prototype 0→1 migration, optional `dryRun: true`, preserving unknown/legacy fields. Recover or roll back even if interrupted before metadata replacement. No newer-version downgrade. |
| `templateSchema`, `validateTemplate`, `loadTemplate`, `readTemplates` | Validate plain YAML template metadata, questions, examples and lifecycle overrides; skip broken catalog entries with diagnostics. These new workspace APIs are not in published 0.1.0 yet. |
| `detectCode`, `initializeProject`, `updateProfileAnswer` | Detect source/manifests; create a complete planning directory atomically; confirm inferred answers or create linked Profile change drafts using exact expected hashes. |
| `createIdea`, `editIdea`, `promoteIdea` | Validated backlog edits with exact revisions and atomic reciprocal promotion links; rejected/promoted duplicates are refused. New in 0.2.0. |
| `createAction`, `editAction`, `setHumanStep`, `actionComplete` | Engine-defined creation, description/relationship edits, cancellation and checklist/aggregate completion. Writes remain planning-only. Extended completion/cancellation semantics advertise minimum reader 0.2.0. |
| `runCli(args, cwd?)` | The same API operations with stable exit codes/output, used by the built executable. |

`WriteOptions` supports `allowGlossary` (only root GLOSSARY.md), a complete validated lifecycle override and a test `checkpoint(point, path)`. Production clients do not supply checkpoint callbacks. The writer reserves its own lock and journals; symlink components, absolute paths, traversal and code files fail. The private writer lock records a PID and nonce; explicit recovery removes it only after the process has exited. This is separate from the agent's `run.lock`.

An operation stores UTF-8 snapshots in `.voidra/local/operations/`. It is local and can contain planning text. Receipts remain for idempotency; history cleanup is outside P01. Hash checks are optimistic and cooperating writers are serialized. An unrelated process can still race the last OS rename; the API is not an OS-level compare-and-swap or a sandbox against hostile concurrent filesystem changes.

Callers must read current files and carry the displayed revision through human decisions. The pure engine assumes its context comes from validated current data; the disk approval/writer helpers enforce that at the filesystem boundary. A stale plan routes implementation back to Plan; stale Release authorization returns to its Review flow. No helper creates a git commit, tag or push.
