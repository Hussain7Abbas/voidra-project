---
{ action: act-000000 }
---
## Approach
Dispatched voidra-architect-general. Extract normalization while preserving the public names(values) result; expand helper, migrate caller, remove duplicated logic after regression checks.

## Testing seams
Public exported functions, real temporary files and CLI input/output. Test failing behavior before implementation; mocks only outside the project.

## Proposed ADRs
None: this reversible local change does not meet the lasting-decision threshold.
