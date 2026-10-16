# Using Voidra Project

[Documentation](intro.md) · [Installation](../README.md#install-on-macos) · [Glossary](../GLOSSARY.md)

This guide describes the current 1.2.0 development workspace. Published 1.1.1 remains available; [P10 evidence](verification/v1.1.0-p10.md) records completed verification, publication and remaining limits. The original 1.0.0 delivery remains documented in [P17](verification/p17.md).

The workspace uses **Tasks** with Backlog, Planning, TODO, In progress, Review and Done. Choose a project **Release package** to use an alternate `package.json`, then review the explicit task-tracking upgrade for an existing legacy project. Fresh projects enable tracking automatically. Opening a project makes no bulk changes. New tickets use the current version; Backlog can remain unversioned. Leaving Backlog fills a missing release and preserves an assigned version. Planning owns questions/plans, TODO is idle, In progress queues implementation and Review queues QA/security. The [workflow tracker](../plan-v1.2.0/main.md) records this follow-up; the completed [v1.1.0 plan](../plan-v1.1.0/main.md) remains historical delivery evidence.

Voidra keeps your project’s plans in readable files under `.voidra/`. The desktop helps you organize work and make decisions; Claude Code or Codex runs the installed skills to plan and implement it. You can use the skills while the app is closed. Your code and planning history stay in your local project.

## Set up the app

On first launch, choose **Light**, **Dark** or **System**, then choose **Codex** or **Claude Code**. Set the selected agent’s **AI model** and **AI effort** for internal prompts, or keep the default model and low effort. Save changed AI preferences, install the selected agent’s complete skill bundle, then select **Continue to Voidra** to enter the workspace. Your theme and agent choices save automatically, including if you close the app before finishing. Installation works offline. Edited skill copies require a replacement review; cancellation or failure leaves setup open so you can retry. Existing users who already acknowledged the older setup offer continue into their workspace.

You can change appearance, the default coding agent and installed skills later in **Settings**.

## Open or create a project

Open the project folder in the app. For an existing Git project, choose the worktree root rather than one of its subfolders. Linked worktrees are supported.

For an empty folder, choose **General software**, answer the profile questions, then select **Create planning folder**. Voidra creates the profile and a **Bootstrap** action. You can leave unresolved answers open. Bootstrap discovers the remaining questions and proposes a plan before any project setup. Git can remain absent during planning; after you approve the exact Bootstrap plan, Go initializes the local repository before implementation. Configure your Git name and email before running unassigned implementation work. New projects use release-aware Tasks automatically. If the folder has no usable package version yet, Bootstrap stays in Backlog; add a real package version, choose its source in Release settings, then move Bootstrap to Planning.

For a folder with code, follow the app’s `voidra-init` instructions in your coding agent, or enter the profile manually. Init reads the existing project, creates planning files, marks observed answers **inferred**, and adds instruction pointers. For an existing-code folder without Git, have your coding agent set up the local repository before implementation. Review inferred answers in the inbox. Inferred, assumed and open values are distinguishable from values you confirmed.

## Install the agent skills

First-launch setup shows the installer for your selected agent. Later, use **Settings → General**. **Install Claude Skill 0/6** and **Install Codex Skill 0/6** each install the complete bundled set for that client, offline. Each button shows the number of current bundled skills installed, such as **6/6** after installation. Edited or unmanaged copies open an exact bundle review before replacement. If a file changes during review, review the updated preview and confirm again. A stopped installation lists completed and remaining copies; selecting Install again checks the current files before retrying. Installation does not start an agent.

The public skills are:

| Skill | Purpose |
| --- | --- |
| `voidra-init` | Bring an existing codebase into Voidra. |
| `voidra-go` | Run queued planning, implementation, QA/security, Research and local Release work. |
| `voidra-plan` | Run queued planning without implementing or committing. |
| `voidra-release` | Collect completed work into a local Release action. |
| `voidra-sync` | Reconcile outside Git changes into planning suggestions. |

The general template also includes `voidra-architect-general`, which Go and Plan use for Discovery and plans. In Claude Code invoke a skill with `/voidra-go`; in Codex use `$voidra-go`. Read the installed skill if your agent does not expose a shortcut.

## Turn an idea into work

Open **Tasks** to work in Backlog, Planning, TODO, In progress, Review and Done. **Add task** (Cmd/Ctrl+N) captures work in Backlog. Move it to Planning to queue discovery, edge-case questions and needed subtasks. After answers and any required exact plan approval, TODO holds fully planned tasks without running them. Move a TODO card to In progress to queue implementation. Open a card to edit, inspect its full history or delete it; deletion preserves records and can be undone. **Back to Tasks** returns to the board.

Existing tasks retain their saved lifecycle and execution requests until you explicitly adopt this workflow by moving them to Planning. Newly captured tasks use it by default.

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

New ordinary work uses your coding agent. Existing human tasks and human blockers still have usable checklists. Dependencies block an action until the required work is complete. The board filters tasks by release, type, status and assignee; it does not override their lifecycle or approval gates. Drag a card by its grip or focus the grip and use Left/Right. Visible movement buttons provide another way to advance or replan work. Escape cancels a drag. Review and Done require owned results; a refused move offers the relevant task steps. Existing release assignments survive moves; a missing release is filled from the current package when leaving Backlog. Open **Release settings** to choose the package or enable release-aware movement. Closing it preserves unfinished setup values. The Release filter offers Current, previous versions, All releases and Unassigned Backlog; it never changes the run queue. Large work can be split into demonstrable child slices, each with its own planning loop.

Fresh action and Backlog capture opens in **Agentic**: describe one outcome in a Markdown input, review the selected-agent request and generated title/type/description, then save. **Normal** shows Title and Description with the relevant metadata. Title is optional; leaving it empty requests a reviewed AI title. A manual title is preserved. Switching modes retains each mode’s text and reviewed result; generated fields seed untouched Normal inputs for editing. Missing agent access or generation failure leaves the draft available for retry or manual completion. Assignee comes from Team; Backlog assignment and proposed type survive promotion.

## Resume unfinished forms

Leaving an unfinished form saves a private draft on this computer, including incomplete values. Reopening shows a row of badges above the fields. Select a badge to restore its whole form, or choose **New draft** to start fresh. Fresh task capture always starts Agentic; restored drafts keep their saved mode. **Discard current draft** is separate from closing. Saving successfully removes that submitted draft.

This applies to task edits, profile setup/answers, Team, questions/feedback, AI reviews, planning commits and release selection. Restoring keeps the original source revisions and never submits a decision or starts work. A changed source still requires the existing reload/review process. If local draft storage fails, the form stays open for correction or text recovery.

**Settings → General → Unfinished forms** recovers text even when the original task or question has been removed. Use **Copy Markdown** to recover the original text, or explicitly discard a draft. Unsubmitted model/effort settings also have private drafts; restoring them does not apply preferences. Drafts survive restart and cache rebuilds, and stay outside project Git history.

## Edit Markdown

Descriptions, long profile answers, free-text questions, feedback and AI review text render Markdown inside the input. Put the cursor on a line to reveal its source; selecting multiple lines reveals those lines. Headings, lists, tables, checklists and code remain readable around the text you edit. Copy and paste use Markdown source. Undo/Redo in the field change its text, independently of project history. Use Cmd/Ctrl+S in an edit dialog to activate its enabled Save button. Invalid text stays available for correction; saving still checks for outside file edits.

## Assign work with Team

Add members in **Settings → Team** using their Git name and email, then select **Me**. New members join the currently open project; choose each project’s members with its checkboxes. Fresh action forms preselect Me only when you belong to that project. Otherwise work stays unassigned. Removing a member leaves existing task assignments unchanged. The roster and membership choices stay private on this computer. **Manage Team** in an assignee field opens this tab directly.

## Run the queue

For workflow tasks, Planning, In progress and Review join the right **Actions** sequence. TODO is idle planned inventory. Drag the sequence grip, use Up/Down arrows or its buttons to order work independently of board filters. Dependency warnings offer **Rearrange**; ignoring the warning cannot run blocked work. Planning can clarify a parent while its subtasks remain incomplete; implementation waits for dependencies and children.

Use **Voidra Go** in Actions to copy the selected client's command and open that coding app in the project. Paste the command to start it. Moving a card never starts a hidden agent. **Execution options** contains queue controls, planning commits and recovery. Legacy tasks retain their existing queue/gate behavior. Each request is consumed once; retries are explicit. Answering the last question requeues Planning, approving a workflow plan parks it in TODO, and completing implementation queues Review.

Review runs QA and security as a separate read-only pass against current source and task context. Passing evidence moves the task to Done automatically; a failed check returns it to TODO with feedback, while missing requirements return it to Planning with another question round. Original answers, plans, reviews and runs remain available. Release actions retain their exact human acceptance and publication safeguards.

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

When you make code changes outside Voidra, a light-yellow notification appears above the workspace. Its **Sync** button copies the selected client’s command and opens that app. Paste it to run Sync to inspect the relevant Git history and propose planning updates. Confirmed answers are protected: a conflicting observation becomes a draft Profile change instead of replacing your answer. Repeating Sync at the same revision does not duplicate proposals.

Undo and redo cover app planning edits and survive restart. A record already consumed by a run cannot be undone across that consumption boundary. If outside edits changed bytes, review the overwrite confirmation rather than assuming history can restore them safely. Undo does not rewrite implementation Git history.

## Decisions, glossary and documents

The decisions view gathers answered questions, plan/review decisions and assumptions so you can search them. Revisit an assumption from its current source to create follow-up work; the original decision remains history.

Documentation has **Explore**, **Glossary** and **Decisions** tabs. Decisions and Glossary render complete Markdown, including tables, lists and code. Glossary search highlights matches without hiding parts of a definition.

Open **Documentation** to browse `docs/` and the root `GLOSSARY.md` as pages. Search documentation (Cmd/Ctrl+F) filters the directory by visible text and shows each file's match count. Select a result, then use Next/Previous match; document back/forward preserves your search. Matching is literal and case-insensitive, including text across bold or italic formatting. Filenames and hidden link destinations do not count. Added, changed and removed files refresh automatically. Toggle **Directory**, drag its divider or use arrow keys to resize it. A narrow workspace shows the directory over the article and closes it after you choose a file. Invalid or unsupported documents show a useful error while search stays available. These views are read-only. Use **Open in editor** to edit a source file. ADRs are reserved for decisions that are hard to reverse, surprising without context and involve a real tradeoff; smaller decisions stay with their action.

## Settings and optional AI

Settings has **General**, **Appearance** and **Team** tabs. General contains the **Default coding AI client** switch, optional AI, coding-agent skills, update checks and the app version. Choose Claude Code or Codex; setup, Actions, recovery and Sync show that client’s command. Existing runs keep their recorded client. Appearance contains the light, dark or system theme and **Custom titlebar**, enabled by default. Its styled window controls close, minimize and maximize/restore the window; the Settings icon is at the opposite end. Turn the switch off to use the operating system's titlebar. The preference is saved immediately and applies when you reopen the window; existing windows and unfinished edits stay open.

Navigation, Actions, main content and Waiting for you scroll independently. Toggle the three panes from the titlebar or View menu with Cmd/Ctrl+Alt+1/2/3. Drag their dividers or use arrow keys and Home/End on a focused divider; Enter hides its pane and Escape cancels a drag. Sizes and visibility restore per project. Undo/Redo stay in the titlebar, including the accessory in native-titlebar mode. New attention opens the bottom panel without taking typing focus; dismissing it remains respected until something new needs attention. Hiding first saves unfinished answers/feedback; a save failure leaves it open. The app supports keyboard operation; use Left/Right or Home/End to move between settings tabs, Space to change the switch, and Escape to close dialogs where appropriate.

AI suggestions are optional. Install and sign in to the Claude Code or Codex CLI, then choose that agent in Settings. Set its **AI model** (blank uses the agent default) and **AI effort**, then **Save AI preferences**. First-launch onboarding offers the same controls. Each agent remembers its own choices. **Test agent connection** sends a small test prompt using those saved choices. Review the displayed text, agent, model and effort before generating a suggestion. Suggestions fill editable drafts; they do not save, approve or run work automatically. Authentication stays with your CLI; Voidra needs no separate API key. Planning requests exclude source code, repository documents, private local files and unknown fields. Read [AI behavior and privacy](architecture/ai.md) for the exact contract.

The update notice checks the public GitHub release at startup and daily. You can disable it in Settings. Downloads open the release page; install updates yourself. The macOS build is unsigned: follow the [installation instructions](../README.md#install-on-macos) for the first open.

## If something stops

- A question or approval gate is expected: resolve it in **Waiting for you**, then queue the action again.
- A changed plan needs fresh exact-byte approval.
- A live owner must finish or exit before recovery can take over.
- A file conflict needs inspection; the app retains outside edits and shows the affected records.
- Invalid planning data should be repaired before starting more work. Use the matching installed `voidra check` CLI and inspect its diagnostic paths.
- A required account action belongs to the person who owns that account. The agent can prepare and verify the surrounding work.

[Format and CLI reference](format/Intro.md) · [Agent procedures](agents.md) · [Recorded verification](verification/Intro.md)
