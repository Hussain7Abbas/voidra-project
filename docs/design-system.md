# Ink & Iris in Voidra Project

[Documentation index](intro.md) · [Desktop architecture](architecture/desktop.md)

The desktop uses the storylens **dashboard** reference, not its public website layout. Verified source revision: `daee89af2a5a5255b4dbc240a5d81be2b530b488`, from `/Users/hussainabbas/programming/projects/personal/storylens`. Source paths: `apps/dashboard/design-system/MASTER.md`, `apps/dashboard/src/styles/globals.css`, and the required components in `apps/dashboard/src/components/ui/`. The source ownership and AGPL adaptation are recorded in [the ADR](adr/2026-10-13-storylens-design-port.md).

| Token | Light | Dark |
| --- | --- | --- |
| Paper | #f7f7fb | #171820 |
| Surface | #ffffff | #22232e |
| Ink | #202132 | #eeeff6 |
| Muted | #656779 | #a8abbe |
| Border | #e0e1eb | #383a4b |
| Accent | #6554c0 | #b5a8f5 |
| Accent hover | #5544a7 | #c9befa |
| On accent | #ffffff | #211a39 |
| Accent soft / wash | #eeebfa / #eeeefa | #302a45 |
| Success | #26705e | #80cbb0 |
| Error | #b4233b | #ff9ba9 |
| Warning | #9a4c00 | #f5c078 |

The token stylesheet preserves Tailwind v4 mapping, Inter Variable, 0.65rem controls, 1rem cards, 3px focus outlines, 200ms transitions and the reduced-motion override. Lucide icons use consistent strokes and accessible roles. The sidebar is 16rem; content is limited to 72rem with adaptive gutters. Disabled future sections communicate unavailable functionality without fake data.

Light/dark/system preference persists in app data. The protocol inserts the resolved theme on the HTML root before paint; the window's initial background also matches. Native theme updates and media-query change listeners keep system mode current. Fonts and assets are local. The frontend has no network server or remote font request.

Button, native Dialog, ConfirmDialog, Field, Toast, Spinner and Page components are adapted from the dashboard. Dialogs use showModal, Escape/light dismiss, explicit close, focus containment and focus return. Labels/hints/errors are tied to fields. Toasts are dismissible and announced; destructive recent-list edits confirm first. Keyboard users have a skip link and visible focus. The implementation was checked with axe in both themes on welcome, folder placeholders, settings, recent-project panels, confirmations, missing folders and service reconnection.

The ui-ux-pro-max searches informed focus, contrast, responsive density and restrained motion; generic palette/font recommendations were rejected in favor of the approved Ink & Iris system. Modern-web-guidance dialog/dark-mode guides were checked against the pinned Electron runtime. Visual screenshots of both themes and the packaged app were inspected locally. VoiceOver verification remains the P17 release check.
