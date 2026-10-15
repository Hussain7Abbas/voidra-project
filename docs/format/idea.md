# Backlog ideas

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/backlog/<idea-id>.md`

Frontmatter: `id`, `title`, `status` (`new`, `needs-info`, `ready`, `promoted`, `rejected`), optional `reason`, `promotedTo`, `createdBy`, `createdAt`. A rejected idea needs a nonempty reason; a promoted idea names an existing action. Body: description.

In the 1.1.0 candidate, projects opted in with `taskTracking: 1` require an explicit `targetRelease` on active ideas: a version or `null`. Creation defaults to the current project package version; Backlog can explicitly clear it. Promotion preserves an existing non-null assignment or fills the current version when leaving unversioned Backlog, refusing promotion to TODO if no release is available. Promoted source ideas retain their identity/link and do not create a duplicate Tasks card.

The 1.1.0 capture form can also retain an optional proposed action `type` and portable `assignee` (`Name <email>`). Creation or editing that introduces these fields advertises reader 1.1.0 in project metadata, independently of the release-aware Tasks opt-in. Editing preserves omitted assignment/type; explicit null clears an assignee. Promotion preserves the assignment unless a replacement is supplied, while still requiring an explicit valid action type.

## Example

```markdown
---
id: idea-000000
title: An idea
status: new
---

```
