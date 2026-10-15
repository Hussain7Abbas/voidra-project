---
{
  id: act-n2ey21,
  type: bug,
  title: Investigate intermittent hosted run-index refresh timeout,
  stage: discovery,
  status: ready,
  doneBy: agent,
  createdBy: Verification agent under D24,
  createdAt: 2026-10-14T22:13:52.151Z,
  updatedAt: 2026-10-15T00:29:17.607Z
}
---
Hosted CI 38641113129 and the first v1 Release 38644243048 timed out waiting for Review in apps/desktop/tests/run-index.test.ts:80 after runtime finalization. All other 397 tests passed. The same f519aec source passes the complete local 398-test suite, a focused reproduction (5.03 seconds), and both independent tagged-source CI quality jobs. Preserve failures and successful comparisons; determine whether filesystem-event delivery, refresh scheduling or the assertion deadline causes the intermittent wait before choosing a fix. Do not weaken production guards, skip the test or rewrite immutable release tags. This is a CI reliability follow-up, not a confirmed product data-loss bug; the original record was left unqueued for investigation.

2026-10-15: The user requested a direct fix after CI 38652622557 repeated this failure on 9917bfe (397/398 passed). Investigation confirms each poll performs a full real workspace read, with a five-second service deadline, while the test used Vitest’s implicit one-second polling deadline. The test now matches the read contract and additionally requires the finalized commit, no pending run recovery/incomplete diagnostic, and a cleared lock. Failed samples include stage/status, diagnostic codes and read durations. Production watcher timings and guards are unchanged; the separate one-second watcher-notification test is retained. Source correction verification is recorded in [CI reliability evidence](docs/verification/run-index-ci.md). This direct source follow-up does not fabricate a queued action run or plan/review decisions.
