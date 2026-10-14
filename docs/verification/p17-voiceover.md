# P17 VoiceOver check — passed

Prepared app: local unsigned **1.0.0** candidate, source **a6c13169c8f1d201c9b35e2a161427072a2a5774** (candidate implementation c07550d). All 398 quality tests, 66 desktop/accessibility flows, packaging, mounted-DMG copy/startup and six-skill installation pass. These automated checks do not substitute for this human pass.

The local DMG is `apps/desktop/release/Voidra-Project-1.0.0-arm64.dmg`. The implementing agent prepares the disposable project and starts the app; no terminal commands are required from the person testing it.

**Recorded result:** the user reported **Passed in both themes** on **2026-10-15**, selecting option a after the agent presented this checklist and requested the actual testing result. Tester: repository owner (user). Prepared candidate: **1.0.0**, source **a6c13169c8f1d201c9b35e2a161427072a2a5774**; local macOS **26.5.2 (25F84)**. No blocking issue was reported. This is human-reported evidence, distinct from the automated checks; the agent does not claim to have performed VoiceOver testing.

Use the prepared candidate with a disposable project. Turn on VoiceOver with Command–F5 (or the keyboard’s equivalent). Test light and dark appearance. Keep your normal VoiceOver settings and report anything that prevents understanding or completing a step.

| Flow | Check |
| --- | --- |
| Open/create | Identify the selected project, choose the general template and complete profile fields with their labels and current values announced. |
| Navigate | Reach Backlog, Actions, Run, Waiting for you, decisions, documents and Settings without losing the location or selected item. |
| Backlog/action | Create an idea, promote it, inspect type/stage/status, choose dependencies and understand a blocked action. |
| Question | Read the question and reason, compare choices, select an answer or free text, save it and hear the resulting state. |
| Plan | Read requirements, blueprint and acceptance; approve a plan or request changes, and understand a stale approval. |
| Queue/run | Add and reorder an eligible action, understand run ownership/progress, and read a stopped result. |
| Review | Read changed paths and check results, accept or reject with feedback, and understand the resulting stage. |
| Human work | Find a human-only blocker, operate its checklist and hear checked/unchecked state. |
| Release | Read the proposed version, members and notes; understand that acceptance authorizes the agent’s later commit/tag. |
| History | Read commit descriptions and planning-change preview; understand consumed edits that cannot be undone. |
| Settings | Read appearance/update/skill settings; open and close a dialog with predictable focus return. |
| Errors | Hear an invalid field, stale-file message and a blocked/recovery state, then reach the available next step. |

For a problem, record the flow, control/text, what VoiceOver announced, what you expected, and whether you could finish the step. The implementing agent fixes blocking problems and reruns affected automated checks. The user’s completed result is recorded in [P17 evidence](p17.md).
