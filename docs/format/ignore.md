# Local files

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/.gitignore`

Plain UTF-8 text containing `local/` as an ignore rule. Local queue, locks, journals and writer lock must never be committed. Checking the rule does not prove git has not force-tracked a local file; P09 guards planning commits separately.

## Example

```text
local/
```
