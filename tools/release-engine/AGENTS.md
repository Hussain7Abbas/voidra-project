# Release publication

Extends [root instructions](../../AGENTS.md). This Node-only tool owns version alignment, staged artifact checksums and GitHub/npm publication verification. It never edits project plans or runs authenticated coding agents in CI.

- One canonical stable X.Y.Z identifies the app, library/reader and all Voidra skills. Format/template versions remain independent. Preserve unknown package/skill metadata and source bodies. Alignment updates only the reader-version suffix of the newer-format compatibility diagnostic; preserve other catalog expectations. Rebuild the aligned package before generation because the Node helpers resolve its compiled workspace export.
- Pass quality and the full desktop suite sequentially before creating each new tag. Stage and smoke all artifacts before public publication; retain the original staged bytes in a source-bound CI artifact. Never rebuild changed bytes over an existing release, move a tag, clobber an asset or delete an npm version as rollback.
- Inspect GitHub, npm integrity/provenance and the original source tag before retry. Stop mismatches; report completed destinations and the remaining step. Serialize same-tag workflow runs. Published-tag lookup cannot discover drafts: use the checked GitHub CLI draft lookup and fixed-repository numeric REST ID after a 404; preserve transport/permission failures. A compatible private publisher repair may finish only the retained original bytes/source, never rebuild newer product content under that tag.
- npm publishing runs only in the exact-tag GitHub OIDC workflow; no stored npm token or local token fallback. Skills use local existing Hussain7Abbas authentication after registry verification; never change the active account or persist/print credentials.
- Tests use real temporary files/tar archives/git and mock external services only. Live test-tag results remain distinct from fixture simulations and public test versions are retained.

Keep CLAUDE.md as only @AGENTS.md with a trailing newline; update release architecture/evidence and indexes with behavior changes.
