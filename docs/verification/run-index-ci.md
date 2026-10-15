# Run-index CI reliability

User-requested fix, 2026-10-15, following [CI 38652622557](https://github.com/Hussain7Abbas/voidra-project/actions/runs/38652622557/job/116154812299) on `9917bfe`. That run passed 397/398 tests; `apps/desktop/tests/run-index.test.ts:80` timed out after finalization. Earlier identical failures are preserved in [P17 evidence](p17.md) and Bug `act-n2ey21`. No release tags or shipped assets are changed.

## Diagnosis and correction

Each run-index poll invokes the actual workspace bridge. The utility recomputes a complete snapshot from project files/checkpoints, native process ownership, planning state and Git history. The service permits these reads five seconds; the test omitted a poll timeout and therefore allowed only Vitest 5.0.4's one-second default. A correct asynchronous response can outlive that assertion deadline. The logs do not establish that filesystem events were lost or that production data was incorrect.

All three run-index waits now explicitly use the five-second read contract. The prepared result must still report `incomplete-run` while holding the Implement view. The final check is stronger: Review, the real committed hash, no incomplete-run diagnostic, no pending recovery for the run, and no active lock must appear together. Failed reads surface their bridge error; a failed assertion logs sampled phases, durations, stages/statuses and diagnostics for further diagnosis.

No production watcher timing, snapshot guard, approval/hash behavior, retry policy or test skip is changed. The separate watcher-notification test retains its explicit one-second latency requirement.

## Verification

Pre-push verification: the corrected focused native test passed initially in 5.70 seconds and in five further consecutive independent runs (5.22, 4.68, 4.83, 5.03 and 4.71 seconds). Lint and strict workspace/desktop type checking passed. Each run uses genuine temporary files/Git, the runtime's prepare/commit/finalize operations and real Electron/IPC/SQLite; no wait or service response is mocked.

The required full local quality suite and the fix commit's [GitHub CI check](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml) supply complete regression and hosted verification. The focused results above are pre-push evidence and do not by themselves claim a hosted pass. Local logs are retained under `.cache/run-index-*.log`.

## Hosted quality result and appearance follow-up

`33c1620` passes the complete local quality gate: 398/398 tests across 84 files in 395.28 seconds, coverage, lint, types, deprecations and generated references. Its [hosted run 38660318907](https://github.com/Hussain7Abbas/voidra-project/actions/runs/38660318907) also passes quality and build, confirming the original run-index failure is resolved on that runner.

That run reaches the previously skipped desktop suite: 66/68 pass, while both new appearance cases wait for a Maximize button at their initial window state. The titlebar exposes Restore instead when the initial window is maximized; a test cannot assume the default 1200×800 size fits a hosted display normally. The follow-up establishes real normal window bounds relative to the active display's available work area, checks native `isMaximized() === false`, and refreshes the initial renderer snapshot before the existing control tests. No production state, preference or native operation is mocked or changed. Failures now record actual bounds, work area and native maximize/fullscreen/minimize state.

Both corrected appearance cases pass locally in 11.8 seconds; lint and strict types pass. The separate fresh-CI check for this follow-up remains the authority for its hosted result.
