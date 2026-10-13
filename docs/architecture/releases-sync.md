# Releases and outside work

[Architecture index](Intro.md) · [Release format](../format/release.md) · [Run architecture](runs.md)

P12 is in progress. The shared package and desktop currently implement release selection, source-bound Review decisions and the Releases screen. Standalone finalization, Sync and their real-agent evidence remain.

`releaseCandidates` derives completed, unreleased work from canonical actions and release records. Active selections reserve their members; cancellation releases the reservation. `createReleaseAction` takes displayed hashes and creates a ready Release at Plan, preserving member bytes and linking selected IDs. A private selection token prevents concurrent requests from claiming the same work; public actions remain authoritative. Pending runs/writes and invalid planning data refuse creation. New selections advertise reader 0.2.0.

The version-6 SQLite projection caches releases and candidates, retains complete snapshots during prepared writes and preserves undo tables during rebuilds. The app lists notes, included actions and tags. A labeled checkbox dialog creates an action through classified history; undo/redo includes the private selection token. Locks and recovery journals remain outside history.

Structured Releases carry selected IDs, proposed version and tag. The versioned proposal record must match. `readPlan` retains exact hashes of all three plan files and extends the displayed revision with selection and record metadata/body. Final status/date are bookkeeping; version, tag, members and notes remain fixed. Review fingerprints and grouped guards include the record and selected action files. Changed proposals require new acceptance. The app displays the proposal and leaves acceptance at Review/Ready for the agent. Accepted release plans/notes also enter the decision projection.

The app creates no version bump, commit or tag. Standalone effects/recovery and Sync's additive record/protected confirmations will be documented here when implemented and verified.
