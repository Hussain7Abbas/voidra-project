# Voidra Project documentation

Voidra is an open-source desktop app for planning and tracking projects built with AI coding agents. Its [vision](../VISION.md) defines the product, the [implementation plan](../plan/main.md) tracks delivery, and the [root instructions](../AGENTS.md) define the development workflow.

P00 supplies repository tooling and policies. P01 publishes the format package and CLI; validation and publication are recorded in its evidence. P02 adds the secure desktop shell and its design system. P03–P09 complete the core loop and reach M2; this repository now tracks its own ideas and bugs in `.voidra/`. P10 completes persistent app undo; decisions and assumptions are being implemented in P11.

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
