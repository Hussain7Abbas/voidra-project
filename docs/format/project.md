# Project metadata

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/voidra.json`

JSON object: `format` (nonnegative integer), `requiredVoidra` (minimum package version), `project` (`id` with prj prefix, `name`), `template` (`id`, `version`, nullable for the P03 minimal project), and `createdWith` (tool/version string). Unknown fields survive. Format 1 requires voidra 0.1.0. Unsupported newer formats stop inspection before other records are parsed; the required version comes from the metadata, never a guessed mapping.

The 1.1.0 candidate adds optional `releasePackage`, a contained project-relative `package.json` path, and `taskTracking: 1`, an explicit opt-in to release-aware task rules. Existing projects require reader **1.1.0** and a previewed migration; opening a legacy project never enables it. Fresh initialization enables tracking and Actions intent atomically, preserving Backlog/null when no package version exists. Active action records then require explicit task placement and target-release metadata; active ideas require an explicit nullable target release. Untouched completed/cancelled/rejected/promoted history may retain its legacy absence. The package selector never edits package contents or existing ticket assignments.

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

## Agentic workflow follow-up

Reader 1.2.0 `taskWorkflow: 1` opts future task producers into Planning rather than runnable TODO. Individual workflow markers, deletion fields and QA proof require this reader minimum even when project defaults are absent.

## Monorepo release discovery

Optional `releaseDirectory` selects a contained project-relative folder; `.` searches the entire project. Its highest valid X.Y.Z package version supplies the current release. With neither source field, discovery searches the project. A lone `releasePackage` preserves an existing exact selection. Saving a folder also stores its current winning `releasePackage` for older readers; current readers rediscover inside `releaseDirectory` on each read. Saving an exact package removes `releaseDirectory`. Selection never rewrites package files or ticket assignments. See [Tasks architecture](../architecture/tasks.md) for search bounds and exclusions.
