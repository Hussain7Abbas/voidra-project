# Review: QA and security

Use this procedure only when the runtime returns `taskRunKind: "quality"`. Read the action, its exact approved plan (or the recorded ungated plan), acceptance, original description, questions, all prior run/rework reports and implementation commit. Confirm the intended project and current owner; heartbeat during checks.

Run the project's required QA tests against the actual result. Cover acceptance, boundary/empty/error cases and regressions. Perform security checks appropriate to the actual change, including input validation, authorization, secrets, injection, filesystem/process boundaries and changed dependencies where relevant. Run available project security tooling and inspect the changed code; record actual commands, outcomes and source evidence. No finding may be silently waived. Do not fabricate scanner coverage, claim all vulnerabilities are eliminated or treat an unavailable required check as passing.

This is a read-only source pass. Do not edit source, stage, commit, approve, clear locks or change HEAD/tags. For a defect, report `rework` with failed checks and concrete reproductions; TODO retains the implementation and review context. For an unresolved requirement, report `questions` with the complete actionable frontier, lettered options, one recommended option and free-text support; Planning preserves prior questions, approvals and history. Do not repair code during this pass.

Write the report to `.voidra/local/quality-<run>.json`:

```json
{"summary":"Observed result and remaining issues","decision":"pass","qa":{"summary":"Actual QA scope","checks":[{"name":"Actual test command","passed":true,"evidence":"Actual observed output and tested boundaries"}]},"security":{"summary":"Actual security scope","checks":[{"name":"Actual security check","passed":true,"evidence":"Actual output or inspected source with findings resolved"}]}}
```

For `questions`, add `questions` using Discovery's proposal question shape. Use `quality --token TOKEN --report FILE`, then validate. Only its successful `pass` result means Done. Failed/stale publication preserves the run for explicit recovery; never bypass it by accepting the review yourself. A missing required tool/access is a failed or blocked check, never an invented success.
