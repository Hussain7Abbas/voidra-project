# Project metadata

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/voidra.json`

JSON object: `format` (nonnegative integer), `requiredVoidra` (minimum package version), `project` (`id` with prj prefix, `name`), `template` (`id`, `version`, nullable for the P03 minimal project), and `createdWith` (tool/version string). Unknown fields survive. Format 1 requires voidra 0.1.0. Unsupported newer formats stop inspection before other records are parsed; the required version comes from the metadata, never a guessed mapping.

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
