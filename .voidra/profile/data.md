---
{
  block: data,
  title: Data and protection,
  answers:
    [
      {
          id: model,
          question: What information does the project store or manage?,
          answer:
            [
              Projects with a versioned profile and template,
              "Ideas in a backlog and actions with lifecycle, dependencies,
                assignments, questions, plans, checklists, slices, and run
                results",
              Personal ordered run queues and local run/operation recovery
                records,
              Git commit history and explicit planning-commit records,
              A rebuildable SQLite display cache stored in app data
            ],
          status: inferred,
          source: docs/architecture/onboarding.md:5-13;
            docs/architecture/backlog-actions.md:5-15;
            docs/architecture/questions-gates-inbox.md:5-15;
            docs/architecture/runs.md:5-25; docs/architecture/project-files.md:7,
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: protection,
          question: "Which privacy, security or data-retention rules must it respect?",
          answer: "Project planning records are Markdown files in the repository; the
            SQLite index is disposable app data. The renderer is sandboxed
            behind a validated narrow bridge, and local source code is not sent
            to an AI service by the documented product design. Optional
            OpenRouter behavior and its key handling remain future work. Intake
            preserves existing glossary and instruction content and does not run
            Git.",
          status: inferred,
          source: VISION.md:16-22; docs/architecture/desktop.md:5-9;
            docs/architecture/project-files.md:7-9;
            tools/run-engine/AGENTS.md:7; plan/main.md:98,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
