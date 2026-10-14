# Scripted agent fixture

Extends [root instructions](../../AGENTS.md). This tool tests the app's side of the run loop; its success never counts as real-agent evidence.

Use the same run helpers and format package as the skill runtime. Only controlled scenario code edits README.md or deliberately malformed fixture records. Keep all runs in disposable Git projects, never the development repository. Real CLI scenarios own their process lock and exit/hold deliberately for interruption tests. `src/gates.ts` publishes scripted rounds, assumptions, plans and synthetic result records for app-side P07 checks. Its fixture commit identity is not real Git/agent evidence. These fixtures write only planning records. Keep test scripts, scenario coverage and verification evidence synchronized; no authenticated agent runs in CI.

- Scripted release cases edit only the fixture package version and existing changelog after exact Review acceptance. Their commits/tags use the real run helpers; they prove the app/runtime boundary and never count as authenticated-agent evidence.

- Scripted Sync uses actual Git context and the shared report helper to propose one fixture idea; repeat runs leave it unchanged. It checks desktop suggestion refresh and planning-only boundaries, not real-agent inference quality.
