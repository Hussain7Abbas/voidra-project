# V2 designs

[Architecture index](../Intro.md) · [Documentation index](../../intro.md) · [Approved scope](../../../VISION.md#14-scope)

These are future designs, reviewed by the implementing agent under delegated decision D24. No v2 feature, schema or migration is implemented. Their baseline is the built standalone run engine, grouped writer, typed desktop bridge, per-project utility/index and source-linked planning through P12. Optional AI, production skill installation and release distribution remain dependencies on P13–P15; they are not assumed built.

| Vision item | Design | Phase story |
| --- | --- | --- |
| 1. Start agents in the app with live progress | [Agent launch](agent-launch.md) | P16-01 |
| 2. Parallel runs through Git worktrees | [Parallel runs](parallel-runs.md) | P16-01 |
| 3. Community templates | [Template sharing](template-sharing.md) | P16-02 |
| 4. Roadmaps, milestones and sprints | [Planning views](planning-views.md) | P16-03 |
| 5. Progress and Git dashboards | [Dashboards](dashboards.md) | P16-03 |
| 6. voidra-report | [Reports](reports.md) | P16-03 |
| 7. Assisted reverting | [Reverts](reverts.md) | P16-04 |
| 8. Windows and Linux | [Platforms](platforms.md) | P16-05 |
| 9. Cross-project overview | [Project overview](project-overview.md) | P16-03 |
| 10. GitHub Issues and Linear sync | [Issue trackers](issue-trackers.md) | P16-05 |
| 11. Maps for unclear work | [Maps](maps.md) | P16-02 |
| 12. Prototype action type | [Prototypes](prototypes.md) | P16-02 |
| 13. Retros after runs | [Retrospectives](retrospectives.md) | P16-04 |
| 14. Architecture check-ups | [Architecture check-ups](architecture-checkups.md) | P16-04 |
| 15. mattpocock/skills issue-tracker interoperability | [Skill interoperability](skill-interop.md) | P16-05 |

Each proposal records compatibility and dependency choices. Open questions concern its future implementation; none requires changing a v1 decision now. Format changes must follow [compatibility policy](../../compatibility.md), advertise a matching reader and preserve unknown fields. Proposed records/directories are descriptions only.
