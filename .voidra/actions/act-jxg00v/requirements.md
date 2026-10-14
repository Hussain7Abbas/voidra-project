---
{ action: act-jxg00v }
---
## Goal
Restore VISION section 6 new-project Bootstrap: Discovery/Plan can run without an existing Git repository and leave Git absent. Only an exact approved Bootstrap implementation may initialize Git in the selected root, after durable ownership/consumption. Refuse selected repository subfolders before planning/run writes. Preserve existing approval, snapshots and commit trailers.

Diagnosis: actual temporary-file reproduction fails non-Git Feature Discovery with repository prerequisite; a selected repository subfolder starts against its parent. Evidence: .cache/p17/bootstrap-repro.json.

## Out of scope
New action kinds, remote creation, automatic Git identity configuration, Git setup before approval, nested repository manipulation and relaxed approval/write guards.
