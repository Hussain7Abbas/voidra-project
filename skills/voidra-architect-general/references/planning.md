# General architecture procedure

Use the supplied target ID. If none was supplied, read `.voidra/local/pending-actions.md` and verify the target is unblocked, done by agent, in Discovery or Plan. Inspect existing code, profile answers, linked actions, rejection reasons and repository rules; lookup facts yourself. Architecture proposals are planning-only and make no Git changes.

## Discovery frontiers

Group questions by prerequisites, not topic count. Ask every independent scope-changing question now; wait before dependent detail. Reuse existing answered questions. The helper assigns valid random question IDs and appends a round. In subsequent rounds `dependsOn` names answered IDs from earlier rounds. It refuses an unanswered question or unresolved delegated choice. A person's `agent-decides` answer requires a recorded `agentChoice` with choice, reason, actor and time, not a confirmed profile answer.

Every question requires `text`, `why`, and options `{label, description, recommended}`. Exactly one option is recommended; letter labels are easiest to use in chat. Free text is enabled automatically. Examples are illustrative, not answers to infer for an actual project.

Run `node <skill-folder>/scripts/architecture.mjs` with real JSON on stdin. In a restricted shell use a quoted `printf` pipeline or a subprocess with its `input` parameter, rather than relying on shell heredoc temporary files. For example, a Python subprocess can send `json.dumps(proposal)` directly to the helper. A report file must already exist inside an allowed project folder.

Question input:

```json
{"action":"act-000000","kind":"questions","questions":[{"text":"Who can read a saved project?","why":"Defines the authorization boundary before choosing storage.","options":[{"label":"a","description":"Only its owner","recommended":true},{"label":"b","description":"A shared team","recommended":false}]}]}
```

Optional `revision` is SHA-256 of the exact action bytes last read. Optional `glossary` supplies complete root GLOSSARY.md text; read and preserve existing definitions first. Use it only for settled terms, not unanswered alternatives. The grouped writer rejects symlinks and outside changes; inspect errors rather than rewriting expected hashes blindly. Do not retry an ambiguous write without checking its durable operation journal.

## Plans

Input: `{"action":"act-…","kind":"plan","requirements":"…","blueprint":"…","acceptance":"…"}`. Markdown body strings have actual newline characters. The helper adds frontmatter and moves to Plan waiting with no approval. It preserves earlier approvals in history when replacing a plan.

Requirements contain `## Goal` and `## Out of scope`, concrete user behavior, constraints and relevant references. Blueprint contains `## Approach`, `## Testing seams`, `## Proposed ADRs`. At seams test observable behavior through public APIs and real storage/Git; mock only external services, time and randomness. Plans name tests before implementation. Acceptance is a checklist of observable results, including relevant failure/recovery behavior.

Propose an ADR only when **all three** hold: hard to reverse, surprising without context, and a real trade-off. Explain evidence for each criterion. Otherwise say none; small choices stay in this action. Name the proposed file by date and title unless the repository already has an ADR naming convention. Do not create ADR files during planning. Do not approve your own plan or implement it, even when the invocation asks for Bootstrap. App approval later covers exact bytes of all three files; any change invalidates it.

Bootstrap translates confirmed profile answers into the smallest useful running project, its conventions, agreed glossary and verification. Unknown stacks or users that affect the plan need a question first. Avoid unnecessary infrastructure. Include compatibility, privacy and design constraints supplied by the profile.

## Slices

Input: `{"action":"act-…","kind":"slices","slices":[{"title":"Save and reopen one project","description":"Persistence, service and screen for one owner, with public save/load tests."},{"title":"Delete a saved project","description":"Deletion through storage, service and screen, with recovery and deletion tests."}]}`.

At least two slices are required. The helper creates linked Feature children, chains each after the preceding child, and blocks the parent on all children. Each slice is a demonstrable thin path, not a horizontal layer. Plan the first unblocked child independently; do not start code. Human account/certificate tasks are surfaced as requirements for the dispatcher to create human blockers in P08, never guessed as completed.

## Examples and validation

Repository golden projects cover Discovery, seams/ADR, slices and Bootstrap; distributed skills use this procedure and their local generated format reference. Verify every real proposal with `npx --yes voidra@1.1.1 check .`, inspect allowed paths, and report its question/plan/slice gate. No code, commits or tags are permitted.
