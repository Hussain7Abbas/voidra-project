# General template and architecture proposals

[Architecture index](Intro.md) · [Template review](../templates/general-review.md) · [Template format](../format/template.md)

General 1.0.0 captures nine blocks and seventeen questions. Only the goal is required at manual intake. Open and inferred answers remain visibly unresolved. The approved revision is recorded as delegated approval under D24, not a claim of personal user review.

`voidra-architect-general` reads the profile, action, prior questions, instructions, glossary and relevant code. It asks prerequisite frontiers, proposes requirements/blueprint/acceptance, or splits work into demonstrable linked slices. Every question has a reason, one recommended option, free text and delegation. The skill persists a frontier before presenting it and stops for answers. The blueprint names public testing seams and proposes ADRs only for decisions that are hard to reverse, surprising without context and a real trade-off.

The bundled Node helper accepts proposal JSON on stdin or a report file. The shared package validates input records and the whole intended write; expected hashes protect action/question revisions and existing glossary bytes. Earlier answers survive new rounds. Plan proposals leave the action at Plan waiting with no approval; previous approval is kept in history when replaced. Slices start in Discovery, link to the parent, depend on their predecessor, and block the parent until completed. No helper approves a plan, changes source/instructions/ADR documents, or executes Git.

Direct proposals refuse an active lock, unfinished operation, running result or unfinished durable run checkpoint. Recovery belongs to the run workflow. The app is not required. P08 adds dispatch from the planning and lifecycle skills; P05 invokes the architecture skill directly.

`make gen` builds its self-contained runtime/reference and reproducible golden projects. `make gen-check` detects stale or missing output. Golden projects cover Discovery, seams/ADR, slices and Bootstrap; API and built CLI checks validate each gate. They are examples, not evidence of real-agent behavior. Phase verification separately records actual Claude Code and Codex checks.
