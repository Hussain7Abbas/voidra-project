# Releases and outside work

[Architecture index](Intro.md) · [Release format](../format/release.md) · [Run architecture](runs.md)

P12 is in progress. The shared package and desktop currently implement release selection, source-bound Review decisions and the Releases screen. Standalone planning/finalization and terminal intake are implemented; Sync and the real-agent matrix remain.

`releaseCandidates` derives completed, unreleased work from canonical actions and release records. Active selections reserve their members; cancellation releases the reservation. `createReleaseAction` takes displayed hashes and creates a ready Release at Plan, preserving member bytes and linking selected IDs. A private selection token prevents concurrent requests from claiming the same work; public actions remain authoritative. Pending runs/writes and invalid planning data refuse creation. New selections advertise reader 0.2.0.

The version-6 SQLite projection caches releases and candidates, retains complete snapshots during prepared writes and preserves undo tables during rebuilds. The app lists notes, included actions and tags. A labeled checkbox dialog creates an action through classified history; new undo bodies exclude the private selection token because it is serialization bookkeeping, so an unrelated terminal release does not prevent undo. Locks and recovery journals remain outside history.

Structured Releases carry selected IDs, proposed version and tag. The versioned proposal record must match. `readPlan` retains exact hashes of all three plan files and extends the displayed revision with selection and record metadata/body. Final status/date are bookkeeping; version, tag, members and notes remain fixed. Review fingerprints and grouped guards include the record and selected action files. Changed proposals require new acceptance. The app displays the proposal and leaves acceptance at Review/Ready for the agent. Accepted release plans/notes also enter the decision projection.

The app creates no version bump, commit or tag. The runtime binds prepared files, members, version/tag and commit message in its private checkpoint. It uses a separate Git index, reuses matching run-trailer commits/tags and refuses conflicting tags or changed files. Release/members/run/checkpoint change in one durable group; verified dead-owner recovery reconciles this run’s prepared operation before Git/index effects. Prepared approved Release intent can resume its commit. Terminal intake collects and queues eligible work atomically with real Git identity. Sync remains to be implemented.

Version re-planning retains the consumed prior draft as superseded history instead of deleting it. That history no longer reserves work and is visibly labeled Superseded.
