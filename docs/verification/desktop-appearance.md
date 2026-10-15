# Desktop appearance follow-up

User-requested source follow-up, 2026-10-15; decision D30. The published v1.0.0 source/tag/assets are unchanged.

The main area and sidebar each have bounded independent `overflow: auto`, stable scrollbar gutters and contained overscroll. The titlebar and workspace toolbar stay outside these scrollers. Recents expand inside the sidebar to avoid clipping. Settings has General (AI, skills, updates/version) and Appearance (theme, custom titlebar) tabs; keyboard arrows/Home/End select/focus tabs and Space toggles the labeled switch.

Fresh and legacy settings default custom titlebar to true. Main constructs a frameless custom window or a native framed window from the saved preference; snapshots retain each current window's actual mode. Setting changes persist immediately and apply on window reopening, with a visible pending-change message. Existing windows and unfinished inputs are preserved. Custom macOS controls are on the left, Settings on the right; the opposite order is used on other platforms. The validated bridge allows only close/minimize/toggle-maximize for the trusted sender window. Drag regions exclude buttons; maximize/fullscreen state updates the Restore label.

## Verification

Local verification completed on 2026-10-15. The full desktop suite passed: **68 checks in 7.1 minutes**, including both new appearance cases. `make check` passed: **398 tests across 84 files in 398.98 seconds**, coverage gates, lint, strict types, a clean 134-file deprecation scan and current generated references. Build passed, as did the store/schema regression check (4 tests), documentation-link test, all 100 local links in affected documents and offline `voidra@1.0.0 check .`.

The initial Electron runs caught a duplicate banner landmark and a controlled switch that visually reverted while saving. The titlebar now uses a named section, and the switch updates immediately while saving, then reconciles with the persisted value. Both corrected behaviors are exercised in the final passing suite. Inspected light/dark screenshots show separate visible overflow scrollbars and the Settings icon opposite the window controls. General/Appearance screenshots were captured in both themes in a separate disposable app after quality completed; the Appearance switch and General controls were visually inspected. Logs/screenshots are ignored local evidence under `.cache/titlebar-*.log` and `.cache/screenshots/`.

Automated desktop coverage checks real mouse-wheel isolation at a 1000×550 window, bounded page height, settings keyboard behavior, native minimize/maximize/restore/close, saved switch values and real frames across fresh launches. Axe runs on General/Appearance and the scrolled shell in both themes. Existing workflow checks now select Appearance for theme changes and return to General for existing settings.

## Limits

Hosted CI on the original appearance commit `9917bfe` failed with 397/398 tests passing: the unchanged run-index finalization poll timed out at its implicit one-second deadline. Later desktop/package steps were skipped. This recurring failure and the subsequent correction are tracked in [run-index CI evidence](run-index-ci.md); the local appearance results above remain the actual passing local results.

No new public release is requested or published. The macOS arm64 runtime is the verified platform; other-platform control order is implemented but not exercised on another OS. Automated keyboard/axe checks do not substitute for a new manual screen-reader session; the prior P17 VoiceOver report covers the released v1 candidate.
