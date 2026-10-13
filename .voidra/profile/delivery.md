---
{
  block: delivery,
  title: Runtime and delivery,
  answers:
    [
      {
          id: platform,
          question: Where will the project run?,
          answer: desktop,
          status: inferred,
          source: "apps/desktop/package.json:2-16,45-74;
            docs/architecture/desktop.md:5-13",
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: distribution,
          question: How will the first version be deployed or distributed?,
          answer: "Current build tooling creates an unsigned macOS arm64 directory package
            and smoke-tests its executable; this is not evidence of a shipped
            desktop release. Documentation records npm 0.1.0 as the public
            baseline and 0.2.0 as a locally prepared, unpublished candidate. P15
            still plans DMG/GitHub Releases, update notices and matching library
            publication.",
          status: inferred,
          source: apps/desktop/package.json:14-16; apps/desktop/package.json:63-74;
            docs/architecture/desktop.md:13;
            plan/phase-15-packaging-and-updates.md:14-27; plan/main.md:100,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
