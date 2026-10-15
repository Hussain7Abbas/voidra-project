# Voidra Project — Vision

> **Status:** approved on 2026-10-06. Updated on 2026-10-12 with the approved review corrections: approval invalidation and the planning skill's glossary permission (see [plan/main.md](plan/main.md)). Ideas adapted from [mattpocock/skills](https://github.com/mattpocock/skills) were added on 2026-10-11.
> This document fixes *what* Voidra is and how it behaves. Architecture comes after it is approved.
> **v1.1.0 direction (2026-10-15):** the user requested a Tasks-centered agentic coding workspace. [Section 17](#17-v110-product-direction) records those changes and supersedes the affected v1 UI descriptions below as the future target. The user authorized starting the [v1.1.0 plan](plan-v1.1.0/main.md); V11-P01–P06 are complete; V11-P05 adds pointer/keyboard Kanban and release filters; V11-P06 adds the global Actions sequence and safe standalone consumption under the user’s explicit authorization to complete all phases non-stop.

## 1. In one paragraph

Voidra Project (called "Voidra" in the rest of this document) is an open-source agentic coding framework with a desktop workspace for planning and tracking software projects built with AI coding agents. The v1.1.0 target centers on Tasks in a Kanban board, an Actions sidebar for the implementation sequence and a bottom Waiting for you panel for human decisions. Voidra writes planning records as Markdown into a `.voidra/` folder inside your repository. You run `/voidra-go` in Claude Code or `$voidra-go` in Codex; the agent follows each action's lifecycle, asks questions, commits its work and writes back results. The sections below retain the shipped v1 baseline; section 17 defines the requested changes.

## 2. Why

When a project's rules, decisions and definition of "done" live only in chat history, coding agents fill the gaps with guesses. This is the problem the 120x Architect/Builder method describes. Voidra keeps that knowledge in files that live with the code. It gives every change a lifecycle with human checkpoints, and turns finished work into a history you can track and release from.

## 3. Principles

1. **`.voidra/` is the only source of truth for planning and tracking.** It holds Markdown files with frontmatter that people and agents can read and that can be reviewed in git diffs. Anything Voidra keeps in SQLite can be rebuilt from these files. Knowledge that outlives Voidra stays in the repository's usual places (`docs/`, `docs/adr/` and `GLOSSARY.md`), which Voidra links to and indexes but never copies.
2. **Voidra never edits code; the agent does.** The app plans, tracks and shows, and writes only inside `.voidra/`. Claude Code and Codex implement, through skills. Changes to the glossary and docs also go through actions.
3. **The agent works without the app.** Skills only read and write files, so `/voidra-go` works even when Voidra is closed.
4. **You decide at three gates:** answering questions, approving a plan and accepting the result.
5. **Facts and guesses look different.** Every profile answer and assumption shows whether you confirmed it, the agent inferred it from code, or the agent decided it for you.
6. **Safe for teams.** One file per record, random IDs and a personal run queue keep merge conflicts rare and small.
7. **AI inside the app is optional.** Without an OpenRouter key, every feature still works by hand.

## 4. How it maps to the 120x method

| 120x | Voidra |
| --- | --- |
| Project Launcher and intake | New-project flow, templates and the project profile |
| Architect | Voidra app, plus the template's architecture skill, which the agent runs during Discovery and Plan |
| Builder | Claude Code or Codex running `/voidra-go` |
| Project scaffold | `.voidra/` |
| Architect Pack | An action with its plan files |
| Discovery Gate | The question loop |
| Builder understanding check | The Plan stage and your approval |
| Builder report | The run result that is written after each run |

## 5. Main concepts

| Concept | What it is | Stored in |
| --- | --- | --- |
| Project profile | The project's main building blocks, such as problem, users, features and modules, tech stack, design system, integrations, data, deployment and constraints. The template defines the exact blocks. You can edit it at any time. | `profile/` |
| Answer status | Each profile answer is **confirmed** (by you), **inferred** (read from code by `voidra-init`), **assumed** (decided by the agent) or **open** (unanswered). | frontmatter |
| Idea | A backlog item with a status: **new**, **needs info**, **ready**, **promoted** or **rejected**. Nothing runs until you promote it into an action. Rejected ideas keep their reason, so the agent can recognise the same idea when it comes back. | `backlog/` |
| Action | A unit of work with a type, a lifecycle and who does it: the agent or you. An action can be blocked by other actions and split into smaller child actions. | `actions/<id>/` |
| Question | Something the agent needs from you before it can continue an action. | `actions/<id>/questions.md` |
| Plan | Requirements (including what is out of scope), blueprint (including the testing seams) and acceptance criteria for an action. | `actions/<id>/` |
| Run result | What one `/voidra-go` run did to one action: a summary, the files changed, the checks run, the commit and any remaining issues. | `actions/<id>/runs/` |
| Decision | Small decisions stay in the action where they were made: its answered questions and approved plan. A project-wide decision becomes an **ADR** (architecture decision record) only if it is hard to reverse, surprising without context and a real trade-off. | `actions/<id>/`, and `docs/adr/` in the repository |
| Assumption | An answer you left to the agent with **Let the agent decide**, or a profile answer marked **assumed**. Voidra lists them all in one place so you can revisit them. | where the answer is |
| Glossary | The project's agreed terms with short definitions. Agents use these words in questions, plans and code. | `GLOSSARY.md` in the repository |
| Release | A version made of done actions, with a changelog and release notes. | `releases/` |

## 6. Two ways in

**New project** (the folder has no code and no `.voidra/`)

1. Open the folder in Voidra and pick a template.
2. Fill in the project profile. If you have an OpenRouter key, Voidra can suggest answers and follow-up questions.
3. Voidra creates `.voidra/` and a first **Bootstrap** action.
4. Run `/voidra-go`. The architecture skill asks its questions, writes the plan and, after you approve it, sets up the project.

**Existing project** (the folder has code but no `.voidra/`)

1. Voidra detects the code and asks you to run `/voidra-init` in your agent. You can also fill in the profile by hand.
2. `voidra-init` reads the codebase, creates `.voidra/`, fills in the profile with every answer marked **inferred**, drafts `GLOSSARY.md` from the terms the code uses (if there isn't one), and adds a short pointer to the project's `AGENTS.md` and `CLAUDE.md` so every agent session respects Voidra's decisions.
3. Voidra shows "Confirm N inferred answers" in your inbox.

## 7. Action types and lifecycles

There are six stages: **Discovery**, **Plan**, **Implement**, **Verify**, **Review** and **Done**. Two end states sit beside them: **Released** (shipped in a release) and **Cancelled**.

| Type | Stages | Your gates | What the agent focuses on |
| --- | --- | --- | --- |
| Feature | Discovery → Plan → Implement → Verify → Review | answers, plan, review | First checks that the feature isn't already built or previously rejected. Asks questions until scope is clear, then writes requirements, a blueprint and acceptance criteria. |
| Bug | Discovery → Plan → Implement → Verify → Review | answers, plan, review | Follows a diagnosis loop: reproduce, shrink the case, form a hypothesis, add instrumentation if needed, then state the root cause. A regression test is required. |
| Improvement / refactor | Plan → Implement → Verify → Review | answers, plan, review | Proves that behaviour is unchanged. Wide refactors use expand–contract: add the new form, move callers over in batches, then delete the old form. |
| Docs / chore | Implement → Review | answers, review | Keeps the change small. |
| Profile change | Discovery → Plan → Implement → Verify → Review | answers, plan, review | Created when you edit the profile. Analyses the impact on code, documents and open actions. |
| Research | Discovery → Review | answers, review | Writes findings and a recommendation, and proposes ideas or actions. It writes no code. |
| Release | Plan → Review → Released | answers, review | Proposes a version, changelog and notes from done actions. After you accept, it commits the version bump and creates a git tag. |

Rules:

- Questions can come up at any stage. The action waits until you answer, then the next `/voidra-go` continues. This repeats until no questions remain.
- Rejecting a plan sends the action back to Plan with your feedback. Rejecting at Review returns implementation types to Implement, Research to Discovery, and Release to Plan. Template overrides must name a valid rework stage.
- Plan approval applies to the exact contents of `requirements.md`, `blueprint.md` and `acceptance.md`. Any content change to any of them, including formatting, invalidates it and requires approval again before implementation or further rework continues. The app and skills both enforce this rule.
- Accepting a Research or implementation result finishes the action. Accepting a Release review authorizes the next agent run to commit the version bump and create the tag; it becomes Released only after those steps succeed. The app creates no tag or version-bump commit.
- If Verify fails, the agent tries to fix the problem in the same run. If it can't, the action stops with a failed result that explains why.
- Templates can change these lifecycles for each type.

### What happens inside the stages

- **Discovery.** Questions come in rounds. Each round asks every question whose prerequisites are already answered, and never one that depends on an open answer. Terms that get settled are added to `GLOSSARY.md`.
- **Plan.** The plan names the **testing seams** (the public boundaries where tests check behaviour) and lists what is **out of scope**. It proposes ADRs for any decisions that meet the bar. You approve all of this at the plan gate.
- **Implement.** Test-first at the agreed seams: one failing test, then the code that passes it, then the next. Mocks are used only for things outside the project, such as external services, time and randomness.
- **Verify.** Runs the project's checks, then reviews the change twice: against the project's standards (its `AGENTS.md` rules) and against the action's plan. Problems are fixed before the commit.

### Big work is split into slices

- If an action won't fit in one agent session, the agent doesn't implement it. It splits it into child actions, each one a **slice**: a thin path through every layer (data, logic, interface, tests) that can be demoed on its own.
- Slices are linked with **blocked by**. Voidra shows blocked actions but only lets you queue unblocked ones.
- Each slice gets its own commit. The parent action is done when all of its slices are done.

### Actions done by you

- Some steps only a person can do, such as creating a developer account or a signing certificate. These actions are marked **done by you**.
- The agent can create them when it reaches such a step. It writes step-by-step instructions and blocks its own actions on them.
- You tick them off in the app. They have no agent stages.

## 8. The run loop

1. In Voidra, pick the actions to run. Yours and unassigned ones are shown first. Only unblocked actions done by the agent can be queued.
2. Voidra writes them to `.voidra/local/pending-actions.md`. This is your personal queue and is never committed. Voidra also shows the command to run, with a copy button: `/voidra-go` in Claude Code or `$voidra-go` in Codex.
3. `/voidra-go` takes a run lock and moves each queued action forward as far as it can, stopping at the next gate.
4. For each action it writes a run result and leaves either questions, a plan to approve or work to review.
5. Voidra watches the folder and updates live. Anything that needs you appears in **Waiting for you**.
6. You answer, approve or review, queue the actions again and run `/voidra-go` again, until each action is Done.

### Questions

Each question has:

- the question and why it matters;
- suggested options, one of them marked as recommended;
- a free-text answer;
- **Let the agent decide**.

Questions arrive in rounds, as described in section 7. If you choose **Let the agent decide**, the agent's choice is recorded as an assumption, linked to the question. You can change it later, and changing it creates a new action.

### Commits

- The agent makes **one commit per action** once implementation passes verification. The commit contains the code and that action's `.voidra/` files, and carries a `Voidra-Action: <id>` trailer. Rework after a rejected review adds a follow-up commit with the same trailer.
- Commit messages follow the project's existing style.
- Planning changes made before implementation (new ideas, profile edits, answers and plans) are shared with a **Commit planning changes** button. It commits only `.voidra/` and never `.voidra/local/`. This is the only git write the app makes.
- Nothing is ever pushed automatically.

### Teams

- Teammates can run `/voidra-go` at the same time on their own machines.
- Actions have an optional assignee. When someone starts an unassigned action, it is assigned to them, using their git identity.
- IDs are random, for example `act-7k3m9q`, so two people creating records never collide.
- On a single machine, a lock file stops two runs from working in the same checkout at once.
- Voidra has no server. Teammates see your progress after you push and they pull.

## 9. Undo

Undo (⌘Z) and redo (⇧⌘Z) cover every edit you make in the app **before an agent acts on it**: creating, editing, promoting or deleting ideas and actions, profile edits, answers and changes to the run queue. The history is kept per project on your machine and survives restarts.

- Once an agent has started on an item, undo is blocked for that item and Voidra explains why. The agent records which items it consumes before doing the work; blocking applies during a run and after interruption, even when no completed run result exists and the stage hasn't changed. To reverse finished work, create a new action, for example "Revert act-7k3m9q". Because each action is a single tagged commit, the agent can find exactly what to revert.
- If a file has changed on disk since your edit, because of an agent run or a teammate's changes you pulled, undo asks before overwriting it.

## 10. Skills and templates

The skills are developed in Voidra Project's own repository and bundled in the app. Voidra installs and updates them in Claude Code and Codex, and each release copies them to the `voidra-skills` repository for people who install skills through skills.sh.

| Skill | What it does |
| --- | --- |
| `voidra-init` | Creates `.voidra/` for an existing codebase, with inferred profile answers, a draft `GLOSSARY.md` and the `AGENTS.md`/`CLAUDE.md` pointer. |
| `voidra-go` | Runs the queued actions through their lifecycles until each one reaches a gate. It writes questions, plans, results and commits. |
| `voidra-plan` | Runs only the planning stages for queued actions. It may write `.voidra/` and add settled terms to the repository-root `GLOSSARY.md` during Discovery. It never changes source code or other repository files, commits, or tags. |
| `voidra-sync` | Finds changes made outside Voidra, such as commits without a `Voidra-Action` trailer, updates the profile, and proposes ideas or actions. |
| `voidra-release` | Starts a release from the terminal by collecting done, unreleased actions into a release action. |

A **template** is a set of profile questions plus an **architecture skill** that uses the answers during Discovery and Plan. A template can also override lifecycles. Templates are developed, bundled and copied to `voidra-skills` the same way as the skills, and are versioned. v1 ships with one general software template.

The skills adapt proven techniques from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT): question rounds, testing seams, slices, the ADR bar, test-first at seams, the two-part review, the bug-diagnosis loop and idea triage. Voidra writes its own skills rather than depending on those, because the app must be able to read everything the skills write, in `.voidra/`'s format. Any text copied from them keeps their MIT notice.

Every `.voidra/` folder records its format version and its template version, so newer apps and skills can migrate older projects instead of breaking them.

Each product release aligns the app, `voidra` library/reader and bundled skills to one `X.Y.Z` version; skill validation commands use that matching library. Format and template versions remain independent. The 0.x previews use GitHub prereleases and npm's `next` tag; v1 uses 1.0.0 and `latest`. GitHub, npm and skill publication have separate recovery checkpoints, so a partial publication preserves completed destinations and retries the original source. The failed v0.2.0 and v0.2.1 candidate tags are preserved; the corrected P15 pipeline preview uses 0.2.2, with v1 still 1.0.0 (D28).

Repository CI runs when a release tag with a `v` prefix and three numeric components is pushed, such as `v1.2.3`. Ordinary branch pushes and pull requests do not start hosted CI; source changes are checked locally. Release publication retains its separate checks and recovery workflow.

Xeploy calculates patch/minor/major release bumps, with a read-only preview before the existing checked release pipeline. New local package commands and global JavaScript tools use Bun; the established pinned pnpm workspace and registry publication checkpoints remain in place (D31).

## 11. AI inside the app

Voidra uses OpenRouter with your own API key. The key is encrypted with the macOS Keychain, and you choose the model in Settings. The model is used to:

- turn rough notes into clear ideas or actions;
- suggest profile answers;
- generate follow-up profile questions;
- summarise run results;
- draft release notes.

Voidra sends only the text a feature needs: your notes, the profile and action text. It never sends source code. Without a key these features are hidden.

## 12. The app in v1

- **Project switcher.** One project per window, with a dropdown to switch projects or open recent ones, like Obsidian's vault switcher.
- **Onboarding.** Pick a template for a new project, or get the `voidra-init` instructions for an existing one.
- **Profile.** The building blocks, each answer showing its status.
- **Backlog.** Ideas with their status, a button to promote them into actions, and rejected ideas with their reasons.
- **Actions board.** Actions grouped by stage, with filters for type, assignee, status and who does it. Slices are grouped under their parent, and blocked actions are marked.
- **Action page.** Description, stage timeline, questions, plan files, run results and linked commits.
- **Waiting for you.** Questions, plans to approve, work to review, actions done by you and inferred answers to confirm.
- **Run.** Pick and order unblocked actions, copy the command, and see whether an agent is running now.
- **Releases.** Past releases and the button to start a new one.
- **Decisions and assumptions.** One searchable index of answered questions, approved plans, ADRs and assumptions, each linked to where it lives.
- **Glossary.** A read-only view of `GLOSSARY.md`. Terms change through actions.
- **Settings.** General contains the OpenRouter key and model, skill installation and update settings, and the app version. Appearance contains the theme and a custom titlebar switch, on by default. The custom titlebar has styled close, minimize and maximize/restore controls, with a Settings icon at the opposite end. Titlebar changes apply to newly opened windows.
- **Window layout.** The main area and sidebar scroll independently, with scrollbars when their contents overflow; the titlebar and workspace toolbar stay in view.

## 13. `.voidra/` layout (draft)

```text
.voidra/
├── voidra.json            # format version, project ID, template and template version
├── README.md              # how to read this folder; AGENTS.md points here
├── .gitignore             # ignores local/
├── profile/               # one file per building block
├── backlog/               # one file per idea
├── actions/
│   └── act-7k3m9q/
│       ├── action.md      # type, title, stage, status, done by, assignee, parent, blocked by, links, commits
│       ├── questions.md
│       ├── requirements.md, blueprint.md, acceptance.md
│       └── runs/          # one result file per run
├── releases/              # one file per release
├── syncs/                 # one record per sync of outside work
└── local/                 # personal, never committed
    ├── pending-actions.md # your run queue
    └── run.lock
```

The SQLite index, undo history, recent projects and settings live in Voidra's app data folder on your machine, never inside the repository.

Long-lived knowledge stays in the repository's usual places, where people and tools already look:

```text
GLOSSARY.md      # agreed terms
docs/            # architecture, data model, API, permissions
docs/adr/        # decisions that meet the ADR bar
```

`.voidra/` links to these and doesn't copy them. The profile's tech blocks and the action plans point to the relevant pages, and actions that change the architecture update them. If the repository already names its ADRs in some way, that naming is kept. Otherwise ADR files are named by date and title rather than a running number, so two teammates never pick the same name.

## 14. Scope

**v1, the core:** everything in sections 5–13, all five skills, one template, and macOS.

**v2, architecture documents only for now:**

- starting Claude Code or Codex from the app (`claude -p`, `codex exec`) and showing live progress;
- parallel runs on one machine using git worktrees;
- more templates and sharing templates with the community;
- roadmap, milestone and sprint views;
- progress and git-activity dashboards;
- `voidra-report`, for status reports over a period of time;
- assisted reverting of finished actions;
- Windows and Linux;
- an overview across all your projects;
- syncing with issue trackers such as GitHub Issues or Linear;
- maps for large, unclear work (a destination, decisions so far, open unknowns and out-of-scope items), for example to run Bootstrap;
- a Prototype action type, for throwaway prototypes that answer design questions;
- retros after runs that suggest improvements to `AGENTS.md` and the skills;
- regular architecture check-ups that feed ideas into the backlog;
- letting mattpocock/skills use `.voidra/` as their issue tracker, for people who already use them.

## 15. Technology

| Area | Choice |
| --- | --- |
| Shell | Electron, macOS first, Apple Silicon only |
| UI | Next.js as a static export loaded by Electron, talking to the main process through a preload IPC bridge. There is no Next server, so no port, a faster start and a smaller attack surface. |
| Language | TypeScript, React |
| Styling | Tailwind CSS with the storylens dashboard's **Ink & Iris** system: light, dark and system themes, Inter, Lucide icons, radii, spacing and focus rings. Screens are designed as they are built, using the `ui-ux-pro-max` skill. English only in v1. |
| Local data | SQLite (`better-sqlite3`) for the rebuildable index and undo history |
| Secrets | OpenRouter key encrypted with Electron `safeStorage` (macOS Keychain) |
| Package manager | pnpm |
| Lint and format | Biome |
| Tests | Vitest for unit and integration tests, Playwright for Electron end-to-end tests. A scripted fake agent drives the end-to-end tests; there are no automated tests with real agents. |
| Format package | The npm package `voidra`: the format rules, the validator and the `voidra check` command that the skills run on everything they write. |
| Distribution | An unsigned Apple Silicon DMG on GitHub Releases (no Apple Developer account). The app tells you when a newer version exists, and you download it yourself. |
| Runtime | Node only, the runtime Electron ships. Bun is not used, because native modules such as `better-sqlite3` must match Electron's Node, and tests should run on the same runtime as the app. |
| Identity | Product name **Voidra Project**, app ID `dev.voidra.project`, npm package name `voidra-project`. The package name must not be `voidra`: Electron names its development data folder after it, and `~/Library/Application Support/voidra` still holds old Voidra Agentic OS data. |
| License | **AGPL-3.0-or-later** (full text in [`LICENSE`](LICENSE)). Anyone may use, change and sell Voidra, but anyone who distributes a modified version, or lets people use one over a network, must publish its full source under the same license. |

## 16. Risks to design around

- **Agents don't always follow file formats.** Voidra must validate every file it reads and show clear errors, and the skills must check their own output.
- **Claude Code and Codex differ.** Commands are called differently (`/voidra-go` vs `$voidra-go`), and skill folders and behaviour differ too. There are no automated tests with real agents, so the implementing agent tries the skills headlessly in both agents while building them and before each release, with low-cost models (Haiku in Claude Code, Luna in Codex) at low effort. The validator checks everything they write.
- **Merge conflicts in `.voidra/`.** These are kept small by using one file per record, but the app must show conflicted files clearly.
- **Large-project startup.** P17 accepts the measured v1 1000-action cold-open gap under delegated decision D24: the final quiet sample averages 2.183 seconds against P09’s proposed 2-second target; the first run reached 3.689 seconds. Filtering averages about 83 ms and details about 111 ms. Keep the 2-second improvement target and open-time variance follow-up; do not describe the startup budget as met. See [P17 evidence](docs/verification/p17.md) and D29 in the plan.
- **Too much process for small changes.** Question rounds, seams and a two-part review cost time. Docs and chore actions stay light, and templates can trim lifecycles, but the default must not make a one-line fix feel heavy.
- **Stale data after work done outside Voidra.** `voidra-sync` exists for this. The app should suggest running it when it finds commits without a `Voidra-Action` trailer.
- **License reach.** AGPL-3.0 is OSI open source, but some companies ban AGPL code. For teams that just use Voidra as a tool this rarely matters: the obligations only apply to people who distribute or host a modified version.

## 17. v1.1.0 product direction

The user requested the following on 2026-10-15. These requirements change the product target; they are not claims about the shipped v1 implementation. Delivery is tracked in [plan-v1.1.0/main.md](plan-v1.1.0/main.md), including proposed technical rules and unresolved details. Existing filesystem truth, standalone execution, exact plan/review gates, safe writes and recovery remain mandatory.

- **Tasks is the main work surface.** Replace the separate Backlog and Actions pages with a Kanban board of draggable task cards. The user confirmed one task per executable action, with linked child tasks for larger work. Columns are **Backlog → TODO → In progress → Review → Done**; detailed agent stages appear within cards/details. The right **Actions** sidebar lists the intended implementation sequence; moving a task to **TODO** adds it by default. Sequence entries can be dragged. Dependency-order problems show a nonmodal warning with **Rearrange**; the user may leave the warning/order alone. This does not authorize blocked execution or bypass human gates.
- **Markdown is the default prose experience.** The requested “WAYSWING” behavior renders Markdown in the input, reveals the cursor's single line as editable Markdown source, and reveals all selected lines for multiline selections. Use shared safe rendering throughout descriptions, questions and knowledge views, including Decisions cards and Glossary. Existing read-only sources and approved records retain their permissions.
- **Capture supports Normal and Agentic input.** Create-action/feature and create-backlog forms, including their replacements in Tasks, have an **Agentic / Normal** segmented switch. Every fresh form starts in Agentic regardless of the last-used mode; restored drafts keep their own saved mode. Normal shows Title and Markdown Description. Title is optional input; a null/blank title is generated using OpenRouter. Agentic shows one Markdown content input and generates hidden fields including Title and Action Type. The user confirmed **generate a draft → review → explicitly Save** before creating a ticket. Preserve the draft on failure; users can still complete work manually without an AI key by supplying a title/type.
- **Every unfinished form is recoverable.** Exiting any data-entry form saves its values as a private local draft by default, surviving app restarts and project reopening. Reopening shows one badge per unfinished draft, labeled by title or short excerpt, in a navigation bar at the top. Selecting a badge restores that whole form. This applies throughout the app, including creation/editing, setup/profile, Team/settings entry, questions/feedback and release preparation. Drafts are not shared through the repository; persisting a draft does not submit it or approve work. [The cross-cutting draft contract](plan-v1.1.0/form-drafts.md) records lifecycle, recovery and coverage.
- **Team and client preferences simplify forms.** Assignee is a dropdown backed by a new Settings **Team** tab. The user confirmed one local roster, with each project selecting its members; **Me** remains personal and preselects forms where eligible. Remove **Who does the work** from forms; existing human blockers/checklists remain supported. A **Claude Code / Codex** segmented preference selects the default coding AI client; operational command choices show that client only. General's skill-installation choices are exactly **Install Claude skills** and **Install Codex skills**, each covering the whole bundled set without per-skill selection.
- **Panels support the working loop.** Left navigation and right Actions toggle independently. **Waiting for you** moves into a toggleable bottom panel that opens when an answer is needed and renders Markdown questions. Every sidebar and bottom panel resizes, including the Documentation directory panel. Undo/Redo move into the titlebar. Remove the workspace topbar and **Local project** text while retaining accessible project/settings/recovery controls and native shortcuts.
- **Tickets carry a project release.** Creation defaults to the current version from root `package.json`, with a per-project alternate package selection. Backlog may explicitly have no release; other board statuses require one. The user confirmed preserving an existing release during drag/drop and supplying the current version only when leaving Backlog with a missing required release. If no usable version exists, retain Backlog capture and hold moves requiring a release until resolved. Tasks offers a dropdown for the current and previous releases. Never substitute Voidra's app version for an unrelated project's release.
- **Releasing is guided and explicit.** Use the installed Xeploy package for version planning, displaying its applicable questions as UI choices. Before release, ask whether the affected current Done tickets retain **X.Y.Z (current release)** or move to **A.B.C (new release)**. Bind that choice to the exact proposal and preserve the existing reviewed standalone commit/tag and checked publication/recovery boundaries. Ticket target versions and immutable historical release membership are distinct.
- **Documentation is a page.** Show a directory view beside the rendered page, with its own global search across supported project documentation. Search filters directory files and shows match counts. Opening a result highlights the searched text in the document. Keep source containment and safe link handling; do not expose arbitrary/private files.

The user selected option b on 2026-10-15: ignore the incomplete sentence “always when writing in the form make sure to ~”. It adds no requirement (R17/U01 resolved). The user requested implementation questions and answered the first six with **1a, 2a, 3a, 4a, 5c, 6a**, followed by the all-forms draft requirement R18 and **7a, 8a, 9b**. The [clarification register](plan-v1.1.0/main.md#confirmed-clarification-answers--2026-10-15) records C01–C09; both rounds and U01–U10 are resolved. Creating this plan does not authorize implementing every phase or publishing v1.1.0. The original v1 delegated approvals do not extend to this release.

The user subsequently authorized **“complete all phases non-stop”** on 2026-10-15. Continue the release tracker through P10 without another phase go-ahead, preserving explicit account/product gates and actual verification requirements.
