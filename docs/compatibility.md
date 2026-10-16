# `.voidra/` compatibility policy

[Documentation index](intro.md) · [Development](development.md) · [Format phase](../plan/phase-01-format-and-voidra-package.md)

P01 implements format 1, the newer-format gate and a sample unreleased prototype migration. P00 implements its deprecation enforcement. The self-contained five-part contract is used because the optional `api-backward-compatibility` reference skill is unavailable.

## 1. Additive format changes

Add optional fields or new record files before removing anything. Readers ignore unknown fields; writers preserve them and unchanged bytes. Existing required fields, meanings and valid values cannot change silently. Record the change in the format specification and regenerate schemas and skill references together.

## 2. Reader and writer versions

`voidra.json` records the format version. The app, CLI and skills declare the versions they read and write. A newer unsupported format opens read-only with the required version displayed; the CLI reports it and the skills refuse writes. Ignoring unknown optional fields is permitted within a supported format version, not a reason to write an unsupported format. Format 1 starts at voidra 0.1.0; newer metadata supplies its own `requiredVoidra` minimum. P06's aggregate-without-parent-plan and human cancellation forms require 0.2.0. Their optional markers/end states extend the accepted record forms; old required fields and meanings remain. Existing plan-bearing parents keep exact approval and their own work keeps Review. Parent completion continues to mean all children completed, including human parents; invalid states are diagnosed rather than silently repaired.

P12 adds optional Release selection/version/tag fields and the owning action link on release records. Structured writers declare reader 0.2.0; legacy forms retain their contract. Structured Review revisions include selection/notes and plan files; changed proposals need acceptance again.

The v1.1 task contract, delivered in 1.1.1, adds explicit `taskTracking: 1` project opt-in, `releasePackage` selection, action `taskColumn` and nullable action/idea `targetRelease`. Opted-in projects require reader 1.1.0. A previewed grouped migration assigns active work without inventing target versions for completed history, preserves unknown fields and refuses changed previews/pending operations. Legacy projects remain readable and editable under their existing contract until opt-in. New shared creation paths, including Sync/profile/release/slices/human blockers, use the same version defaults. The published 1.0.0 CLI has been checked to refuse an upgraded project with the update notice; see [P01 evidence](verification/v1.1.0-p01.md).

## 3. Dated deprecations

Every deprecated production API or schema field carries an actual source-comment tag with its replacement and final supported date, for example:

```ts
/** @deprecated Use replacementField. remove-after: 2027-06-01 */
```

The date is a real ISO `YYYY-MM-DD` date on the same line as the tag. `remove-after` is the final supported UTC calendar day. The marker is expired on the following day, and warns from 30 days before the deadline through the deadline itself. Closing comment delimiters are not part of the date. Decide dates deliberately; never extend one only to silence a failure.

## 4. Enforcement

`make check` runs the scanner and its tests. Undated, invalid and expired markers fail. Deadlines within 30 UTC calendar days warn but pass. Scanning zero production source files fails so a misconfigured scan cannot silently appear green. Having scanned source files but no deprecated fields passes; P00 introduces no fake deprecated API merely to seed the scanner.

The scanner uses the TypeScript parser's comment ranges, not raw string matching. It skips tests, fixtures, dependency/build directories, declarations and symlinks. Tests verify marker dates, positions, JSDoc, closing delimiters, string literals, empty files, empty scans and CLI exit codes. `make deprecations` lists markers without changing them. The shared package API and generated reference checks are implemented in P01.

## 5. Expand, migrate, contract

1. Add the replacement as an optional field and document both forms.
2. In P01's migration engine, implement an explicit old-to-new conversion with `voidra migrate --dry-run`, expected-hash checks and recoverable writes; unknown data must survive.
3. Test old, migrated and newer-format fixtures. Migration must be repeatable, preserve unrelated data and stop on concurrent changes.
4. Stop producing the old field only after all writers support the replacement.
5. Remove the old form in a later documented format version after its supported date and migration path are satisfied. Unsupported readers continue to refuse writes.

No app or validator repairs or migrates files silently. Breaking format changes require an explicit version transition and an available migration path.

P12 releasedIn membership preserves human checklist semantics. Human work never acquires an agent stage. Structured proposals bind version/changelog paths and commit message; legacy forms remain readable.

P12 adds `sync-*` identities and `.voidra/syncs/` records to format 1 with minimum reader 0.2.0. Sync references, consumption paths and filename identity are validated; legacy projects remain readable without Sync records.

V1.1.0 task-tracking upgrades require reader 1.1.0 and atomically preview/bootstrap the versioned private Actions order plus `orderedIntent: 1` request queue. Already tracked projects use an exact conversion preview. Legacy queues retain required actor/time and strict first-entry execution; versioned initial queues may omit actor/time only at deterministic bootstrap. New run ordering receipts carry version/hashes without clone-required private references. Corrupt or unpaired versioned state refuses legacy fallback. No format-version increment or automatic repair is introduced; completed historical actions remain readable.

Fresh 1.1.1 initialization enables tracking and both private ordering files atomically; missing/invalid package versions retain Backlog/null rather than inventing a version. Existing legacy projects still require the exact migration preview. New writes advertise the current reader (1.1.1); 1.1.0 is the contract introduction. The genuine public 1.0.0 reader refuses fresh 1.1.1 metadata without changing it. See [final compatibility evidence](verification/v1.1.0-p10.md).
