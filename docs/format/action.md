# Actions

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/actions/<act-id>/action.md`

Frontmatter: `id`, `type`, `title`, `status`, `doneBy`, optional `stage`, `assignee`, `parent`, `blockedBy`, `links`, `commits`, `createdBy`, `createdAt`, `updatedAt`, `planApproval`, `approvalHistory`, `planFeedback`, `reviewDecision`, `profileChange`, `steps`. Types: feature, bug, improvement, docs, profile-change, research, release. Statuses: draft, ready, running, waiting, failed, complete. Agent actions require a lifecycle stage; human actions have no agent stage (except the Cancelled end state) and use steps `{id, title, done}`. Terminal agent stages require complete status; complete status requires a terminal stage. Human completion requires every step to be done. Cancellation preserves unticked steps and does not satisfy dependent actions. Parent completion requires all children done/released. ID links refer to existing records; other links are opaque references for P11.

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

`planFeedback` records `{revision, feedback, by, at}` for a requested revision. A Release review decision may also record exact plan `hashes`; this allows the app to identify changed plan files. Previous decisions remain in `reviewHistory` when renewed after changed contents.

P12 structured Releases use releaseActions, releaseVersion, releaseTag, releaseFiles and releaseMessage. The displayed revision binds these fields, the three plan files and proposal metadata/notes. An explicit empty releaseFiles list uses release files when no repository version convention exists. Changed scope needs acceptance again. Included work gains releasedIn; agent members also reach Released, while human members retain their completed checklist and have no agent stage. These forms require reader 0.2.0 and a matching released record.
