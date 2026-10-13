---
{
  block: constraints,
  title: "Priorities, limits and references",
  answers:
    [
      {
          id: priorities,
          question: Which qualities matter most?,
          answer: [ simplicity, accessibility, offline ],
          status: inferred,
          source: VISION.md:16-22; docs/design-system.md:22-30;
            docs/architecture/desktop.md:5-9,
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: limits,
          question: Which constraints or fixed decisions must the work respect?,
          answer: "The current desktop target is macOS arm64 and unsigned; CI is macOS and
            does not run authenticated coding agents. The app does not edit
            project source as part of planning. Keep the AGPL-3.0-or-later
            license. Optional OpenRouter, Undo/redo, releases and sync are
            planned work, not current behavior.",
          status: inferred,
          source: package.json:6-10; apps/desktop/package.json:63-74; AGENTS.md:17-22;
            VISION.md:17; plan/main.md:95-100,
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: references,
          question: "Which existing documents, examples or source materials should guide
            the work?",
          answer:
            [
              VISION.md — approved product behavior and scope,
              "AGENTS.md — repository structure, constraints and workflow",
              plan/main.md — implementation status and phase boundaries,
              docs/intro.md — documentation entry point,
              docs/architecture/desktop.md — desktop security and architecture,
              docs/architecture/format-package.md — shared format contract,
              docs/architecture/onboarding.md — project intake and profile
                behavior,
              docs/architecture/backlog-actions.md — backlog and action
                behavior,
              docs/architecture/questions-gates-inbox.md — human gates and
                inbox,
              docs/architecture/runs.md — standalone execution and Git behavior,
              docs/design-system.md — implemented desktop design system
            ],
          status: inferred,
          source: VISION.md:1-12; AGENTS.md:1-14; docs/intro.md:1-12;
            docs/architecture/desktop.md:1-17;
            docs/architecture/format-package.md:1-11;
            docs/architecture/onboarding.md:1-17;
            docs/architecture/backlog-actions.md:1-19;
            docs/architecture/questions-gates-inbox.md:1-17;
            docs/architecture/runs.md:1-25; docs/design-system.md:1-32,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
