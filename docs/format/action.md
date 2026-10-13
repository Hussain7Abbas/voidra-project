# Actions

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/actions/<act-id>/action.md`

Frontmatter: `id`, `type`, `title`, `status`, `doneBy`, optional `stage`, `assignee`, `parent`, `blockedBy`, `links`, `commits`, `createdBy`, `createdAt`, `updatedAt`, `planApproval`, `approvalHistory`, `reviewDecision`, `profileChange`, `steps`. Types: feature, bug, improvement, docs, profile-change, research, release. Statuses: draft, ready, running, waiting, failed, complete. Agent actions require a lifecycle stage; human actions have no agent stage and use steps `{id, title, done}`. Terminal agent stages require complete status; complete status requires a terminal stage. Human completion requires every step to be done. Parent completion requires all children done/released. ID links refer to existing records; other links are opaque references for P11.

## Example

```markdown
---
id: act-000000
type: feature
title: An action
stage: discovery
status: ready
doneBy: agent
---

```

A Profile change draft records `profileChange: {block, answerId, before, after}` with JSON values, and links to `.voidra/profile/<block>.md#<answer>`. It remains draft until reviewed.
