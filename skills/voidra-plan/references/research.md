# Research

Inspect sources and answer the action's investigation question. Use questions when a prerequisite is unresolved. Follow the template's discovery guidance, but Research has no plan approval or Implement stage. Preserve source files, repository instructions, HEAD and tags.

Write a private report and call `research --token TOKEN --report FILE`:

```json
{"findings":"Evidence, source paths or links, limitations and uncertainty…","recommendation":"Concrete recommendation and tradeoffs…","ideas":[{"title":"Possible follow-up","description":"Proposed work and its reason…"}]}
```

The helper creates new backlog ideas, writes the findings/recommendation into the run result and stops at Review without a commit. An empty ideas array is valid. Proposed ideas are not accepted actions. Review rejection returns to Discovery; read the feedback, investigate again and publish a fresh result.
