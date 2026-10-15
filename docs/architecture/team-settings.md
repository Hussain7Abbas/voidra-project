# Local Team and coding preferences

[Architecture index](Intro.md) · [Settings store](../../apps/desktop/src/main/state.ts) · [Shared boundary](../../apps/desktop/src/shared/team.ts)

The main process owns Team in its private `settings.json`, independently of project planning files, Git identity, the disposable cache and project undo. Settings version 1 gains additive defaults; existing theme, recents and unknown root settings survive. Missing Team starts empty and the coding-client storage default is explicitly Codex. Invalid saved settings retain their original bytes and report an error rather than resetting the roster.

## Members and projects

Each member has a stable UUID, name and email. Emails are unique ignoring case; the original spelling is retained for portable `Name <email>` task assignments. Team never rewrites Git configuration or historical task fields. Member names reject angle brackets and line breaks, so identity boundaries stay unambiguous.

Me points to at most one member. Each canonical project root has a private selected subset. Adding a member with a project open also selects that member for that project; other projects remain independent. Main obtains the project from the sender's registered window, never an arbitrary renderer path. Removing a member clears its Me/subset references but leaves canonical task assignments alone.

The assignee dropdown shows the current project's selected members. A fresh form defaults to Me only when that member belongs to the project; otherwise it stays unassigned. Previous assignments can remain visible through the shared option adapter without becoming new roster members. Manage Team opens the same Settings surface directly on its Team tab.

## Concurrent edits and keyboard access

Every roster command carries the displayed SHA-256 revision. Main serializes settings changes and compares the exact roster revision before an atomic private-file replacement. Stale, duplicate and invalid edits preserve the original file; the UI retains unfinished name/email text for correction. Me/membership controls show the pending selection immediately, then restore saved values on failure.

Settings has General, Appearance and Team tabs with roving focus, Left/Right wrapping and Home/End. Member controls and the assignee select retain visible labels and normal keyboard behavior. Phase V11-P04 adds durable form drafts to unfinished member entry; immediate Me/membership choices already persist as settings.

## Coding-client storage

The shared enum is Claude Code (`claude-code`) or Codex (`codex`). Main persists it through a narrow validated command, separately from Team revisions. General exposes a native-radio segmented preference. Onboarding, Run, recovery and Sync render only that client’s commands; main rechecks the preference before copying, refusing a stale or alternate choice without touching the clipboard. Changing it never cancels an owned run or changes its recorded client. The two complete-bundle client installers are an explicit exception. [Installation](skills-distribution.md) describes catalog integrity, exact edited-copy review and partial failure/retry.
