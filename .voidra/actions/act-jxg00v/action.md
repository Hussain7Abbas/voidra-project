---
{
  id: act-jxg00v,
  type: bug,
  title: Support the new-project Git setup boundary,
  stage: done,
  status: complete,
  doneBy: agent,
  createdBy: Agent under D24,
  createdAt: 2026-10-13T14:18:56.708Z,
  assignee: Hussain Abbas <hussain.jazing.21@gmail.com>,
  planApproval:
    {
      by: Agent delegated decision under D24,
      at: 2026-10-14T13:02:41.565Z,
      hashes:
        {
          requirements.md: 803908cb5d087c6be3fe7c156571bd2735ba59e07447bafbceffd04ce83ae996,
          blueprint.md: 993689a137f101c7d58e4a06bf5190fefc9bd8f66384184f15cfd79941eae2b9,
          acceptance.md: 96c82cb8a949c8522b9355ca2fc99795cb6bd62c6d7447fcbfd59187d042c087
        }
    },
  approvalHistory: [],
  commits: [ f3d0575d19bb08fb8e36e275e8c2544486d82d37 ],
  reviewDecision:
    {
      by: Agent delegated decision under D24,
      at: 2026-10-14T15:01:28.185Z,
      revision: 31807eb27508c6cf700cb63c6d909ff65a3289c6a638a05d79ab53bb83831fcd,
      decision: accepted
    }
}
---
P09 handoff identifies a release follow-up: new-project onboarding can create Bootstrap in an empty folder, while standalone startup requires a Git repository. Reproduce the non-Git flow and folders inside a repository; define and test the approved-vision flow before release. Planning commits already refuse a selected folder that is not the Git root. Do not begin implementation from this record until its discovery and plan gates are satisfied.