# Sync report

The context command returns `examinedRevision`, `since` (SHA or null), and `commits` with hash, subject, author, date and parsed action trailers. Use these exact revisions and ordered commit hashes. Inspect actual diffs before making inferences. An unprocessed commit may require no planning change; include it in the examined list and explain the review in the summary.

Save JSON containing:

- `examinedRevision`, `since`, `commits`: exact context values, with commits an array of hashes.
- `summary`: what outside work you reviewed and what it means for planning.
- `profiles`: an array (possibly empty) of `{block,id,value,revision,commit,source}`. Use the template's answer type; `revision` is the SHA-256 of the current complete profile file; `commit` must be examined; `source` names the changed file and observed evidence. Do not invent evidence or clear answers to null.
- `ideas`: an array (possibly empty) of `{title,body,commits}`. Each proposal links to its examined source commits. Ideas start New.
- `actions`: an array (possibly empty) of `{type,title,body,commits}`. Types: feature, bug, improvement, docs or research. They start Ready at their lifecycle's first stage, but are not queued.

Hash profile bytes with Node's `createHash('sha256')` and `readFileSync`, rather than hashing normalized text. The helper records your configured Git identity and the time; the report must not supply an actor or human approval. Confirmed values remain untouched even when the report supplies a different value; the helper creates a draft Profile change with before/after values instead.

The apply result gives `id`, `path`, `proposals`, and `repeated`. Keep report files private. A second context after a successful sync should have no outside commits at the same HEAD. See [the generated format](format.md) for record details. Skills work with the app closed; no source or Git write is part of Sync.
