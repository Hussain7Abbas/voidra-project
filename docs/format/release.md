# Release records

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/releases/<version>.md`

Frontmatter: `version` (matching filename), `actions`, `status` (draft, released), optional `action` (owning Release action), `tag`, `date`. The body contains notes. Released records require a tag and included actions in Released. P12's structured selections use reader 0.2.0; legacy records without an owning action remain valid.

Structured Release actions have `releaseActions`, then `releaseVersion` and `releaseTag` at Review. The proposal record must match the action, version, tag and ordered IDs. Approval binds plan files, selection and record metadata/notes; final status/date do not change the proposal. Changed notes/version/tag/members need acceptance again. Acceptance stays at Review/Ready; only the agent may bump source versions, commit, tag and mark members Released. Standalone orchestration remains in progress in P12.

## Example

```markdown
---
version: 0.1.0
actions:
  - act-000000
status: draft
---

```
