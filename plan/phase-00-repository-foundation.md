# P00 — Repository foundation

> **Milestone:** M1 · **Needs:** nothing · **Status:** see [main.md](main.md)

## Outcome

A public `voidra-project` repository with the workspace, tooling, standards, documentation tree and CI that every later phase builds on. Every later phase starts from green checks.

## Requirements

### In scope

- Turn this folder into a git repository and create the public GitHub repository `voidra-project` with `gh`, under the **Hussain7Abbas** account (D19). Keep `VISION.md`, `LICENSE`, `plan/` and the root `AGENTS.md` and `CLAUDE.md`.
- A pnpm workspace (`apps/*`, `packages/*`, `tools/*`) with pinned versions. Node is pinned to the major version Electron ships, so native modules behave the same in tools and in the app.
- Strict TypeScript base config, Biome, and Vitest with per-package coverage thresholds (D07).
- A Makefile made with the `makefile-standards` skill.
- `AGENTS.md`, `CLAUDE.md` and the `docs/` tree made with the `init` skill.
- A compatibility policy and deprecation scanner implementing the five-part contract below, adapted to a file format instead of an HTTP API. Consult `api-backward-compatibility` if installed; its absence does not block this work (D11).
- `GLOSSARY.md` seeded with the vision's terms, `docs/adr/` with the first decisions, and a README.
- A CI workflow on a macOS runner.

### Out of scope

App code, format code, skills. Folders are created only when they get real content; there are no empty placeholders.

## Blueprint

- **`docs/compatibility.md`** implements this self-contained contract. It is the required output whether or not the reference skill is installed:

  | Policy part | Adapted to `.voidra/` |
  | --- | --- |
  | Policy | Format changes are additive: new optional fields and new files. Readers ignore unknown fields. |
  | Client versions | `voidra.json` records the format version. Apps, the CLI and skills refuse to write a newer format than they support, and open it read-only. |
  | Dated deprecations | Deprecated fields carry `@deprecated … remove-after: YYYY-MM-DD` markers in the schema code. |
  | Enforcement | A Vitest test scans the repository. It fails on undated or expired markers, and on an empty scan. |
  | Data evolution | Expand → migrate → contract: add the new field, migrate with `voidra migrate`, remove the old field in a later format version. |

- **First ADRs**, in `docs/adr/`, named by date and title:
  - the monorepo layout;
  - unsigned distribution with update notices;
  - skills developed here and synced to `voidra-skills`;
  - no real-agent tests in CI.
- **`GLOSSARY.md`** terms: action, idea, slice, gate, stage, seam, run, run result, queue, profile, answer status, assumption, ADR, template and skill.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P00-01 | Initialise git and the public GitHub repository | 2 | — | The agent runs `gh repo create Hussain7Abbas/voidra-project --public --source . --push` with that account's token (`GH_TOKEN=$(gh auth token --user Hussain7Abbas)`), so your active `gh` account doesn't change. `gh repo view` shows a public repository whose `main` branch contains VISION.md, LICENSE, `plan/` and the root instruction files. The description and topics are set with `gh repo edit`. You do nothing on the GitHub website. |
| P00-02 | Workspace and tooling | 5 | P00-01 | `pnpm install --frozen-lockfile` is clean, and `biome check` and `tsc -b` pass. Coverage thresholds are enforced: a deliberately uncovered sample fails and is then removed. |
| P00-03 | Makefile | 3 | P00-02 | Made with the `makefile-standards` skill. `make help` lists only real targets. `make check` runs lint, typecheck, unit tests and the deprecation scan. |
| P00-04 | Instructions and docs tree | 3 | P00-02 | Made with the `init` skill, extending the existing root `AGENTS.md` and keeping its **Running plan phases** and **Real-agent checks** sections. The root `AGENTS.md` has the purpose, map, rules, commands and the maintenance rule, and every `CLAUDE.md` is exactly `@AGENTS.md`. `docs/intro.md` links every docs page and the plan. |
| P00-05 | Compatibility policy and deprecation scanner | 5 | P00-02 | `docs/compatibility.md` covers all five policy parts above without requiring an unavailable skill. The scanner test fails on an undated marker, an expired marker and an empty scan, and warns within 30 days of a date. `make deprecations` lists markers. The evidence records whether the reference skill or the self-contained fallback was used. |
| P00-06 | ADRs, glossary and README | 2 | P00-04 | The four ADRs and `GLOSSARY.md` exist. The README states what the project is, that it is pre-alpha, its license and its links. |
| P00-07 | Continuous integration | 3 | P00-03 | `.github/workflows/ci.yml` runs `make check` on macOS for pushes and pull requests and passes on `main`. The README shows the status badge. |

## Tests

- **Unit:** the deprecation scanner (dated, undated, expired, within 30 days, trailing `*/`, empty file, empty scan) and a sample test per package, proving the coverage setup.
- **End-to-end:** none yet; Playwright arrives in P02.

## Failure and recovery

- If the chosen account isn't logged in to `gh`, the repository name is taken, or pushing fails, stop and ask. Never create the repository under another name or account.
- If `makefile-standards` or `init` isn't installed, stop and ask with lettered options rather than hand-writing its output. If `api-backward-compatibility` is unavailable, implement the five-part Blueprint contract and record the fallback; do not claim that the unavailable skill ran.

## Exit criteria

- The repository is public, CI is green on `main`, and `make check` passes locally.
- The docs tree is linked from `docs/intro.md`, and `plan/` is linked from it.

## Hand-off

- Invoke `makefile-standards` and `init` for their parts. For compatibility, use `api-backward-compatibility` when installed, otherwise implement the Blueprint's complete contract.
- Don't add app or format code; P01 and P02 own those.
