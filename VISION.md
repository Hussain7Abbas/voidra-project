# Voidra Project — Vision

> **Status:** approved on 2026-10-06. Updated on 2026-10-12 with the approved review corrections: approval invalidation and the planning skill's glossary permission (see [plan/main.md](plan/main.md)). Ideas adapted from [mattpocock/skills](https://github.com/mattpocock/skills) were added on 2026-10-11.
> This document fixes *what* Voidra is and how it behaves. Architecture comes after it is approved.

## 1. In one paragraph

Voidra Project (called "Voidra" in the rest of this document) is an open-source desktop app for planning and tracking software projects that are built with AI coding agents. You describe the project, collect ideas and create actions in Voidra. Voidra writes everything as Markdown into a `.voidra/` folder inside your repository. You then run `/voidra-go` in Claude Code or Codex. The agent moves each action through a software lifecycle, asks you questions when it needs answers, commits its work and writes the results back. Voidra shows what is waiting for you, what is done and what has shipped.

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

Each product release aligns the app, `voidra` library/reader and bundled skills to one `X.Y.Z` version; skill validation commands use that matching library. Format and template versions remain independent. The 0.x previews use GitHub prereleases and npm's `next` tag; v1 uses 1.0.0 and `latest`. GitHub, npm and skill publication have separate recovery checkpoints, so a partial publication preserves completed destinations and retries the original source. The failed v0.2.0 candidate tag is preserved; its corrected P15 pipeline preview uses 0.2.1, with v1 still 1.0.0 (D27).

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
- **Settings.** OpenRouter key and model, the install and update status of skills for each agent, and the app version.

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
- **Too much process for small changes.** Question rounds, seams and a two-part review cost time. Docs and chore actions stay light, and templates can trim lifecycles, but the default must not make a one-line fix feel heavy.
- **Stale data after work done outside Voidra.** `voidra-sync` exists for this. The app should suggest running it when it finds commits without a `Voidra-Action` trailer.
- **License reach.** AGPL-3.0 is OSI open source, but some companies ban AGPL code. For teams that just use Voidra as a tool this rarely matters: the obligations only apply to people who distribute or host a modified version.
