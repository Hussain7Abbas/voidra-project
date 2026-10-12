# Versions and migration

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/voidra.json`

Current format is 1 and package version is 0.1.0. Format 0 is an unreleased prototype migration fixture, not a claim of compatibility with an older Voidra product: its actions use state instead of stage. The sample 0→1 migration adds stage while retaining unknown/legacy data and updates metadata. Dry-run validates the target without writing; repeated migration is a no-op. Newer formats are never written or migrated downward.
