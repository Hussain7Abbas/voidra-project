# Voidra Project documentation

Voidra is an open-source desktop app for planning and tracking projects built with AI coding agents. Its [vision](../VISION.md) defines the product, the [implementation plan](../plan/main.md) tracks delivery, and the [root instructions](../AGENTS.md) define the development workflow.

P00 supplies repository tooling and policies. P01 implements the format package and CLI; publication status is recorded in its evidence. The desktop app and executable agent skills arrive in later phases.

- [Development](development.md): setup, commands, pins, coverage and the scanner.
- [Format specification](format/Intro.md): record types, versions, file I/O and CLI contract.
- [Compatibility](compatibility.md): the required `.voidra/` evolution policy.
- [Architecture index](architecture/Intro.md) and [repository foundation](architecture/repository-foundation.md).
- [ADR index](adr/Intro.md): [monorepo](adr/2026-10-12-monorepo-layout.md), [unsigned distribution](adr/2026-10-12-unsigned-distribution.md), [skills distribution](adr/2026-10-12-skills-distribution.md), and [agent checks](adr/2026-10-12-agent-checks.md).
- [Verification index](verification/Intro.md) and [P00 foundation evidence](verification/p00.md): actual local and CI results.
- [P01 format evidence](verification/p01.md): actual package checks and publication status.
- [Glossary](../GLOSSARY.md): agreed project terms.
