# Voidra Project

Voidra Project is an open-source desktop app for planning and tracking software projects built with AI coding agents. [VISION.md](VISION.md) defines what it is. [plan/main.md](plan/main.md) is the implementation plan and tracks progress. Phase P00 extends this file with the project's structure, rules and commands; keep the two sections below when it does.

## Working with the user

- Put decision questions directly in the chat, with lettered options (`a`, `b`, `c`, …), brief tradeoffs and a recommendation where useful. Do not rely on selectable question cards: the user cannot see them.
- Label each question **Choose one** or **Choose any that apply**. Always allow a free-text answer.
- Record accepted product decisions in the plan and vision together. Routine implementation details may be resolved within the scope the user authorized; do not present those details as separate user answers.

## Documentation maintenance

The current project contains the vision, license, instruction files and `plan/`; application code, tooling and `docs/` arrive in P00 and later phases. Keep the [plan rules](plan/AGENTS.md), phase index and affected phase documents synchronized with user-requested changes. Before finishing a task, update any affected instructions and documentation in the same task, preserve unrelated user edits, and repair links. Once `docs/` exists, include its affected pages and indexes in this review. Keep every `CLAUDE.md` containing only `@AGENTS.md` with a trailing newline. Do not create empty documentation or application placeholders ahead of their phase.

## Running plan phases

When the user asks to run the next phase, to continue, or to run a specific phase (for example "run P03"):

1. **Pick the phase.** "Next" means the phase marked **In progress** in `plan/main.md`; otherwise the first **Not started** phase whose needs are all **Done**. If no phase can start, say why and stop.
2. **Read** this file, `VISION.md`, `plan/main.md`, `plan/AGENTS.md`, the phase file, and the evidence files (`docs/verification/`) of the phases it needs.
3. **Check your understanding.** Reply with the stories you will implement, the files you expect to create or change, the testing seams you will test at, any risks or contradictions, and your questions. Then stop and wait for the user's go-ahead.
4. **Implement.** Set the phase to **In progress** in `plan/main.md`. Work story by story, writing tests at the agreed seams first. Once P00 has created the Makefile, run `make check` after each story.
5. **Do every step yourself.** That includes all GitHub work with the `gh` CLI and the real-agent checks described below. Ask the user only for decisions, for the approvals the phase names, and for anything that needs their accounts. Never ask the user to copy or paste anything.
6. **Finish.** When every exit criterion is met:
   - write `docs/verification/pXX.md`;
   - update the docs and `AGENTS.md` files that changed;
   - set the phase to **Done** with the date in `plan/main.md`;
   - commit and push.
7. **Report** what was done, anything unverified and why, and which phase is next.

## Real-agent checks

When a story asks for a skill to be tried with real agents, run the check yourself, headlessly and locally (never in CI):

1. Copy a fixture project into a temporary folder and make it a git repository.
2. Make this repository's skills available to both agents (`make skills-link`, from P03 on).
3. Run the skill with `claude -p` using Haiku and with `codex exec` using Luna, both at low reasoning effort (decision D17 in `plan/main.md`). Check each CLI's `--help` for its model, effort and permission options. Limit the agent's write access to the temporary folder.
4. Run `voidra check` on the result and inspect what the agent wrote and committed.
5. If a step fails, rerun it with that agent's default model. A failure with both models is a skill problem: fix it. A failure only with the small model is a model limit: record it.
6. Record the commands, model IDs, effort settings and results in the phase's evidence file.

Use the real-agent coverage matrix in [plan/main.md](plan/main.md#real-agent-coverage-matrix) to select scenarios. Snapshot files and git history before each run, then check allowed write paths, gate stops and commit trailers as well as file validity. A fake-agent run or a valid golden example never substitutes for these checks.
