# CLI contract

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `voidra` executable

`check [project] [--json]` inspects without writes; `version`; `plan <action-id> [--project folder] [--json]`; `migrate [project] [--dry-run] [--json]`; `id <prefix>`; `apply <manifest.json> [--project folder] [--glossary] [--json]`; `recover <op-id> [--project folder] [--rollback] [--glossary] [--json]`; `approve <action-id> --by <actor> --revision <fingerprint> [--project folder] [--json]`. Exit 0 means success, 1 means validation/I/O/operation conflict, 2 means usage error. Manifest changes use project-relative paths, expectedHash (null for a new file) and content (null for deletion); an optional op ID enables retries. Default writes are restricted to .voidra; --glossary allows only root GLOSSARY.md additionally. Approval uses the displayed revision and validates all plan files. CLI helpers call the same package functions as app clients.

## Example

Read the project and the revision before approving its current plan:

```sh
npx voidra@0.2.2 check ./project --json
npx voidra@0.2.2 plan act-000000 --project ./project --json
npx voidra@0.2.2 approve act-000000 --project ./project --by "You" --revision "<revision returned by plan>"
```

An `apply` manifest creates a new glossary only when the caller also passes `--glossary`:

```json
{
  "id": "op-000000",
  "changes": [
    { "path": "GLOSSARY.md", "expectedHash": null, "content": "# Glossary\n" }
  ]
}
```

Pass the returned operation ID to `recover` after interruption. `--rollback` requests the recorded before state. A completed receipt is returned on a repeated matching recovery; a rollback cannot be replayed as a commit. `apply` refuses a prepared or rolled-back operation ID. `--help` and `help` list the commands. Their header and usage-error help identify the installed package version, matching `version`. `check` paths in diagnostics are relative to the selected project.
