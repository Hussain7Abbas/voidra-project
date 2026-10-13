---
{
  id: act-000001,
  type: release,
  title: Release 0.2.0,
  stage: released,
  status: complete,
  doneBy: agent,
  releaseActions: [ act-000000 ],
  links: [ act-000000 ],
  createdBy: Golden verification <golden@example.test>,
  createdAt: 2026-10-14T00:00:00Z,
  assignee: Golden verification <golden@example.test>,
  releaseVersion: 0.2.0,
  releaseTag: v0.2.0,
  releaseFiles: [ package.json ],
  releaseMessage: "chore(release): 0.2.0",
  reviewDecision:
    {
      by: Golden reviewer,
      at: 2026-10-14T00:00:00Z,
      revision: 30a277aafd3cd9a093550142db01c400a348c2eed666dc08d16e5f34efca1ba9,
      decision: accepted,
      hashes:
        {
          requirements.md: 6305ea1615b5585c6b07b75c1ed925cef24dfea6a996fd49d1616c8a29f19ab5,
          blueprint.md: 1f43bab1d9d085b9b8b8cf3029432160263df334cd2b74b31a2d29f27eb6b72b,
          acceptance.md: bf735313ff560c7205091bbb34c32a1d773e9787f96a83a19880098d1e5c4b3e
        }
    },
  commits: [ abcdef0123456789abcdef0123456789abcdef0123 ]
}
---
Plan the version, release notes and changelog for the selected completed actions. Follow the repository's version and changelog conventions. Leave the exact proposal at Review; commit and tag only after acceptance.
