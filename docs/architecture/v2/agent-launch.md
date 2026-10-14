# Launch agents from the app

[V2 index](Intro.md) · [Parallel runs](parallel-runs.md)

## Problem and built baseline

V1 copies a terminal command; users manage the agent process themselves. The [standalone engine](../../../tools/run-engine/src/run.ts) already persists host/PID/start/token ownership, exact consumed inputs and durable commit recovery. [The bridge](../../../apps/desktop/src/shared/bridge.ts) is validated and the renderer cannot execute a shell. [P09 evidence](../../verification/p09.md) proves ownership and ordered queues; [P12](../../verification/p12.md) proves local Release reconciliation.

## Proposed design

A supervised launcher runs a configured agent executable with structured arguments in the selected canonical checkout. An agent adapter converts bounded CLI events into progress text; output cannot become executable IPC or arbitrary HTML. Keep the standalone helper authoritative for stages, locks, consumption and Git effects. Persist the child identity before displaying Running, reconnect after app restart through its run record, and distinguish a live child from an interrupted checkpoint. Cancellation requests graceful agent exit; it never rolls back committed work or clears ownership by heartbeat age.

## Format and compatibility

Optional launch/progress provenance on run records is additive with a declared reader minimum. Raw terminal streams stay private with bounded retention. No second lifecycle or server becomes authoritative; existing standalone runs remain valid. A reader that cannot interpret the new launch semantics opens read-only.

## App and skills

Add Start/Cancel and a safe progress view through narrow commands. Select the agent explicitly and show the execution directory/permissions before launch. Skills retain headless support and use the same runtime; never inject gate approval into an agent prompt.

## Risks and open questions

CLI event contracts, executable discovery, redaction and termination need adapter tests on real processes. Decide retained output limits and whether detached agents remain supervised after window close. Verify executable paths instead of allowing shell fragments; credentials remain with the agent or an explicitly configured secure store.

## Dependencies and verification

Depends on v1 run/queue/recovery, P14 skill installation and platform process adapters. Test launch failure, actual process death, app restart, live-owner refusal, cancellation during commit, gate stops and output attempting navigation/IPC injection. [Parallel runs](parallel-runs.md) adds orchestration only after one supervised checkout works.
