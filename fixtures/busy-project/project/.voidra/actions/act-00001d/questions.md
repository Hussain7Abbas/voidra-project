---
action: act-00001d
rounds:
  - round: 1
    askedAt: 2026-10-13T00:00:00Z
    questions:
      - id: q-000000
        text: Which option?
        why: Defines scope
        options:
          - label: a
            description: Small scope
            recommended: true
        allowFreeText: true
        answer:
          kind: agent-decides
          by: You
          at: 2026-10-13T00:00:00Z
        agentChoice:
          choice: a
          reason: Smallest useful scope
          by: Agent
          at: 2026-10-13T00:00:00Z
---
