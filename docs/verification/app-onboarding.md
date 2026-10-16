# First-launch app setup verification

Requested 2026-10-16. This direct follow-up adds an app-level setup page before the main workspace; it does not change project onboarding, agent runtime, canonical project format or release version.

## Implemented boundaries

- Three sections: System/Light/Dark previews, Codex/Claude Code selection, selected-client complete offline skill installation. Choices use native radios and saved main-owned preferences; controls show selection immediately while saving and recover on failure.
- The selected bundle alone appears on setup; Settings keeps both counted full-bundle buttons. Existing diff/replacement review, serialized application, symlink refusal and edited-copy protection remain shared.
- Continue requires a current complete selected bundle. Main obtains fresh status and checks every member; AppStore compares the displayed theme/client inside its serialized preference write. Incomplete/edited skills or changed preferences refuse completion.
- Fresh settings remain unfinished until completion. Restart restores theme/client. Existing legacy skill-offer acknowledgements migrate to completed setup unless an explicit unfinished flag is present. Later skill edits do not force completed users back through onboarding.
- Existing titlebar/window controls remain available; project navigation and workspace views mount after completion. The setup page scrolls independently below the titlebar. No credential/network access or agent process is needed for setup.
- Workspace UI scenarios explicitly seed completed setup through a shared disposable-data launcher. First-launch scenarios use the unmodified Electron launcher and isolated skill homes.

## Executed checks

- The new settings test was run before implementation and failed on the absent setup flag. After implementation, the focused state suite passed all five tests, including unfinished restart, stale theme/client refusal, completion persistence and legacy/explicit-state precedence.
- Three real Electron first-launch scenarios pass: Codex/light and Claude/dark flows with restart, fresh main-side refusal after outside edits, cancellation without replacement, exact replacement, selected-agent switching and keyboard completion; plus a blocked symlink destination repaired and retried safely. Both theme flows pass axe. Installations use disposable homes; the actual developer home remains untouched.
- The consolidated final-source run passes all 12 Electron scenarios in 1.0 minute: the three first-launch cases and nine existing shell/project-window, before-paint theme, connection recovery, custom/native titlebar and both-bundle installer cases. The new flows also verify keyboard resizing after setup completion, native window shrinking and the 700×550 minimum window.
- Inspected actual light/dark setup screenshots and the compact footer. The native radio cards now give their transparent input the complete card hit area and retain immediate selected feedback while preferences save. Tests scope completion errors to the main landmark rather than Next’s empty route-announcement alert.
- Review caught that conditionally mounting the measured shell host would leave its one-time ResizeObserver unattached. The host now stays mounted through loading/setup/workspace transitions; a native resize regression verifies panel fitting after completion. The first full quality run was intentionally interrupted for this correction. Final quality verification followed the fixture correction described below.

The subsequent full run exposed a workspace native-test fixture still expecting task details from fresh settings, which correctly displayed setup. The five native UI fixtures (actions, conflicts, review, queue and Git history) now use the same explicit configured-app launcher as workspace e2e scenarios. All five pass in the focused run (39.57 seconds). Bridge/security-only native cases retain fresh settings. The fresh complete quality run passes after the fixture correction; no production setup bypass or reduced assertion/timeout was added.

## Final result

`make check` exits successfully: formatting/lint, strict type checks, production build, **492/492 tests in 110 files**, all scoped coverage gates, deprecation scan and generated-reference checks. The coverage test stage took 712.51 seconds. Overall line coverage is 65.78% including renderer code, which has no percentage gate; the existing package/main/service/tool gates all pass.

The final Electron command was `pnpm exec playwright test e2e/app-onboarding.spec.ts e2e/skills.spec.ts e2e/appearance.spec.ts e2e/shell.spec.ts` from `apps/desktop/`: **12/12 pass** in 1.0 minute. First-launch cases use actual bundled installations in temporary homes, axe in both themes, restart recovery, exact edited-copy cancellation/replacement, selected-agent switching, keyboard completion, and panel fitting after transition to the workspace at the 700×550 minimum size. All desktop implementation/test files matched the recorded source hashes after the quality run.

Light/dark screenshots were inspected locally. These checks run against the built macOS Electron application; no manual VoiceOver pass, new packaged distribution, public release or authenticated coding-agent execution is claimed. The shared format and executable skills are unchanged by this follow-up.
