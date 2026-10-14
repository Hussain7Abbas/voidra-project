# Using Voidra Project

[Documentation](intro.md) · [Installation](../README.md#install-on-macos) · [Glossary](../GLOSSARY.md)

This guide describes the 1.0.0 candidate; [P17 evidence](verification/p17.md) records checks still pending before publication.

Voidra keeps your project’s plans in readable files under `.voidra/`. The desktop helps you organize work and make decisions; Claude Code or Codex runs the installed skills to plan and implement it. You can use the skills while the app is closed. Your code and planning history stay in your local project.

## Open or create a project

Open the project folder in the app. For an existing Git project, choose the worktree root rather than one of its subfolders. Linked worktrees are supported.

For an empty folder, choose **General software**, answer the profile questions, then select **Create planning folder**. Voidra creates the profile and a **Bootstrap** action. You can leave unresolved answers open. Bootstrap discovers the remaining questions and proposes a plan before any project setup. Git can remain absent during planning; after you approve the exact Bootstrap plan, Go initializes the local repository before implementation. Configure your Git name and email before running unassigned implementation work.

For a folder with code, follow the app’s `voidra-init` instructions in your coding agent, or enter the profile manually. Init reads the existing project, creates planning files, marks observed answers **inferred**, and adds instruction pointers. For an existing-code folder without Git, have your coding agent set up the local repository before implementation. Review inferred answers in the inbox. Inferred, assumed and open values are distinguishable from values you confirmed.

## Install the agent skills

Use the first-run offer or **Settings** to install the bundled skills for Claude Code, Codex or both. Installation works offline. The app shows existing versions and protects edited or unmanaged copies; review its replacement preview before confirming. Installation does not start an agent.

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

Save rough ideas in **Backlog**. Clarify them, mark them ready, or reject them with a reason. Promote an idea when it is ready for action. You can also create an action directly.

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

Assign work to an agent or make it human work with a checklist. Dependencies block an action until the required work is complete. The board lets you filter and group actions; it does not override their lifecycle or approval gates. Large work can be split into demonstrable child slices, each with its own planning loop.

## Run the queue

Add eligible actions to the **Run** queue and arrange their order. The queue is personal, while actions and results are shared planning records. Start your chosen coding agent in the project and invoke Go or Plan. The agent processes the queue, records ownership and consumed inputs before work, and stops each action when it needs a decision.

Go can implement approved work. Plan preserves source files, instructions, Git presence, commits and tags; it may write planning records and settled glossary additions through its helper. Plan stops before implementation even when an action already has an approved plan.

Only one owned run can write the project at a time. A stale heartbeat is a warning, not permission to remove a lock. If a process exits unexpectedly, use the app’s displayed recovery command in your agent. Recovery checks the owner and existing bytes before finishing an interrupted operation. Keep outside edits when a conflict is reported.

## Answer questions and approve plans

Open **Waiting for you** to answer question rounds, confirm inferred profile values and review plans/results. Each question explains why it matters, offers choices and permits free text. **Let the agent decide** records a delegated assumption with the agent’s reason; it does not turn that value into a confirmed answer.

A plan has requirements, a blueprint and acceptance criteria. Read its exclusions, testing seams and any proposed ADRs, then approve or request changes. Approval binds the exact contents of all three files. Editing any of them invalidates the old approval, even if the edit only changes formatting. Go stops and asks for fresh approval before continuing implementation or rework.

## Review results

The agent records the files changed, actual checks, review notes and commit identifiers. Implementation normally stops at **Review**. Accept it to finish the action, or reject it with feedback to request rework. Research acceptance finishes the findings; Research writes no implementation commit. Human actions finish through their checklist.

A Release follows a different final step: accepting its proposal authorizes the agent to change the approved version/changelog files and create the local commit and tag. Acceptance itself does not create a tag. The action becomes **Released** after the agent completes and records those effects. Voidra’s local Release workflow does not publish your project to hosting or registries.

## Outside changes, history and undo

Git history links action commits using their recorded trailers. **Commit planning changes** shows a preview of selected shared planning files before creating a separate planning commit. It excludes private local state and preserves unrelated staging. No commit operation automatically pushes your project.

When you make code changes outside Voidra, run Sync to inspect the relevant Git history and propose planning updates. Confirmed answers are protected: a conflicting observation becomes a draft Profile change instead of replacing your answer. Repeating Sync at the same revision does not duplicate proposals.

Undo and redo cover app planning edits and survive restart. A record already consumed by a run cannot be undone across that consumption boundary. If outside edits changed bytes, review the overwrite confirmation rather than assuming history can restore them safely. Undo does not rewrite implementation Git history.

## Decisions, glossary and documents

The decisions view gathers answered questions, plan/review decisions and assumptions so you can search them. Revisit an assumption from its current source to create follow-up work; the original decision remains history.

Read the root glossary and repository Markdown documents in the app’s read-only viewer. Edit those files with your editor. ADRs are reserved for decisions that are hard to reverse, surprising without context and involve a real tradeoff; smaller decisions stay with their action.

## Settings and optional AI

Choose light, dark or system appearance in **Settings**. The app supports keyboard operation; dialogs expose labeled controls and close with Escape where appropriate.

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
