# Discovery

Inspect code, tests, project profile, existing/rejected ideas, action history and related work before deciding what is missing. For a Feature, establish that the behavior is neither already built nor previously rejected; summarize the evidence. For a Bug, reproduce, shrink the example, state a hypothesis, instrument only when needed and identify the root cause; record the planned regression seam. For Profile change, inspect changed answers and explain the impact on code, documents and open actions.

Questions form one prerequisite frontier: include every question that can be answered now, exclude those depending on open answers. Each has a reason, lettered options, one recommendation and free text. The helper supplies IDs and timestamps. Never fill human answers. Explicit agent-decides answers may be resolved with `choices`, recording option, reasoning, agent and time, before continuing.

Use the template in `.voidra/voidra.json`: read the exact matching bundled file `references/templates/<template-id>/template.yaml` relative to this skill's folder (for general, `references/templates/general/template.yaml`), then read its declared architecture skill's SKILL.md and relevant guides. If absent or incompatible, fail clearly. Follow its architectural reasoning, but use this active run's helper to publish the proposal; the standalone architecture helper must not acquire a second owner. Include the dispatched skill name and profile evidence in the proposal summary.

A question proposal is `{ "action":"act-…", "kind":"questions", "summary":"…", "questions":[{"text":"…", "why":"…", "options":[{"label":"a","description":"…","recommended":true},{"label":"b","description":"…","recommended":false}]}] }`.

During Discovery only, optionally supply `glossary` as the complete existing root GLOSSARY.md followed by settled-term additions. Preserve its bytes and definitions. Never write the glossary directly or follow a symlink. Read-only investigation must preserve source files, HEAD and tags; if reproduction requires code changes, propose the regression in the plan rather than performing it before approval.

A human-only step uses `human` with `{ "title":"…", "description":"Concrete instructions…", "steps":["Step one", "Step two"] }`. It blocks the active action and releases the lock. Never claim the person completed a step.
