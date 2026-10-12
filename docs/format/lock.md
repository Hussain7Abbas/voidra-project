# Run lock

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/local/run.lock`

JSON: `ownerToken`, positive `pid`, `processStartedAt` (process-start identity string), `agent`, `host`, `run`, `action`, `startedAt`, `heartbeatAt`. P03 supplies acquisition/liveness/heartbeat orchestration. A stale timestamp alone is not authority to clear a live process lock.

## Example

```json
{
  "ownerToken": "owner",
  "pid": 123,
  "processStartedAt": "identity",
  "agent": "codex",
  "host": "localhost",
  "run": "run-000000",
  "action": "act-000000",
  "startedAt": "2026-10-13T00:00:00Z",
  "heartbeatAt": "2026-10-13T00:00:00Z"
}
```
