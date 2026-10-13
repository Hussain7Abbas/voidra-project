---
{
  block: scope,
  title: Features and boundaries,
  answers:
    [
      {
          id: features,
          question: What are the first useful features?,
          answer:
            [
              Initialize existing code with source-linked inferred profile
                answers while preserving existing glossary and instructions,
              View and edit the project profile and confirm inferred answers,
              Manage ideas and promote them to actions,
              "Track action types, lifecycles, blockers, human checklists, and
                slices",
              "Queue, order, and run eligible actions with standalone agent
                skills",
              Answer questions and review exact plan and result revisions,
              View run results and linked Git commit history,
              Commit explicitly selected shared planning files while
                preserving unrelated Git staging
            ],
          status: inferred,
          source: tools/run-engine/src/init.ts:75-139;
            docs/architecture/onboarding.md:9-15;
            docs/architecture/backlog-actions.md:5-19;
            docs/architecture/questions-gates-inbox.md:5-15;
            packages/voidra/src/queue.ts:105-145;
            tools/run-engine/src/planning-commit.ts:421-519;
            docs/architecture/runs.md:19-25,
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: modules,
          question: "Which modules or boundaries must be preserved, and what is outside
            the first version?",
          answer: "The current repository separates the Electron desktop app (main,
            sandboxed preload, static renderer, and per-project utility
            service), the Electron-independent shared voidra
            format/validation/write package, standalone run-engine helpers,
            executable skills, bundled templates, and documentation. The app
            writes planning data; coding-agent skills implement project code.
            Optional OpenRouter app features, Undo/redo, release management and
            voidra-sync are future plan scope and are not implemented. Packaging
            smoke checks do not establish that a release has shipped.",
          status: inferred,
          source: AGENTS.md:7-12; docs/architecture/desktop.md:5-17;
            docs/architecture/format-package.md:5-11; plan/main.md:94-100,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
