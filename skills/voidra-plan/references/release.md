# Local releases

Read the selected work, existing version files, changelog, tags and conventions. Never publish or push. Use the bundled runtime for planning writes, commits and tags; never run git commit/tag yourself.

## Plan

Do not edit version/changelog files yet. Ask missing scope questions through owned planning, preserving answers. Otherwise propose the three plan files, version, tag, notes, exact version/changelog paths and commit message. Keep existing changelog naming/format. If there is none, use only release notes; do not create one. With no repository version file, an empty paths list explicitly uses the release record as the version convention.

Report shape (illustrative values, adapt to the project):

```json
{"version":"0.2.0","tag":"v0.2.0","message":"chore(release): 0.2.0","paths":["package.json","CHANGELOG.md"],"notes":"## Notes\nCompleted selected work.\n","requirements":"## Goal\nRelease selected work.\n## Out of scope\nPublishing.\n","blueprint":"## Approach\nBump agreed version files and preserve the changelog convention.\n## Testing seams\nRead back version/changelog, validate planning files and inspect the local tag.\n## Proposed ADRs\nNone.\n","acceptance":"- Commit the agreed version and notes once.\n- The local tag names that commit.\n"}
```

Omit `actions` to preserve the selection. If saved feedback changes it, supply `actions:[{id,revision}]` with each completed, unreleased action file's current SHA-256. Do not include another active release's work. Existing versions/tags are not overwritten. Preserve unrelated fields/bytes.

Save privately, then call `release-plan --token TOKEN --report FILE`. Validate and stop at Review. This makes no source, commit or tag changes. Never approve it yourself or finalize during a planning-only invocation.

## Accepted Review

Only a complete unchanged accepted proposal may proceed. Read `releaseFiles` and `releaseMessage`. Before each edit batch, `guard` exactly those paths. Bump the project's version and update its existing changelog according to the approved blueprint. Preserve unrelated changes and older changelog content. Never change notes/version/tag/selection after acceptance; obtain a fresh proposal/decision.

Run actual project/version checks and `voidra check`; record results and both standards/plan reviews in the ordinary implementation report. Its paths match `releaseFiles`, including an explicit empty list for a notes-only release. Call `prepare`, `commit` with the exact `releaseMessage`, then `finalize`, validating after each. The helper tags its journaled commit and atomically marks the release/members Released. Human actions retain checklist semantics and gain released membership.

Recovery reconciles approved prepared intent, existing run-trailer commit, matching tag and grouped updates. Never move a conflicting tag, repeat a version bump or clear a live owner. Outside edits stop recovery. Report actual commit/tag and Released state, with no publishing claim.
