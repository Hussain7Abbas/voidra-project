---
{
  id: act-n2ey21,
  type: bug,
  title: Investigate intermittent hosted run-index refresh timeout,
  stage: discovery,
  status: ready,
  doneBy: agent,
  createdBy: Verification agent under D24,
  createdAt: 2026-10-14T22:13:52.151Z
}
---
Hosted CI 38641113129 and the first v1 Release 38644243048 timed out waiting for Review in apps/desktop/tests/run-index.test.ts:80 after runtime finalization. All other 397 tests passed. The same f519aec source passes the complete local 398-test suite, a focused reproduction (5.03 seconds), and both independent tagged-source CI quality jobs. Preserve failures and successful comparisons; determine whether filesystem-event delivery, refresh scheduling or the assertion deadline causes the intermittent wait before choosing a fix. Do not weaken production guards, skip the test or rewrite immutable release tags. This is a CI reliability follow-up, not a confirmed product data-loss bug; no implementation is queued or approved.