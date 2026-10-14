---
{
  id: act-3qdarj,
  type: bug,
  title: CLI help reports the wrong package version,
  stage: implement,
  status: ready,
  doneBy: agent,
  createdBy: Agent delegated decision under D24,
  createdAt: 2026-10-14T15:00:53.870Z,
  assignee: Hussain Abbas <hussain.jazing.21@gmail.com>,
  planApproval:
    {
      by: Agent delegated decision under D24,
      at: 2026-10-14T15:00:58.004Z,
      hashes:
        {
          requirements.md: b785e6c1b2a8e90347522366811265d094cda9e458a05c9e083d6b0b85b026eb,
          blueprint.md: 8ac8a68e41947a6df0337fd55fba40dfc7187313ae32045c3e5ffbab5740c820,
          acceptance.md: 8b4d6d669dc9159c03757b958156dfcd39cc4bc0cd97505d89d339c71c158795
        }
    },
  approvalHistory: []
}
---
Reproduction: genuine current voidra 0.2.2 version reports 0.2.2, but built --help reports Voidra 0.1.0. src/cli.ts hardcodes the header while version uses PACKAGE_VERSION. Repair the existing CLI contract before v1 without changing commands, usage or exit behavior.