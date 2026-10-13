# Personal queue

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/local/pending-actions.md`

Frontmatter: `queuedBy`, `queuedAt`. Body: ordered Markdown checklist of action IDs. Each ID exists, is unique and belongs to an agent action. Eligibility can change after a run reaches a gate, so checking the file validates references rather than automatically removing waiting entries.

## Example

```markdown
---
queuedBy: You
queuedAt: 2026-10-13T00:00:00Z
---

```

The Run screen lists eligible agent work with yours and unassigned actions first. Add, remove and move controls persist the ordered queue immediately. Each edit compares the displayed queue revision and action revisions; changing files or starting a run requires a refresh or recovery. Explicit Profile change drafts activate on their action page rather than in the picker.

When you update a saved queue, the desktop removes entries that have since become ineligible. Their current reason is shown in the Run list before the update. Runtime startup checks eligibility again and consumes the queue in order.
