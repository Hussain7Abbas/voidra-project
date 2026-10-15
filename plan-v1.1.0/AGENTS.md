# v1.1.0 plan rules

Extends [root instructions](../AGENTS.md). This directory contains implementation planning, not application code or verification evidence.

- [main.md](main.md) is the release tracker. Keep dependencies, statuses, decisions, requirement coverage and links synchronized. The accepted product direction is also recorded in [VISION.md](../VISION.md#17-v110-product-direction).
- The user requested this plan on 2026-10-15. Writing it does not authorize implementing all phases, publishing a release or carrying the original v1 delegated approvals into v1.1.0.
- Each phase has, in order: Outcome, Requirements, Blueprint, Stories, Tests, Failure and recovery, Exit criteria and Hand-off. Stories use `V11-PXX-NN` IDs, 1/2/3/5/8 relative points, prerequisites and observable acceptance criteria. Points are not time estimates.
- Distinguish user requirements, proposed implementation choices and unresolved questions. The user explicitly discarded the incomplete instruction ending in `~` (R17/U01); do not reintroduce it. Never treat an unanswered question as approval. The user requested at least three implementation questions and follow-ups as needed; keep question rounds and their answers in the tracker.
- Both rounds are answered: C01–C06 settle task identity, five columns, release preservation, package selection, local roster/project membership and AI review-before-save. C07–C09 settle one badge per unfinished draft, private local durability and Agentic for every fresh form; restored drafts retain their own mode. Do not ask those choices again. R18 requires all unfinished data-entry forms to preserve drafts on exit and show top badge navigation on reopen; follow [the draft contract](form-drafts.md) without narrowing the all-forms scope.
- Future implementation must read applicable scoped instructions, current source and prerequisite evidence; implement thin stories across the relevant layers and run the root phase workflow. Public checks use the existing pinned workspace toolchain. Do not replace it as part of this release.
- Set a phase In progress only when implementation starts. Record actual results in `docs/verification/v1.1.0-pXX.md`, updating the verification index when that evidence exists. Never create empty evidence files or mark planned checks as passed.
- Preserve exact approval hashes, durable consumption, expected-hash writes, source containment and standalone agent behavior. A Kanban gesture or dismissible dependency warning never grants permission to implement, approve, complete or release work.
- Before frontend implementation, apply modern-web-guidance, ui-ux-pro-max and electron-best-practices as appropriate. Select editor and drag-and-drop dependencies after checking their current primary documentation against pinned Electron; this planning task does not select an unverified library.
- Update the user guide, architecture, format references, generated skill copies and scoped instructions in the phase that changes their behavior. Keep historical v1 evidence and completed phases intact.

Keep CLAUDE.md containing exactly `@AGENTS.md` and a trailing newline.
