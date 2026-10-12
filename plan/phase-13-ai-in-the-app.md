# P13 — AI in the app

> **Milestone:** M3 · **Needs:** P04, P06, P12 · **Status:** see [main.md](main.md)

## Outcome

Optional OpenRouter features using your own API key (VISION.md section 11). Without a key they are hidden, and everything still works by hand.

## Requirements

### In scope

- **Settings:**
  - the API key, encrypted with `safeStorage`;
  - a model picker filled from OpenRouter's model list;
  - **Test connection** and **Remove key**.
- **The five features:**
  1. turn rough notes into a clear idea or action;
  2. suggest profile answers;
  3. generate follow-up profile questions;
  4. summarise run results;
  5. draft release notes.
- **Privacy:**
  - only the text a feature needs is sent: your notes, the profile and action text;
  - source code is never sent;
  - each feature shows what it will send before the first use.
- **Errors:** missing or invalid keys, rate limits, timeouts and cancellation are handled. Results are always suggestions you accept or edit; they are never written automatically.

### Out of scope

Running coding agents from the app (v2).

## Blueprint

- Calls are made from the main process. The renderer never sees the key.
- Each feature has a small, versioned prompt in the repository, tested with recorded responses.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P13-01 | Key and model settings | 3 | — | The key is stored encrypted and never reaches the renderer. The model list loads. Test connection reports clearly. |
| P13-02 | OpenRouter client | 3 | P13-01 | Streaming, cancellation, timeouts and error handling work, tested with mocked HTTP. |
| P13-03 | Notes into ideas or actions | 3 | P13-02 | The suggestion fills the form and you edit or accept it. |
| P13-04 | Profile suggestions and follow-up questions | 3 | P13-02 | Works in onboarding and on the profile screen. Accepted suggestions are marked confirmed only when you accept them. |
| P13-05 | Run summaries and release notes | 3 | P13-02 | Summaries appear on the action page, and release notes on the Release action. |
| P13-06 | Privacy notice and the hidden state | 2 | P13-03 | The notice shows what each feature sends. With no key, every AI control is hidden. |

## Tests

- **Unit:** prompt building, which must never include file contents from outside `.voidra/`, plus the client and key storage.
- **End-to-end:** with a mocked OpenRouter server, each feature end to end; the hidden state without a key; axe.

## Failure and recovery

- Errors leave the form untouched and say what went wrong.
- Removing the key hides every feature straight away.

## Exit criteria

Every story is accepted, and a test guarantees that no source code leaves the machine.

## Hand-off

- Prompt builders receive only `.voidra/` text and what you typed. Never pass them file contents from elsewhere in the project.
