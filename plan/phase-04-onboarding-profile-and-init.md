# P04 — Onboarding, profile and `voidra-init`

> **Milestone:** M2 · **Needs:** P03 · **Status:** see [main.md](main.md)

## Outcome

Both ways in from VISION.md section 6 work:

- A new project gets its profile from a template.
- An existing codebase gets one from `voidra-init`, with inferred answers for you to confirm.
- Editing the profile creates Profile change actions.

## Requirements

### In scope

- **The template mechanism.** `templates/<id>/template.yaml` holds:
  - the ID and version;
  - profile blocks with their questions (types: short text, long text, single choice, multiple choice, list);
  - help text;
  - lifecycle overrides;
  - the name of its architecture skill.

  The `voidra` package validates templates, and the app bundles `templates/`. Until P05 finishes, the general template has starter content.
- **Onboarding**:
  - **Empty folder:** pick a template → fill in the profile → Voidra writes `.voidra/`, the profile files and a first **Bootstrap** action. Bootstrap uses the Feature lifecycle.
  - **Folder with code but no `.voidra/`:** show the `/voidra-init` command for each agent with a copy button, or **Fill in by hand**.
  - Code is detected with a documented rule: known manifest files such as `package.json`, `go.mod`, `Cargo.toml` or `pyproject.toml`, or a minimum number of source files.
- **The profile screen**:
  - blocks with their answers and a status badge on each (confirmed, inferred, assumed or open);
  - answering an open question or confirming an inferred one sets it to confirmed;
  - editing a confirmed answer creates a draft Profile change action, holding the old and new values and linked to the block.
- A simple **Confirm inferred answers** list. P07 merges it into the inbox.
- **The `voidra-init` skill**:
  - reads the codebase;
  - creates `.voidra/` from the general template (or `--template <id>`), with every answer marked inferred and pointing to its source;
  - drafts `GLOSSARY.md` if there isn't one;
  - adds a short Voidra section to `AGENTS.md`, or to `CLAUDE.md` if there's no `AGENTS.md`. If `CLAUDE.md` only contains `@AGENTS.md`, it edits `AGENTS.md`.
  - runs `voidra check`.
  - It **doesn't commit**. It lists what it created so you can review it first, then commit it, for example with **Commit planning changes** from P09.

### Out of scope

The final general-template content (P05) and running Bootstrap (P08).

## Blueprint

- `.voidra/` is created in a temporary folder next to the project and renamed into place, so a failure never leaves half a folder.
- Draft Profile change actions only become queueable after you review them. Undoing the edit (P10) removes the draft.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P04-01 | Template format and loader | 5 | — | Template files are validated by the `voidra` package. A broken template is reported clearly and never used. |
| P04-02 | New-project onboarding | 5 | P04-01 | Empty folder → template → profile → a `.voidra/` that passes `voidra check`, plus a Bootstrap action. |
| P04-03 | Existing-project onboarding | 2 | P04-01 | Code is detected, the right command is shown for each agent, and **Fill in by hand** works. |
| P04-04 | Profile screen | 5 | P04-02 | Every block and answer shows with its status. Editing writes valid files. |
| P04-05 | Profile change drafts | 3 | P04-04 | Editing a confirmed answer creates a linked draft action with the old and new values. |
| P04-06 | Confirm inferred answers | 2 | P04-04 | Confirming sets the answer to confirmed and records who and when. |
| P04-07 | `voidra-init` skill | 5 | P04-01 | The golden output for the `existing-code` fixture passes `voidra check`. The glossary draft and the AGENTS.md section follow the rules above. Nothing is committed. A real-agent check in each agent is recorded in the evidence file. |

| P04-08 | Portable skill assets | 2 | P04-07, P03-12 | Copied skill folders resolve their own templates and process helper without the development checkout. Generated asset checks include intake runtime/template copies. Draft Profile changes cannot be consumed before review. |

## Tests

- **Unit:** the template loader, code detection, the profile-change difference and the atomic creation of `.voidra/`.
- **End-to-end:** new-project flow; existing-project instructions; editing an answer creates a draft action; confirming an inferred answer; axe on every new screen.
- **Fake agent:** a `voidra-init` scenario on the `existing-code` fixture.

## Failure and recovery

- An unwritable folder shows a clear error and leaves nothing behind.
- A broken template is skipped, with a message naming the file.

## Exit criteria

Every story is accepted, both ways in pass end-to-end, and `voidra-init` has passed a real-agent check in both agents.

## Hand-off

- The profile screen's form controls follow the storylens `Field` patterns: visible labels, hints and inline errors.
