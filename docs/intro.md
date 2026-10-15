# Voidra Project documentation

Voidra is an open-source desktop app for planning and tracking projects built with AI coding agents. Its [vision](../VISION.md) defines the product, the [implementation plan](../plan/main.md) tracks delivery, and the [root instructions](../AGENTS.md) define the development workflow.

The requested next release is an agentic coding workspace with a Tasks Kanban board, Actions sidebar, bottom human-decision panel and shared Markdown experience. The [v1.1.0 implementation plan](../plan-v1.1.0/main.md) contains ten phases and nine confirmed clarification answers; both question rounds are resolved. V11-P01 is complete with an initial Tasks view, project package-version selection, explicit migration and guarded Backlog/TODO movement; [verification](verification/v1.1.0-p01.md) records 424 tests and 70 desktop workflows. Later phases have not started. Every unfinished data-entry form will save a private local draft on exit and show one top navigation badge per draft when reopened; fresh task forms start in Agentic, while restored drafts keep their mode. The [draft contract](../plan-v1.1.0/form-drafts.md) tracks this across phases. [Vision section 17](../VISION.md#17-v110-product-direction) records the product changes. The documentation below describes the implemented v1 baseline until each new phase updates its affected pages.

P00 supplies repository tooling and policies. P01 publishes the format package and CLI; validation and publication are recorded in its evidence. P02 adds the secure desktop shell and its design system. P03–P09 complete the core loop and reach M2; this repository now tracks its own ideas and bugs in `.voidra/`. P10 completes persistent app undo; P11 completes decisions, assumptions and read-only repository docs/glossary. P12 completes releases and Sync with full local/CI and real-agent evidence. P13 completes optional editable AI suggestions; P14 completes offline skill installation and guarded distribution. P15 completes live packaging/publication recovery for preview 0.2.2, and P17 completes v1.0.0 publication, both-agent verification, the user-reported VoiceOver pass and actual downloaded-app verification; M4 is reached. P16 records the future v2 designs without implementing them.

- [User guide](user-guide.md): creating projects, running skills, decisions, recovery and settings.
- [Development](development.md): setup, commands, pins, coverage and the scanner.
- [Format specification](format/Intro.md): record types, versions, file I/O and CLI contract.
- [Compatibility](compatibility.md): the required `.voidra/` evolution policy.
- [Architecture index](architecture/Intro.md) and [repository foundation](architecture/repository-foundation.md).
- [ADR index](adr/Intro.md): [monorepo](adr/2026-10-12-monorepo-layout.md), [unsigned distribution](adr/2026-10-12-unsigned-distribution.md), [skills distribution](adr/2026-10-12-skills-distribution.md), and [agent checks](adr/2026-10-12-agent-checks.md).
- [Verification index](verification/Intro.md) and [P00 foundation evidence](verification/p00.md): actual local and CI results.
- [P01 format evidence](verification/p01.md): actual package checks and publication status.
- [Glossary](../GLOSSARY.md): agreed project terms.

- [Design system](design-system.md): how the desktop applies Ink & Iris.
- [P02 evidence](verification/p02.md): native, end-to-end, accessibility and packaged checks.

- [General template review](templates/general-review.md): general profile questions and delegated P05 review evidence.

- [Agent workflows and observed differences](agents.md): shared standalone skills, sandboxed checks and actual CLI behavior.

- [V2 design index](architecture/v2/Intro.md): all 15 approved future-scope items, grounded in built v1 code and evidence.

- [App icon review](icon-review.md): original directions and delegated P15 acceptance.
