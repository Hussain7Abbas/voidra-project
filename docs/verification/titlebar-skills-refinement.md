# Titlebar and skill-settings refinement — 2026-10-16

[User guide](../user-guide.md) · [Panels](../architecture/workspace-panels.md) · [Installer](../architecture/skills-distribution.md) · [Tracker](../../plan-v1.1.0/main.md)

Post-release source refinement requested directly by the user. The published 1.1.1 release and immutable tags are unchanged.

General’s agent-skill section now shows **Install Claude Skill n/total** and **Install Codex Skill n/total**. Counts use the existing validated catalog and current unedited/unblocked installed copies; all six available skills remain a complete-bundle operation. Fresh status is checked before install/review. Permanent description/version/status-detail rows are removed; successful completion is announced to assistive technology, with actionable errors and exact edited-copy replacement review retained.

Panel controls retain their Lucide outlines and fill only the represented pane while expanded, without an active button background. Expanded/control semantics, shortcuts and attention counts remain. Panel/history controls sit together beside Settings at the opposite end from platform window controls. Custom and native accessory titles center on the full window, with opaque interactive groups layered above long text when space is tight. Window operations and validated IPC are unchanged.

## Verification

- Strict typecheck, production desktop build and repository lint pass; lint retains six pre-existing informational suggestions.
- Affected real Electron suite: **11/11 passed in 47.6 seconds**. Both themes cover the counted installer, both complete bundles in temporary homes, partial failure/retry, edited-copy cancellation, stale-review refusal/renewal, restart and unchanged unrelated copies. The section has exactly two buttons; counts cover 0/6, edited 4/6 and restored 6/6.
- Final minimum-width rerun: **2/2 passed in 13.1 seconds**, exercising custom and native accessory centering/button access at the actual **700px** minimum window width in both themes, including an overlapping long title.
- Custom/native titlebars retain Settings keyboard tabs, Escape/focus return and actual maximize/restore/minimize/close. Layout checks assert independent title centering, grouped controls opposite native controls and unobscured button hit targets. Panel checks cover filled icons/transparent expanded backgrounds, all pointer/keyboard splitters, cancellation, persisted toggles and bottom-panel draft/attention/history behavior. Axe passes in both themes.
- Initial run: **10/11 passed in 50.2 seconds**; one light/native pointer resize did not advance after the successful keyboard resize (272 observed versus 296 expected). Its dark/native and both custom counterparts passed. The complete renewed suite passes with the original drag/assertion and no weakened guard, timeout or retry configuration; no production resize change was made. This records the isolated observation rather than asserting a diagnosed product defect.
- Logs: `/tmp/voidra-chrome-{types-final,build-final,lint-final,e2e,e2e-final,minimum-width}.log`. Screenshots under `.cache/screenshots/` include `titlebar-narrow-{light,dark}.png` and `v11-p03-skills-{light,dark}.png`; changed screens were visually inspected.

Actual native-window execution is macOS arm64. Windows/Linux platform ordering remains explicit in source; no native Windows/Linux execution or new physical screen-reader pass is claimed. Checks are scoped to this renderer refinement; the completed release’s full quality/publication results remain separate in [P10](v1.1.0-p10.md).
