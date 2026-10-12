# P14 — Skills distribution

> **Milestone:** M3 (completes it) · **Needs:** P08, P12 · **Status:** see [main.md](main.md)

## Outcome

The app installs and updates its bundled skills for Claude Code and Codex, and each release copies the skills and templates to the `voidra-skills` repository for skills.sh (D04).

## Requirements

### In scope

- **Research.** Confirm the current global and per-project skill folders for Claude Code and Codex, and whether the `skills` CLI can be used from the app. Record the result in an ADR.
- **The installer:**
  - copies the bundled skills into each agent's folder, with a version marker;
  - shows the status in Settings: installed version, bundled version and **Install**, **Update** or **Remove**;
  - offers installation on first run.
- **Protecting your edits.** If an installed skill was changed by hand, the installer shows the difference and asks before replacing it.
- **Compatibility.** Each skill declares the format version it writes. The app warns when an installed skill writes an older or newer format than the project uses.
- **`make skills-sync`** (run by the agent during a release, as part of P17 and `make release`):
  - copies `skills/` and `templates/` into `voidra-skills`;
  - updates its README catalog and `skills.sh.json`;
  - runs its `make validate` and `make publish` for each skill, through git and `gh`.

### Out of scope

Template sharing between users (v2).

## Blueprint

- The app bundles the skills from the repository's `skills/` folder at build time.
- Each installed copy gets a `voidra-skill.json` marker recording its version, format version and content hash. A hash mismatch means it was edited by hand.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P14-01 | Skill folder research and ADR | 2 | — | The ADR records each agent's folders, with links to the documentation it was checked against. |
| P14-02 | Installer | 5 | P14-01 | Install, update and remove work for both agents on temporary home folders. |
| P14-03 | Settings status and first-run offer | 3 | P14-02 | Shows the correct status for each agent and makes the first-run offer once. |
| P14-04 | Protecting hand edits | 3 | P14-02 | A changed skill is never replaced without your confirmation. |
| P14-05 | Format compatibility warning | 2 | P14-02 | Warns about mismatches in both directions. |
| P14-06 | `make skills-sync` | 3 | — | A dry run shows exactly what would change in `voidra-skills`. A real run publishes each skill through that repository's own rules. |

## Tests

- **Unit:** the installer on temporary home folders, hand-edit detection and version comparison.
- **End-to-end:** the Settings status and the installation flow, against a temporary home folder.
- **`skills-sync`:** a dry run against a temporary clone.

## Failure and recovery

- A failed copy leaves the previously installed version in place.
- `skills-sync` stops at the first failed validation and publishes nothing after it.

## Exit criteria

Every story is accepted, M3 is reached, and the milestone in [main.md](main.md) is updated.

## Hand-off

- Check each agent's skill folders against its current documentation when you implement P14-01. They change between agent versions.
