# Using Voidra Project

[Documentation](intro.md) · [Installation](../README.md#install-on-macos) · [Glossary](../GLOSSARY.md)

This guide describes Voidra 1.0.0; [P17 evidence](verification/p17.md) records its verification and publication.

The 1.1.0 development candidate replaces the primary Backlog/Actions pages with **Tasks**. It shows Backlog, TODO, In progress, Review and Done, retaining idea provenance and child tasks. Choose a project **Release package** to use an alternate `package.json`, then review the explicit task-tracking upgrade before enabling release-aware work. Opening a project makes no bulk changes. New tickets use the current version; Backlog can remain unversioned. Move buttons preserve assigned releases and fill missing ones when moving to TODO. Runs, answers and reviews still control lifecycle progress. The remaining workspace redesign is tracked in the [v1.1.0 plan](../plan-v1.1.0/main.md).

Voidra keeps your project’s plans in readable files under `.voidra/`. The desktop helps you organize work and make decisions; Claude Code or Codex runs the installed skills to plan and implement it. You can use the skills while the app is closed. Your code and planning history stay in your local project.

## Open or create a project

Open the project folder in the app. For an existing Git project, choose the worktree root rather than one of its subfolders. Linked worktrees are supported.

For an empty folder, choose **General software**, answer the profile questions, then select **Create planning folder**. Voidra creates the profile and a **Bootstrap** action. You can leave unresolved answers open. Bootstrap discovers the remaining questions and proposes a plan before any project setup. Git can remain absent during planning; after you approve the exact Bootstrap plan, Go initializes the local repository before implementation. Configure your Git name and email before running unassigned implementation work.

For a folder with code, follow the app’s `voidra-init` instructions in your coding agent, or enter the profile manually. Init reads the existing project, creates planning files, marks observed answers **inferred**, and adds instruction pointers. For an existing-code folder without Git, have your coding agent set up the local repository before implementation. Review inferred answers in the inbox. Inferred, assumed and open values are distinguishable from values you confirmed.

## Install the agent skills

Use the first-run offer or **Settings → General**. **Install Claude skills** and **Install Codex skills** each install the complete bundled set for that client, offline. Edited or unmanaged copies open an exact bundle review before replacement. If a file changes during review, review the updated preview and confirm again. A stopped installation lists completed and remaining copies; selecting Install again checks the current files before retrying. Installation does not start an agent.

The public skills are:

| Skill | Purpose |
| --- | --- |
| `voidra-init` | Bring an existing codebase into Voidra. |
| `voidra-go` | Run queued planning, implementation, Research and local Release work. |
| `voidra-plan` | Run queued planning without implementing or committing. |
| `voidra-release` | Collect completed work into a local Release action. |
| `voidra-sync` | Reconcile outside Git changes into planning suggestions. |

The general template also includes `voidra-architect-general`, which Go and Plan use for Discovery and plans. In Claude Code invoke a skill with `/voidra-go`; in Codex use `$voidra-go`. Read the installed skill if your agent does not expose a shortcut.

## Turn an idea into work

Open **Tasks** to work in Backlog, TODO, In progress, Review and Done. **Add task** (Cmd/Ctrl+N) creates executable work; **Add to Backlog** captures an idea. Open a card to clarify, edit or promote it, review its plans/results, or use a human checklist. **Back to Tasks** returns to the board.

Choose an action type that matches the work:

| Type | What it does |
| --- | --- |
| Feature | Discover scope, plan, implement and verify a new behavior. |
| Bug | Reproduce and diagnose a fault, then fix it with a regression check. |
| Improvement / refactor | Improve an existing implementation while preserving behavior. |
| Docs / chore | Make a small maintenance change. |
| Profile change | Assess and implement the impact of a profile edit. |
| Research | Record findings and recommendations without changing code. |
| Release | Propose a version and notes, then commit and tag after acceptance. |

New ordinary work uses your coding agent. Existing human tasks and human blockers still have usable checklists. Dependencies block an action until the required work is complete. The board filters tasks by release, type, status and assignee; it does not override their lifecycle or approval gates. Drag a card by its grip or focus the grip and use Left/Right. Visible Backlog/TODO buttons provide another way to move unstarted work. Escape cancels a drag. Run, Review and Done remain controlled by their existing gates; a refused move offers the relevant task steps. Existing release assignments survive moves; a missing release is filled from the current package when leaving Backlog. Open **Release settings** to choose the package or enable release-aware movement. Closing it preserves unfinished setup values. The Release filter offers Current, previous versions, All releases and Unassigned Backlog; it never changes the run queue. Large work can be split into demonstrable child slices, each with its own planning loop.

Fresh action and Backlog capture opens in **Agentic**: describe one outcome in a Markdown input, review the OpenRouter request and generated title/type/description, then save. **Normal** shows Title and Description with the relevant metadata. Title is optional; leaving it empty requests a reviewed AI title. A manual title is preserved. Switching modes retains each mode’s text and reviewed result; generated fields seed untouched Normal inputs for editing. No key or generation failure leaves the draft available for retry or manual completion. Assignee comes from Team; Backlog assignment and proposed type survive promotion.

## Resume unfinished forms

Leaving an unfinished form saves a private draft on this computer, including incomplete values. Reopening shows a row of badges above the fields. Select a badge to restore its whole form, or choose **New draft** to start fresh. Fresh task capture always starts Agentic; restored drafts keep their saved mode. **Discard current draft** is separate from closing. Saving successfully removes that submitted draft.

This applies to task edits, profile setup/answers, Team, questions/feedback, AI reviews, planning commits and release selection. Restoring keeps the original source revisions and never submits a decision or starts work. A changed source still requires the existing reload/review process. If local draft storage fails, the form stays open for correction or text recovery.

**Settings → General → Unfinished forms** recovers text even when the original task or question has been removed. Use **Copy Markdown** to recover the original text, or explicitly discard a draft. API key drafts stay encrypted and appear separately under **AI suggestions**; selecting one does not reveal or apply its value. Drafts survive restart and cache rebuilds, and stay outside project Git history.

## Edit Markdown

Descriptions, long profile answers, free-text questions, feedback and AI review text render Markdown inside the input. Put the cursor on a line to reveal its source; selecting multiple lines reveals those lines. Headings, lists, tables, checklists and code remain readable around the text you edit. Copy and paste use Markdown source. Undo/Redo in the field change its text, independently of project history. Use Cmd/Ctrl+S in an edit dialog to activate its enabled Save button. Invalid text stays available for correction; saving still checks for outside file edits.

## Assign work with Team

Add members in **Settings → Team** using their Git name and email, then select **Me**. New members join the currently open project; choose each project’s members with its checkboxes. Fresh action forms preselect Me only when you belong to that project. Otherwise work stays unassigned. Removing a member leaves existing task assignments unchanged. The roster and membership choices stay private on this computer. **Manage Team** in an assignee field opens this tab directly.

## Run the queue

For release-aware projects, TODO work joins the right **Actions** sequence automatically. Drag its grip, use Up/Down arrows or its buttons to order the full sequence, independently of board filters. Dependency warnings offer optional **Rearrange**; keeping the order still cannot run blocked work. Running/waiting tasks remain until they finish, are cancelled or return to Backlog. Legacy tracked projects show a source-bound **Enable Actions sequence** preview; new task-tracking upgrades include it.

The sequence and execution requests are separate: starting consumes a request once. An eligible later request may run while an earlier one waits for a prerequisite. After answering/approving or deciding to retry, explicitly queue that action again in **Run**; reordering never silently retries it. In legacy projects, add eligible actions to **Run** and arrange their strict queue order. The queue is personal, while actions and results are shared planning records. Start your chosen coding agent in the project and invoke Go or Plan. The agent processes the queue, records ownership and consumed inputs before work, and stops each action when it needs a decision.

Go can implement approved work. Plan preserves source files, instructions, Git presence, commits and tags; it may write planning records and settled glossary additions through its helper. Plan stops before implementation even when an action already has an approved plan.

Only one owned run can write the project at a time. A stale heartbeat is a warning, not permission to remove a lock. If a process exits unexpectedly, use the app’s displayed recovery command in your agent. Recovery checks the owner and existing bytes before finishing an interrupted operation. Keep outside edits when a conflict is reported.

## Answer questions and approve plans

Use **Waiting for you** in the titlebar to open the bottom panel and answer question rounds, confirm inferred profile values and review plans/results. Each question explains why it matters, offers choices and permits free text. **Let the agent decide** records a delegated assumption with the agent’s reason; it does not turn that value into a confirmed answer.

A plan has requirements, a blueprint and acceptance criteria. Read its exclusions, testing seams and any proposed ADRs, then approve or request changes. Approval binds the exact contents of all three files. Editing any of them invalidates the old approval, even if the edit only changes formatting. Go stops and asks for fresh approval before continuing implementation or rework.

## Review results

The agent records the files changed, actual checks, review notes and commit identifiers. Implementation normally stops at **Review**. Accept it to finish the action, or reject it with feedback to request rework. Research acceptance finishes the findings; Research writes no implementation commit. Human actions finish through their checklist.

A Release follows a different final step: accepting its proposal authorizes the agent to change the approved version/changelog files and create the local commit and tag. Acceptance itself does not create a tag. The action becomes **Released** after the agent completes and records those effects. Voidra’s local Release workflow does not publish your project to hosting or registries.

## Prepare a release

Open **Releases → New release**. Select completed unreleased work, choose a Xeploy Bug fix/Minor/Major/Custom version, and write Markdown notes. Before creating the Release action, explicitly choose whether the listed current-version Done tickets **keep the current release** or **move to the new release**. Other historical assignments stay as recorded. The wizard saves every unfinished step and invalid value privately; restore it from the top draft badge after closing or restarting. A changed package keeps the old draft for reference and requires a fresh version context.

Your selected coding client prepares the exact Release proposal and stops for Review. The proposal shows its source, new version, tag, notes, members and Done-ticket choice. Only acceptance permits source/version changes and the runtime-owned commit/tag. Both Keep and Move record completed release membership, preventing duplicate publication. If finalization stops, use the existing recovery flow; matching commits/tags are retained.

Standalone agents use their bundled `release-options` command for the same read-only Xeploy preview. Missing keep/move decisions go through questions. Local planning/tagging and publishing remain separate operations.

## Outside changes, history and undo

Git history links action commits using their recorded trailers. **Commit planning changes** shows a preview of selected shared planning files before creating a separate planning commit. It excludes private local state and preserves unrelated staging. No commit operation automatically pushes your project.

When you make code changes outside Voidra, run Sync to inspect the relevant Git history and propose planning updates. Confirmed answers are protected: a conflicting observation becomes a draft Profile change instead of replacing your answer. Repeating Sync at the same revision does not duplicate proposals.

Undo and redo cover app planning edits and survive restart. A record already consumed by a run cannot be undone across that consumption boundary. If outside edits changed bytes, review the overwrite confirmation rather than assuming history can restore them safely. Undo does not rewrite implementation Git history.

## Decisions, glossary and documents

The decisions view gathers answered questions, plan/review decisions and assumptions so you can search them. Revisit an assumption from its current source to create follow-up work; the original decision remains history.

Decisions and Glossary render complete Markdown, including tables, lists and code. Glossary search highlights matches without hiding parts of a definition.

Open **Documentation** to browse `docs/` and the root `GLOSSARY.md` as pages. Search documentation (Cmd/Ctrl+F) filters the directory by visible text and shows each file's match count. Select a result, then use Next/Previous match; document back/forward preserves your search. Matching is literal and case-insensitive, including text across bold or italic formatting. Filenames and hidden link destinations do not count. Added, changed and removed files refresh automatically. Toggle **Directory**, drag its divider or use arrow keys to resize it. A narrow workspace shows the directory over the article and closes it after you choose a file. Invalid or unsupported documents show a useful error while search stays available. These views are read-only. Use **Open in editor** to edit a source file. ADRs are reserved for decisions that are hard to reverse, surprising without context and involve a real tradeoff; smaller decisions stay with their action.

## Settings and optional AI

Settings has **General**, **Appearance** and **Team** tabs. General contains the **Default coding AI client** switch, optional AI, coding-agent skills, update checks and the app version. Choose Claude Code or Codex; setup, Run, recovery and Sync show that client’s command. Existing runs keep their recorded client. Appearance contains the light, dark or system theme and **Custom titlebar**, enabled by default. Its styled window controls close, minimize and maximize/restore the window; the Settings icon is at the opposite end. Turn the switch off to use the operating system's titlebar. The preference is saved immediately and applies when you reopen the window; existing windows and unfinished edits stay open.

Navigation, Actions, main content and Waiting for you scroll independently. Toggle the three panes from the titlebar or View menu with Cmd/Ctrl+Alt+1/2/3. Drag their dividers or use arrow keys and Home/End on a focused divider; Enter hides its pane and Escape cancels a drag. Sizes and visibility restore per project. Undo/Redo stay in the titlebar, including the accessory in native-titlebar mode. New attention opens the bottom panel without taking typing focus; dismissing it remains respected until something new needs attention. Hiding first saves unfinished answers/feedback; a save failure leaves it open. The app supports keyboard operation; use Left/Right or Home/End to move between settings tabs, Space to change the switch, and Escape to close dialogs where appropriate.

OpenRouter suggestions are optional. Store your key in Settings, test the connection, and review the displayed request preview before sending. Suggestions fill editable drafts; they do not save, approve or run work automatically. The key remains in main-process encrypted storage and is not returned to the renderer. Planning requests exclude source code, repository documents, private local files and unknown fields. Read [AI behavior and privacy](architecture/ai.md) for the exact contract.

The update notice checks the public GitHub release at startup and daily. You can disable it in Settings. Downloads open the release page; install updates yourself. The macOS build is unsigned: follow the [installation instructions](../README.md#install-on-macos) for the first open.

## If something stops

- A question or approval gate is expected: resolve it in **Waiting for you**, then queue the action again.
- A changed plan needs fresh exact-byte approval.
- A live owner must finish or exit before recovery can take over.
- A file conflict needs inspection; the app retains outside edits and shows the affected records.
- Invalid planning data should be repaired before starting more work. Use the matching installed `voidra check` CLI and inspect its diagnostic paths.
- A required account action belongs to the person who owns that account. The agent can prepare and verify the surrounding work.

[Format and CLI reference](format/Intro.md) · [Agent procedures](agents.md) · [Recorded verification](verification/Intro.md)
