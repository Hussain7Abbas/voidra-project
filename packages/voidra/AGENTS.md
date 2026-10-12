# Voidra format package

Extends [root instructions](../../AGENTS.md). This package is the shared contract for the app and skills; keep runtime code free of Electron, UI, git side effects and authenticated agents.

- `src/index.ts` exports public helpers; `src/cli-entry.ts` is the thin executable adapter. Local imports use `.ts` and build to `.js` under ignored `dist/` with declarations.
- `src/records.ts` preserves bytes and YAML node comments. Schema/body checks belong in `schemas.ts`; whole-project rules belong in `project.ts`; disk mutations use `writer.ts`. Lifecycle transitions remain pure.
- Every object schema preserves unknown keys. The public grouped writer checks expected hashes and the entire intended overlay before a durable prepared journal. It never writes code files; only an explicit flag permits root `GLOSSARY.md`.
- Tests in `tests/` use real temporary folders. Failure injection belongs at explicit public checkpoints; test actual process death/rename errors as well. Do not mock the filesystem.
- `scripts/generate.ts` produces schemas and shared references. Regenerate with `pnpm gen` whenever the contract changes. `pnpm gen:check` rejects missing, stale and orphan output.
- `scripts/fixtures.ts` builds the committed catalog and generates a separate large project. `pnpm fixtures` updates snapshots deliberately; do not regenerate expectations to hide a failure. `new-project` is minimal until P05 supplies actual template output.
- Package publication requires passing checks, built-artifact smoke tests and CI. Keep AGPL license, repository metadata and bin entry in the npm archive. npm account access is required; never print credentials.

Update the corresponding [format page](../../docs/format/Intro.md), API docs and generated references with every schema/API change. Keep sibling CLAUDE.md as `@AGENTS.md` plus newline.
