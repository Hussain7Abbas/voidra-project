# Parallel test execution — 2026-10-16

This direct maintenance request changes the test harness and hosted verification topology. It changes no shared format, product behavior, executable skill or publication version.

## Scheduling and isolation

Root Vitest runs 91 isolated test files in two fork workers with normal per-file isolation. It then runs 20 exclusive files with one worker. `sequence.groupOrder` separates the groups completely, rather than merely limiting one group's concurrency. Tests within each file remain sequential. The exclusive list contains the 18 Electron/native-coverage files, the genuine skill-distribution integration and the standalone release integration. Temporary projects, Git repositories, settings and databases remain disposable and independently owned.

Coverage remains one root aggregation over both groups, including source-mapped Electron subprocesses and the retained native fixture bundles. The existing 90% package/tooling and 80% main/service line gates are unchanged. No retries, new skips, relaxed assertions or extended deadlines were added. `make check` and `make test` use the new grouping automatically. Focused `--project isolated` and `--project exclusive` runs are available after building; they do not replace the complete coverage gate. `--maxWorkers=1` provides a constrained-machine/serial comparison.

The regression probe uses two real test processes that must rendezvous, followed by exclusive files that require both parallel completion markers and acquire the same exclusive filesystem lock. Different source functions are exercised by the two groups; their combined report must reach 100% lines/functions. An inventory guard also requires Electron/native-coverage imports to be listed in the exclusive group. Existing coverage-enforcement probes explicitly clear inherited projects so they continue exercising only their own fixtures.

## Hosted desktop shards

CI and Release call `.github/workflows/verify.yml` with the exact source ref. One macOS quality job creates the checked build and archives it with tar so executable modes survive artifact transfer. Three separate macOS jobs each install/rebuild their own dependencies and reuse that build, running one Playwright worker with visible native checks. File-level sharding preserves each file's existing ordering and fixture lifetime. Local desktop shards must run sequentially because separate directories do not isolate the desktop or clipboard.

Each shard uploads its own blob report and retains failure traces/screenshots. `fail-fast: false` lets the other shards finish after a failure. The required report job rejects missing/duplicate shard blobs, merges the three reports and checks all prerequisite conclusions. Packaging and release staging depend on the complete shared verification, then reuse the same build. Validation artifacts explicitly allow replacement when failed jobs are rerun, while failure traces/screenshots retain attempt-specific names. Original immutable release staging/checksum/recovery artifacts and gates are retained. The standalone local release coordinator still completes quality and the full visible desktop suite sequentially before tagging.

The implementation follows Vitest's [parallel/sequential project recipe](https://main.vitest.dev/guide/recipes/parallel-sequential.html) and Playwright's [sharding/report-merging API](https://playwright.dev/docs/test-sharding).

## Investigation and completed probes

- Serial baseline: `.cache/test-baseline.json` and `.cache/test-baseline.log`, 492 tests, 491 passes and one existing create-action watcher failure (`expected 2 to be 1`). Time from runner start through the last test was 564.62 seconds. The exact test passed unchanged in a focused rerun (`.cache/parallel-create-repeat.log`). This evidence does not claim that its intermittent startup notification behavior is fixed.
- Initial three-worker candidate: 493/494 passed; genuine distribution publishing exceeded its unchanged 30-second deadline (`.cache/parallel-check-first.log`). The file moved to exclusive execution.
- A subsequent three-worker stress run exposed a deadline-sensitive standalone release reconciliation test. It was interrupted after that failure, and the file also moved to exclusive execution. A two-worker candidate then passed the complete quality gate, but its 663.45-second test phase regressed against the serial timing reference. A final three-worker comparison keeps both deadline-sensitive files exclusive rather than hiding the regression.
- Scheduling and existing coverage-enforcement probes passed together, 7/7 (`.cache/parallel-scheduling.log`). Strict TypeScript and lint checks passed during implementation.
- Actual Vitest collection covers all 111 test files exactly once, with no intersection between the 91/20 groups (`.cache/test-groups-final.json`). Actual Playwright collection covers all 110 scenarios exactly once across shards of 39, 35 and 36 tests (`.cache/e2e-inventory*.json`).
- Actionlint 1.7.12 validates CI, Release and the reusable workflow. The new artifact-download action is pinned to the verified v8 commit. Complete/missing/duplicate artifact fixture probes passed; all 16 success/failure/skipped/cancelled aggregate-result combinations reject incomplete verification.

## Completed conservative quality gate

`make check` passed with two isolated workers: 111 files, 494 tests, all unchanged coverage thresholds, lint, strict TypeScript, deprecations and generated-reference checks. The full command took 706.53 seconds, including builds and generation checks; the Vitest phase took 663.45 seconds (`.cache/parallel-check-final.log`). This passing candidate establishes correctness but does not support a local speedup claim.

## Final worker selection

The same built app and final 91/20 partition passed with three workers: 111 files, 494/494 tests, identical aggregate coverage and all unchanged thresholds (`.cache/parallel-three-exclusive.json`, `.cache/parallel-three-exclusive.log`). Runner start through the last test took 334.54 seconds; the complete process, including coverage reporting, took 363.92 seconds. Three workers was the initial selected default; the shared-host follow-up below reduces it to two. Both deadline-sensitive toolchain files passed in the exclusive group. Recorded isolated-file intervals reach exactly three concurrent files. Recorded exclusive-file intervals also show zero overlapping pairs among the 20 exclusive files; the first starts 142 ms after the final isolated file ends. Tar round-trip probes preserve the main/preload/service/library bytes and native executable modes. The final default's seven scheduling/coverage probes and `make lint typecheck` pass (`.cache/parallel-final-probes.log`, `.cache/parallel-final-static.log`).

The complete serial process took 624.06 seconds versus 363.92 seconds for the final three-worker process, about 42% less wall time on this machine. The serial reference had one intermittent failure and is a timing reference rather than a clean statistical benchmark; the passing two-worker and three-worker candidates use the same built app and test inventory.

## Desktop handoff regression

The first complete three-shard background pass merged all reports successfully and retained 107 passes, two native-window-control skips and one task-workflow failure (`.cache/initial-e2e-merged.json`). The light workflow reached its watched In progress column, then called `startRun` at the original test line 215 before the app grouped write was fully settled. The unchanged production validation guard refused the snapshot. Its trace/screenshot and original source are retained under `.cache/e2e-results/3/`, `.cache/e2e-failed-shard-3/` and `.cache/task-workflow-before.spec.ts`.

The test now waits for enabled movement controls and a diagnostic-free public `checkProject` snapshot before each standalone start. Only the read-only precondition is polled; every `startRun` side effect is invoked once, and all existing startup, approval, ownership and recovery guards remain active. Existing assertions, retries and deadlines are unchanged.

## Final desktop verification

The affected workflow passes in both themes in a focused run, 2/2 (`.cache/e2e-workflow-focused.log`), and again inside the complete third-shard rerun. The other successful shard reports were retained unchanged, matching a failed-job rerun. The original failed report remains retained separately.

| Shard | Scenarios | Final result | Local elapsed |
| --- | --- | --- | --- |
| 1 | 39 | 37 passed, two expected background skips | 156.65 s |
| 2 | 35 | 35 passed | 411.82 s |
| 3 | 36 | 36 passed after the readiness correction | 183.51 s |

All three final shard commands exit successfully and produce exactly one blob each (`.cache/e2e-shard-results.json`). The exact report-completeness script from the workflow passed against these artifacts. Playwright merged them into `apps/desktop/playwright-report/index.html` and `.cache/e2e-merged.json`. The final report contains every expected test ID exactly once: **110 scenarios, 108 passes, two expected background-mode native-window-control skips, zero failures and zero flaky results**. It matches the complete unsharded inventory, rather than relying only on aggregate counts. The first merged failure correctly returned a failed orchestration result even though report generation itself succeeded.

Final `make lint typecheck`, Actionlint and `git diff --check` pass after the readiness correction and default-worker selection. No product source, publication checkpoint or executable skill was changed by this request.

## Scope limits

Hosted execution cannot be observed from an untagged local change: ordinary CI is deliberately tag-only. No release tag, publication or workflow dispatch was created for this maintenance request. Local background desktop verification does not exercise native minimize/maximize behavior; the existing visible-mode hosted/release gates retain those scenarios.

## Shared-host headroom follow-up

The headless-AI follow-up exposed 30-second deadlines in four cases across the isolated Git workflow, planning-commit and Sync suites during a complete three-worker coverage run (`.cache/headless-ai-check.log`). The default isolated pool is now two workers, retaining concurrent chunks and the separate exclusive group without changing assertions or deadlines. The earlier three-worker measurements above remain actual historical measurements, not a claim that every host load sustains that setting. Current verification is recorded in [headless AI](headless-ai.md).

The complete headless-AI quality gate passes at the two-worker default: **111 files, 504/504 tests**, unchanged coverage gates and all `make check` steps. Vitest took 566.27 seconds (`.cache/headless-ai-check-two.log`). The earlier three-worker run took 573.67 seconds but failed four Git deadlines. These are current-run observations on a shared host, not a new universal speedup claim.
