# V11-P07 — Resizable workspace and human gates

> **Needs:** P02, P06 · **Status:** Done — 2026-10-15

## Outcome

A compact workspace has a Tasks center, toggleable/resizable sidebars, a bottom Waiting for you panel and titlebar history controls.

## Requirements

In scope: left navigation, right Actions, bottom Waiting for you, resize/toggle controls, attention behavior, titlebar Undo/Redo and topbar removal. Out of scope: new lifecycle decisions or removing native menu/keyboard undo support.

## Blueprint

Move Undo/Redo into the titlebar with existing enabled state, descriptions, shortcuts and routing. Remove the workspace topbar and Local project text. Keep project switching, Settings, connection/recovery state and panel toggles reachable. Controls must be outside the window drag region; custom-titlebar-off windows need an accessible equivalent titlebar accessory or an explicit native-mode solution without restoring the removed topbar.

Navigation and Actions have independent width; Waiting for you has independent height. Every panel supports pointer resize and keyboard-operable separators, explicit show/hide controls, minimum/maximum bounds and restored dimensions. Persist local layout preferences, clamp on small windows/display changes and keep the main task area usable. Panels scroll independently; hiding is distinct from sizing to zero.

Move the existing inbox/gate UI into the bottom panel, preserving questions, plan/review decisions, inferred-answer confirmation and human checklists. Render Markdown question, reason and option text; editable answers/prose use P02. New actionable attention opens the panel and updates a badge without stealing typing focus. A user can dismiss it; do not reopen repeatedly for the same unchanged item. A genuinely new attention item reopens it; define first-open/restart behavior explicitly. Keep selected task/gate context and drafts across toggles.

Adopt P04's shared [draft lifecycle and top badge navigation](form-drafts.md) for question answers, review/rejection feedback and every other data-entry form in this panel. Exiting/toggling/navigation saves the unfinished input; reopening restores it only for its originating task/question/revision. A restored draft is not a submitted answer or renewed approval. If another client changed the gate meanwhile, keep recoverable text and require the existing stale-context resolution.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P07-01 | Titlebar controls and topbar removal | 5 | P06 | Undo/Redo and all three panel toggles are reachable; Local project/workspace topbar is absent; native controls, menus and shortcuts still work. |
| V11-P07-02 | Resizable persistent panes | 5 | 01 | Each sidebar and bottom panel can resize/toggle independently, restores after restart and remains reachable in constrained windows with keyboard controls. |
| V11-P07-03 | Bottom gate workflow | 8 | P02, 02 | Questions, exact plan approvals, review and human checklist flows work in the bottom panel with rendered Markdown and the same revision protections. |
| V11-P07-04 | Attention and draft continuity | 5 | 03 | New attention opens the panel without focus theft; unchanged attention respects dismissal; exiting preserves unfinished answers/feedback; reopening shows top draft badges and restores the correct context across restart without submitting or renewing stale gates. |

## Tests

Real Electron resize/toggle/restart/window-bounds tests in light/dark and both titlebar modes; keyboard and screen-reader separator use; no hidden focus traps. Gate completion, stale revisions, duplicate refresh, new versus unchanged attention and text-versus-workspace undo. Preserve native history menus and consumed-record refusal.

## Failure and recovery

Invalid saved dimensions reset only layout preferences. Lost project services leave recovery controls visible even with panels collapsed. A stale gate cannot commit merely because the panel auto-opened. Reconnect refreshes state without duplicating answers or losing local drafts.

## Exit criteria

All three panels demonstrate resizing/toggling; titlebar/native-mode behavior is resolved; all stories and `make check` pass with gate/accessibility evidence.

## Hand-off

Update desktop instructions that currently require a fixed workspace toolbar and two-tab Settings, design-system layout docs and inbox architecture. P08 reuses pane primitives for the documentation directory.

All four stories are complete. [Verification](../docs/verification/v1.1.0-p07.md) records 466 passing quality tests, 12 final panel/gate workflows, five final native/board/editor workflows and both-theme screenshots.
