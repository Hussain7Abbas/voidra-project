---
{
  block: integrations,
  title: External systems,
  answers:
    [
      {
          id: systems,
          question: "Which external systems must it connect to, and how is access
            controlled?",
          answer:
            [
              "Local Git supplies effective name/email, history and explicitly
                selected planning commits; configured identity is required
                before starting unassigned agent work. No push is performed by
                planning commits.",
              Claude Code and Codex run manually invoked standalone skills
                using their own installed CLI access; the desktop does not
                launch authenticated agents.,
              "GitHub commit links use validated repository remotes and
                current service-verified hashes; this is link opening, not a
                release or sync service.",
              OpenRouter is optional planned P13 scope and is not implemented;
                no provider credentials are inferred.
            ],
          status: inferred,
          source: docs/architecture/runs.md:11; docs/architecture/runs.md:19-25;
            docs/architecture/desktop.md:17; plan/main.md:98,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
