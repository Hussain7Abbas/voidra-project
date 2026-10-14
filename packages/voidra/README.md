# Voidra

The shared file-format package for [Voidra Project](https://github.com/Hussain7Abbas/voidra-project). It reads and validates `.voidra/` records, enforces lifecycle gates, and provides recoverable writes. It runs without Electron or the desktop app. Requires Node 24.13.0 or later; licensed AGPL-3.0-or-later.

```sh
npx voidra@0.1.0 check ./project
npx voidra@0.1.0 check ./project --json
npx voidra@0.1.0 --help
```

Exit codes: 0 for success, 1 for project/I/O/conflict problems, 2 for usage errors. A folder without `.voidra/voidra.json` is reported as missing a Voidra project. Checks never edit or repair files.

```ts
import { checkProject, getPlanRevision, approveAction, applyOperation, hash } from "voidra";

const result = await checkProject(projectFolder);
const shown = await getPlanRevision(projectFolder, "act-000000");
// The user must approve the revision displayed to them.
await approveAction(projectFolder, "act-000000", "You", shown.revision);
await applyOperation(projectFolder, {
  changes: [{ path: ".voidra/README.md", expectedHash: hash(previousBytes), content: newGuide }]
});
```

`parseRecord` and `serializeRecord` round-trip unchanged bytes and retain unknown fields, YAML comments, BOMs and line endings. `schemas` exposes record frontmatter/JSON schemas; `plainSchemas` covers the guide and ignore file. Use `validateRecord` for structural/body checks and `checkProject` for the complete project.

`transition` is the pure lifecycle engine. Its context must contain the current validated plan and review revision; the filesystem helpers perform disk checks and expected-hash writes. `applyOperation` validates the intended group, records a local journal and serializes cooperating writers. `recoverOperation` completes or rolls back an interrupted journal, refusing unrelated edits. Journals retain completed receipts for idempotency. Use an explicit `allowGlossary: true` only for the repository-root glossary exception. Code files and recovery metadata are reserved.

Format 1 requires voidra 0.1.0. Newer formats are refused. `migrateProject` and `voidra migrate --dry-run` support the unreleased format-0 prototype fixture, retaining its legacy fields. No older Voidra product compatibility is claimed.

See the [format specification](https://github.com/Hussain7Abbas/voidra-project/tree/main/docs/format), [API contract](https://github.com/Hussain7Abbas/voidra-project/blob/main/docs/format/api.md) and [verification evidence](https://github.com/Hussain7Abbas/voidra-project/blob/main/docs/verification/p01.md).

The 0.2.0 candidate also exports guarded Release selection and `applySyncReport` for planning-only inferred updates/proposals. Sync records preserve confirmed answers and bind examined commits and record consumption; the Node adapter verifies actual Git history. Public registry publication remains separate from this local candidate.
