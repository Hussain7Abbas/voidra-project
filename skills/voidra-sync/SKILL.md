---
name: voidra-sync
description: Catch Voidra planning up with commits made outside its tracked
  actions. Infer source-linked profile updates, protect confirmed answers,
  propose follow-up ideas or actions, and record the examined Git revision
  without editing code or committing.
license: AGPL-3.0-or-later
metadata:
  version: "0.2.2"
  format-version: "1"
---

Read repository instructions, `.voidra/` profile, backlog and actions. Run `node <skill-folder>/scripts/sync.mjs context --project <project-root>`. It lists actual commits without valid Voidra-Action trailers since the closest reachable sync revision. If there are none, report that planning is up to date and stop without writes.

Read the listed commits and their diffs, following project instructions. Separate observed changes from follow-up work; avoid duplicating existing or rejected proposals. Use [the report guide](references/sync.md) to save a report in `.voidra/local/`, then run `node <skill-folder>/scripts/sync.mjs apply --project <project-root> --report <file>`. The helper verifies current Git evidence and profile revisions, validates template answer types, preserves confirmed answers and writes proposals plus one sync record as a recoverable group. Changed confirmed values produce draft Profile changes for human review. Do not queue, approve or execute proposals.

Validate with the genuine compatible `npx --yes voidra@0.2.2 check .`. Report inferred updates, protected answers, proposals and the sync record. A repeated examined revision reuses its existing proposals; interrupted Sync writes reconcile only their own journal and refuse live owners or outside edits. Stop and explain unrelated pending work, changed evidence or recovery conflicts. Never edit source, glossary or instructions, commit, tag, publish or invent human confirmation. The user's instructions take precedence.
