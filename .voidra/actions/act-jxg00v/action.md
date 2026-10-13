---
{
  id: act-jxg00v,
  type: bug,
  title: Support the new-project Git setup boundary,
  stage: discovery,
  status: ready,
  doneBy: agent,
  createdBy: Agent under D24,
  createdAt: 2026-10-13T14:18:56.708Z
}
---
P09 handoff identifies a release follow-up: new-project onboarding can create Bootstrap in an empty folder, while standalone startup requires a Git repository. Reproduce the non-Git flow and folders inside a repository; define and test the approved-vision flow before release. Planning commits already refuse a selected folder that is not the Git root. Do not begin implementation from this record until its discovery and plan gates are satisfied.