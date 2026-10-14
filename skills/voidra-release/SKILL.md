---
name: voidra-release
description: Start a local Voidra release from completed, unreleased actions,
  creating and queueing its Release action for Go planning and exact Review
  acceptance. Does not publish releases.
license: AGPL-3.0-or-later
metadata:
  version: "0.2.2"
  format-version: "1"
---

Read repository instructions, profile and completed work. Run `node <skill-folder>/scripts/release.mjs --project <project-root>`; this uses the configured Git identity, collects eligible work and atomically creates/queues the Release at the front while preserving the existing queue order. A null action means no eligible work; do not invent members or a release.

If the user named specific actions, save `{"ids":["act-…"]}` in a private `.voidra/local/` report and pass `--report FILE`. Use the named completed, unreleased IDs; unfinished, duplicate and already-reserved work is refused. Read [the format reference](references/format.md) when interpreting records.

Validate with the genuine compatible `npx --yes voidra@0.2.2 check .`. Report the created action and queue state. This skill writes planning only: it does not bump a source version, edit a changelog, commit, tag, approve or publish. Go handles the Plan proposal, stops at human Review, and finalizes locally only after exact acceptance. Preserve unrelated edits/staging and stop on lock, stale-input or recovery conflicts. The user's instructions take precedence.
