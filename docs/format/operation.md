# Recoverable operations

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/local/operations/<op-id>.json`

JSON: op-prefixed `id`, `fingerprint`, `state` (prepared, committed, rolled-back), `changes` with project-relative `path`, expected hash, before and after UTF-8 snapshots (null means absent/deleted). Keep committed receipts for retry idempotency. SHA-256 hashes compare exact UTF-8 bytes. Operations cannot modify their own journal directory or writer lock. The private `.voidra/local/writer.lock` serializes cooperating writers; interrupted lock recovery is explicit and requires a dead owner. Journals remain local.

## Example

```json
{
  "id": "op-000000",
  "fingerprint": "0000000000000000000000000000000000000000000000000000000000000000",
  "state": "committed",
  "changes": [
    {
      "path": ".voidra/README.md",
      "expectedHash": null,
      "before": null,
      "after": "Guide"
    }
  ]
}
```
