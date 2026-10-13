---
{
  action: act-000000,
  rounds:
    [
      {
          round: 1,
          askedAt: 2026-10-13T00:00:00Z,
          questions:
            [
              {
                  text: Who may read a project?,
                  why: Ownership determines the authorization and persistence boundaries.,
                  options:
                    [
                      { label: a, description: Only its owner, recommended: true },
                      { label: b, description: A shared team, recommended: false }
                    ],
                  id: q-000000,
                  allowFreeText: true
                },
              {
                  text: Must notes work offline?,
                  why: Determines whether network availability can block saving.,
                  options:
                    [
                      { label: a, description: "Yes, all note work is local", recommended: true },
                      { label: b, description: "No, a connection is required", recommended: false }
                    ],
                  id: q-000001,
                  allowFreeText: true
                }
            ]
        }
    ]
}
---
