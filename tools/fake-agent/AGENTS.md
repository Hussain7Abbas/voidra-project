# Scripted agent fixture

Extends [root instructions](../../AGENTS.md). This tool tests the app's side of the run loop; its success never counts as real-agent evidence.

Use the same run helpers and format package as the skill runtime. Only controlled scenario code edits README.md or deliberately malformed fixture records. Keep all runs in disposable Git projects, never the development repository. Real CLI scenarios own their process lock and exit/hold deliberately for interruption tests. Keep test scripts, scenario coverage and P03 evidence synchronized; no authenticated agent runs in CI.
