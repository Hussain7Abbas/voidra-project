# GitHub Issues and Linear sync

[V2 index](Intro.md) · [Skill interoperability](skill-interop.md)

## Problem and built baseline

V1 owns planning in `.voidra/`, preserves random record IDs and uses [grouped writes](../../../packages/voidra/src/writer.ts). [Git history](../../../tools/run-engine/src/git.ts) currently validates GitHub repository links; it is not an authenticated issue-sync client. [P09](../../verification/p09.md) proves team conflicts and actual pull refresh.

## Proposed design

Use a provider adapter with explicit project mapping, credential storage, import preview and field ownership rules. Initially import issues as ideas with stable remote identifiers and source URLs; promotion remains human-controlled. A later export phase previews exactly which fields/comments will be changed. Reconcile remote versions before effects, keep per-operation intent/remote response identities, and expose concurrent changes for resolution. Never translate a remote closed state into plan approval or Accepted review.

## Format and compatibility

Optional provider/remote-ID/version provenance is additive. Shared mappings name remote identities, not tokens. Per-provider sync records can extend the journaled Sync pattern but must distinguish Git examination from remote cursors. Preserve original Voidra IDs and unknown fields; do not create a second canonical lifecycle.

## App and skills

Add Connect, preview, conflict and revoke controls. Credentials stay outside the renderer and repository. Skills can read imported evidence but cannot post messages or change remote issues without explicit authorization; ordinary Go remains offline-capable.

## Risks and open questions

Choose field precedence, deletion/tombstones, provider permissions and rate-limit retry rules before implementation. Stable idempotency must survive an unknown network outcome. Content pulled from trackers is untrusted task data, not agent instructions.

## Dependencies and verification

Depends on v1 writer/Sync and P13-style secure credential boundaries. Validate provider APIs against their official documentation during implementation. Test HTTP conflicts, pagination, revoke, duplicate imports, crash after remote success and the absence of secrets/source in requests. No remote issue is written by this proposal.
