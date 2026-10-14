# Windows and Linux

[V2 index](Intro.md)

## Problem and built baseline

V1 ships only unsigned Apple Silicon macOS builds. [The process adapter](../../../tools/run-engine/src/process.ts) uses the packaged macOS helper and a non-Darwin `ps` fallback; that fallback is not proof of Windows/Linux support. [Desktop evidence](../../verification/p02.md) verifies native SQLite, sandboxed preload and arm64 packaging only.

## Proposed design

Introduce tested platform adapters for process start identity, executable discovery, secure storage, file/editor opening and packaging. Keep the shared format/writer platform-independent and preserve canonical path/symlink checks. Electron ABI-specific SQLite rebuild and packaged startup checks remain required on every supported platform/architecture. Gate support on real platform runners and physical accessibility checks; do not advertise support from compilation alone.

## Format and compatibility

No platform-dependent shared path spelling or line-ending rewrite is allowed. Existing run host/start identities remain readable; new identity encodings need a reader minimum and verifier version. Private settings may migrate independently without altering shared project IDs or source history.

## App and skills

Use native keyboard/menu conventions and accessible focus behavior. Bundle the matching process helper and platform installation instructions with standalone skills. Discover agent executables without assuming shell startup files or macOS paths.

## Risks and open questions

Decide initial architectures, installers/signing, secure-storage availability and filesystem case/rename differences. Unknown secure-storage support must disable key persistence rather than use plaintext. Investigate watcher behavior and stale PID reuse separately per platform.

## Dependencies and verification

Depends on P15 distribution and P14 asset packaging. Required seams include real ownership/recovery, atomic rename, case-sensitive paths, native SQLite, packaged startup, clipboard/menu accessibility and cross-platform reading of the same fixtures.
