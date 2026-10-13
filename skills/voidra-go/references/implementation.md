# Implement, Verify and Commit

Read the exact approved plan and saved Review feedback. Docs/chore uses its description without a plan gate. Before each edit batch, write the exact relative paths as a JSON array in `.voidra/local/paths-<run>.json` and call `guard --token TOKEN --report FILE`. The guard checks approval bytes, consumed inputs, ownership and pre-existing user changes. Preserve unrelated edits and staging; if overlap cannot be separated, fail clearly.

Test first at the agreed public seams: demonstrate a failing behavior test, implement the smallest fix, then repeat. Mock only external services, time or randomness. Bugs require a reproducing regression test. Follow repository instructions for checks and message style. Record actual results; never replace a failed check with a claim that it passed.

Write an ADR only for an approved decision that is hard to reverse, surprising without context, and a real trade-off. Record the context, alternatives, accepted choice and consequences, linking its action. Keep smaller choices in the action. Preserve existing ADR naming; otherwise use docs/adr/YYYY-MM-DD-title.md with the actual decision date. Add settled project terms with short definitions to GLOSSARY.md through this action, preserving existing definitions. Never invent agreement or overwrite a definition to fit implementation; request a new decision if the approved meaning must change. Include these documentation paths in the guarded edit batch and verification report.

After project checks, review twice: (1) repository standards and AGENTS.md, (2) requirements, blueprint and acceptance. Fix all findings and rerun relevant checks before commit. Report both parts even for Docs/chore. Use this private report:

```json
{"summary":"What changed; test-first evidence and remaining issues…","paths":["src/example.ts","tests/example.test.ts"],"checks":[{"name":"Actual command or boundary","passed":true}],"reviews":{"standards":{"passed":true,"summary":"Rules inspected and findings resolved…"},"plan":{"passed":true,"summary":"Acceptance covered and findings resolved…"}}}
```

`prepare` persists the Verify result at Review; `commit` makes one commit for this action or slice, using its message style and both trailers; `finalize` records the hash and releases the lock. The helper preserves unrelated staged entries. Do not stage, commit, amend or push yourself. After Review rejection, implement the saved feedback and create a follow-up commit with the same action trailer and a new run trailer. Never repeat a checkpointed commit after interruption.
