# P15 — Packaging and updates

> **Milestone:** M4 · **Needs:** P14 · **Status:** see [main.md](main.md)

## Outcome

Pushing a version tag builds an unsigned DMG on GitHub Releases. The app tells you when a newer version exists, and `voidra` publishes to npm from CI (D05).

## Requirements

### In scope

- **The app icon,** designed in this phase in the Ink & Iris palette and approved by you (D18).
- **The DMG.** `electron-builder` builds an unsigned DMG for Apple Silicon (arm64) only (D16), using the approved icon.
- **The release workflow** (`release.yml`), triggered by version tags:
  - build and test;
  - write checksums;
  - create the GitHub Release with notes from the matching `releases/` file or changelog;
  - attach the DMG.
- **The update notice:**
  - checks the latest GitHub Release when the app starts and once a day;
  - compares versions;
  - shows a banner with the notes and a **Download** button that opens the release page;
  - can be turned off in Settings.
- P06's local 0.2.0 candidate was not published because npm returned EOTP. Registry 0.1.0 remains the baseline. Establish trusted publishing and publish the matching release library here; do not claim the candidate was already on npm.
- **npm trusted publishing** (`publish-npm.yml`) for `voidra`, using GitHub's OIDC with provenance, so no npm token is stored. Linking the package to the workflow is a one-time setting on npm. The agent does it with the npm CLI if npm offers a command for it; otherwise this is the one website step left for you.
- **Version alignment.** One rule for app, `voidra` and skill versions, recorded in an ADR.
- **`make release`:** bumps versions, tags and pushes, following the `makefile-standards` Deploy section.
- **Installation docs** in the README, including how to open an unsigned app the first time.

### Out of scope

Signing, notarisation and silent automatic updates, which would need an Apple Developer account (D05).

## Blueprint

- Release builds run on GitHub's macOS runners. Nothing in the build depends on your machine.
- The update check is the only network call the app makes without your action. It sends nothing but the request itself.
- Publication across GitHub, npm and `voidra-skills` is tracked as separate checkpoints; it is not a cross-service atomic operation. Build, test and stage the DMG/checksums/notes before publication. Keep the GitHub Release as a draft until its required assets and checks are ready. Serialize runs for the same tag.
- Before retrying, compare the existing tag, release assets and checksums, npm version/provenance and synced skills with the intended release. Reuse matching completed steps and stop on mismatches. A partially published version is reported explicitly; never delete or overwrite a published version to simulate rollback.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P15-01 | App icon design | 3 | — | Two or three directions are designed in the Ink & Iris palette with the `ui-ux-pro-max` skill. You pick and approve one, and the approval is recorded. It is exported at every size macOS needs and used for the DMG, Dock and window. |
| P15-02 | DMG build | 3 | P15-01 | An automated smoke test mounts the DMG, copies the app to a temporary folder and starts it with a fresh data folder. |
| P15-03 | Release workflow | 5 | P15-02 | A test tag produces a GitHub Release with the DMG, checksums and notes. |
| P15-04 | Update notice | 3 | — | Unit tests with mocked responses cover newer, equal, older, offline and malformed releases. The banner appears and can be turned off. |
| P15-05 | npm trusted publishing | 2 | — | A test version publishes from CI with provenance and without a stored token. |
| P15-06 | Version alignment and `make release` | 3 | P15-03, P15-05 | One command produces a consistent tag across the app, `voidra` and the skills. |
| P15-07 | Installation docs | 1 | P15-02 | The README explains installing and opening the unsigned app. |
| P15-08 | Publication retry recovery | 3 | P15-03, P15-05, P15-06 | Failure injection before publication leaves no public GitHub Release. Failure after one destination succeeds reports exactly what was published; retry finishes remaining destinations without duplicate versions or moved tags. A mismatched pre-existing artifact stops the retry. Record the test-tag recovery run. |
| P15-09 | Close P12/P13 release-candidate UI regressions | 2 | P12, P13 | Enabled button text retains accessible contrast when async work finishes. Release creation checks wait for actual dialog dismissal and action navigation before auditing or invoking history. Review/rejection checks require operation completion before queuing again, including Release acceptance that stays at Review. Keep all existing assertions and repeat the affected themed workflows, then whole quality/desktop checks. |

## Tests

- **Unit:** version comparison, the update check and the release-notes selection.
- **End-to-end:** the update banner against a mocked releases endpoint.
- **DMG smoke test:** mount, copy, start with a fresh data folder, then quit cleanly.
- **Release recovery:** a test tag exercises failed asset staging and partial publication/retry. Network failures are injected at the external boundary; successful public test versions are recorded rather than described as rolled back.
- **Candidate UI follow-up:** audit only after async controls and release navigation finish; enabled button contrast must not fade. Run native quality and desktop suites sequentially, retaining all public-flow assertions.

## Failure and recovery

- Failure before publication leaves the GitHub Release in draft. Failure after a destination is published preserves and reports that completed step; rerunning reconciles it and finishes the remaining steps. Mismatched published content requires a new version and an explicit decision.
- Update checks that fail stay silent and try again the next day.

## Exit criteria

Every story is accepted, and a test release proves the whole pipeline.

## Hand-off

- D24 delegates the icon decision; the [recorded agent review](../docs/icon-review.md) accepts the connected V without claiming a personal human review.
- Implementation and local checks are prepared. Resume from the actual npm account sign-in/2FA checkpoint in [evidence](../docs/verification/p15.md), then configure the registered workflow, verify matching CI and run the retained v0.2.0 test-tag failure/retry/provenance proofs. The implementing agent performs the commands and publication steps; the human provides only the required account interaction.
