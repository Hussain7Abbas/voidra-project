# V11-P03 — Team and coding-client settings

> **Needs:** P01 · **Status:** Done — 2026-10-15 · **Confirmed:** C05; operational-client details in A06

## Outcome

Forms can choose team members, Me supplies the default assignee, and operational guidance consistently uses the selected coding client.

## Requirements

In scope: Settings → Team, member management, Me selection, **Claude Code / Codex** segmented preference, two complete-bundle install actions. Out of scope: account invitations, authentication, a hosted team directory, uninstalling coding clients or v2 agent launching.

## Blueprint

Extend main-owned versioned settings and narrow bridge commands. C05 confirms one local roster with each project choosing its members; portable assignee identity is stored on shared tickets. Use stable member IDs locally and preserve the established shared identity representation. Me is a personal selection and does not rewrite Git configuration or historical authorship. Allow at most one Me member, prevent ambiguous duplicates and retain legacy assignees for display even when no longer in the dropdown roster. A project dropdown shows its selected members; handle Me not belonging to that project without silently assigning an outsider.

General keeps exactly two skill installation entry points: **Install Claude skills** and **Install Codex skills**. Each reviews/applies the entire bundled skill set for that client; retain existing edited-copy protection, compatibility checks, contained paths and recoverable per-skill installation internally. No per-skill choices. A failed batch reports completed/remaining items and can resume safely.

The default client affects command copying, onboarding, recovery, Sync, release guidance and labels. Both installer buttons are an explicit settings exception. Preference changes affect subsequent interactions without interrupting an existing run or rewriting its recorded client. Choose an initial value during the phase understanding check; persist it visibly rather than guessing from installed files.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P03-01 | Team roster and Me | 5 | P01 | The local roster survives restart; two projects can select different subsets; dropdowns show the matching subset; Me preselects only where eligible; removal never erases historical assignments. |
| V11-P03-02 | Default coding client | 3 | 01 | Selecting either segment survives restart and all operational copy/guidance uses that client, with no alternate picker. |
| V11-P03-03 | Install full skill bundle | 5 | 02 | Each of the two buttons installs the complete matching bundle into its fixed client destination; edited copies require the existing concrete review. |
| V11-P03-04 | Settings integration and recovery | 3 | 03 | Team is keyboard reachable; invalid settings preserve original bytes; interrupted bundle installation resumes without touching unrelated skills or the other client. |

## Tests

Real temporary settings homes; schema upgrade, duplicates, missing Me and legacy assignees; validated preference commands; UI client switch across command surfaces. Bundle installation checks actual files, symlink refusal, stale previews, edits and failure/retry. Do not write the developer's real skill directories in tests.

## Failure and recovery

Missing Me leaves the dropdown unassigned with a clear Team link. Corrupt preferences retain their original file. Batch previews bind all bundle revisions; stop on conflicts and preserve completed results without silently replacing edited content.

## Exit criteria

All stories and `make check` pass; both clients' guidance and both full installers have actual test evidence.

## Hand-off

Update settings/user-guide and skill-distribution documentation. P04 consumes roster/Me and retrofits these data-entry forms with the shared [draft contract](form-drafts.md); instantly saved preferences retain their existing persistence. P06/P07/P09 consume the single operational client preference. Keep both clients covered in development verification.

## Executed outcome

All four stories are complete. [Verification](../docs/verification/v1.1.0-p03.md) records 440 passing quality tests; real file/process/permission/symlink checks; both-client command selection and restart; Team/project/Me behavior; and all six actual skills for both temporary homes with exact review, retry and both-theme accessibility. No public release or real coding-agent execution is claimed here.
