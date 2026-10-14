---
{ action: act-3qdarj }
---
## Approach
Build the help header using the existing PACKAGE_VERSION import. Preserve the commands string and existing help/usage exit behavior. Add a built-executable regression comparing version, both help aliases and invalid-command usage to PACKAGE_VERSION. Update the affected CLI reference and phase evidence.
## Testing seams
Real built executable stdout/stderr/status, existing CLI public helper cases and full make check.
## Proposed ADRs
None: routine correction to existing behavior.
