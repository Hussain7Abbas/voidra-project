# Project metadata

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/voidra.json`

JSON object: `format` (nonnegative integer), `requiredVoidra` (minimum package version), `project` (`id` with prj prefix, `name`), `template` (`id`, `version`, nullable for the P03 minimal project), and `createdWith` (tool/version string). Unknown fields survive. Format 1 requires voidra 0.1.0. Unsupported newer formats stop inspection before other records are parsed; the required version comes from the metadata, never a guessed mapping.

The 1.1.0 candidate adds optional `releasePackage`, a contained project-relative `package.json` path (root by default), and `taskTracking: 1`, an explicit opt-in to release-aware task rules. Enabling tracking requires reader **1.1.0** and a previewed migration; opening a legacy project never enables it. Active action records then require explicit task placement and target-release metadata; active ideas require an explicit nullable target release. Untouched completed/cancelled/rejected/promoted history may retain its legacy absence. The package selector never edits package contents or existing ticket assignments.

## Example

```json
{
  "format": 1,
  "requiredVoidra": "0.1.0",
  "project": {
    "id": "prj-000000",
    "name": "Example"
  },
  "template": null,
  "createdWith": "voidra/0.1.0"
}
```
