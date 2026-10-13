# General template — approved draft 1

[Documentation index](../intro.md) · [Template source](../../templates/general/template.yaml) · [P05](../../plan/phase-05-general-template.md)

**Status:** approved on 2026-10-13 by the implementing agent under the user's explicit delegated decision instruction (D24). This records delegated approval, not personal user review.

Approved template SHA-256: `b3932094b81e712543bba1c77ca35ab8397445c59c3ebc639852b53ca8504851`. The seventeen questions cover the vision's profile blocks, preserve optional unknowns and leave architecture choices to action plans. No lifecycle override weakens the required gates.

These are the questions Voidra will ask when someone sets up a project. You do not need to answer them now; review whether the list is useful. There are nine blocks and seventeen questions. Only the project goal is required at intake. The other answers can stay open and be resolved during Discovery. Existing-code intake infers answers with sources for you to confirm.

The template does not choose an architecture or override any default lifecycle. It captures constraints and references so the architecture skill can ask focused follow-ups, propose a plan and stop for approval.

## Candidate sources and selection

- [Approved vision](../../VISION.md#5-main-concepts): problem, users, features/modules, technology, design, integrations, data, delivery and constraints. Each retained block affects the Bootstrap plan or later verification.
- [P05 intake sources](../../plan/phase-05-general-template.md#in-scope): idea, architecture, technologies, libraries and design system, plus the 120x intake categories of current workflow, desired outcome, source materials and constraints. The phase supplies this intake contract; no unavailable external 120x document was assumed.
- Upstream [question rounds](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/productivity/grilling/SKILL.md) and [domain modeling](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/domain-modeling/SKILL.md) were inspected at revision 49dd158. They inform follow-up ordering, glossary work and selective ADR proposals. The template wording is original.

We omit names, personal details and speculative preferences that no later stage needs. We combine module boundaries with non-goals rather than adding an architecture questionnaire, and connect each integration to its access rules. General constraints are separate from priorities: one defines limits, the other guides trade-offs.

## Proposed questions

### Problem and outcome

Establish the useful outcome and the work it improves.

**1. What should this project make possible?**

- Answer: Paragraph. Required at intake.
- Help: Describe the problem and the useful outcome in a few sentences.
- Why: Sets the Bootstrap objective and keeps requirements tied to a useful result.
- Example: Help independent developers keep project decisions and progress beside their code.

**2. How is this work done today, and where does it break down?**

- Answer: Paragraph. Optional at intake.
- Help: Describe the current process, tools and pain points. Leave this open if the workflow is new.
- Why: Reveals existing behavior to preserve and the first end-to-end path to improve.
- Example: Plans are spread across chat and notes, so decisions disappear between agent sessions.

### People and success

Identify the people and the outcome they would recognize as success.

**3. Who will use it?**

- Answer: Short answer. Optional at intake.
- Help: Name the intended people, roles or teams and their relevant context.
- Why: Guides permissions, workflows, language and the acceptance examples.
- Example: Independent developers who build with coding agents.

**4. What would show that the first version is useful?**

- Answer: Short answer. Optional at intake.
- Help: Give one observable result, user task or measure.
- Why: Gives Verify and the review gate something concrete to assess.
- Example: A user can create an action, run it with an agent and review its result.

### Features and boundaries

Keep the first version focused and identify the boundaries that matter.

**5. What are the first useful features?**

- Answer: List, one item per line. Optional at intake.
- Help: Put one user-visible capability on each line, in rough priority order.
- Why: Defines the initial vertical slices and helps the agent avoid implementing extra features.
- Example: Create a project; Track actions; Review completed work

**6. Which modules or boundaries must be preserved, and what is outside the first version?**

- Answer: Paragraph. Optional at intake.
- Help: Describe important responsibilities, existing architecture or contracts, and explicit non-goals. Let the agent propose a design when none is chosen.
- Why: Constrains architecture and the plan's out-of-scope section without requiring a premature blueprint.
- Example: Keep planning data separate from source code. Do not launch agents from the app in the first version.

### Technologies and libraries

Distinguish existing requirements from choices the agent can propose.

**7. Which technologies are already chosen?**

- Answer: Short answer. Optional at intake.
- Help: Name required languages, frameworks and runtime versions. Leave undecided choices open.
- Why: Determines compatible tooling and prevents the agent from replacing an established stack.
- Example: TypeScript, React and Node 24.

**8. Which libraries or tools must be used or avoided?**

- Answer: List, one item per line. Optional at intake.
- Help: Put one rule on each line, including the reason when useful.
- Why: Shapes dependencies and records constraints that could justify an architecture decision.
- Example: Use the existing validation library; Avoid adding a server framework

### Design and interaction

Capture useful visual and interaction references.

**9. Which design system, references or interaction rules should it follow?**

- Answer: Paragraph. Optional at intake.
- Help: Link a style guide, describe the desired experience, or leave it open for a proposal.
- Why: Keeps interface work consistent and provides a concrete basis for visual review.
- Example: Follow the existing design tokens, support light and dark themes, and preserve keyboard navigation.

### External systems

Name the boundaries outside this project.

**10. Which external systems must it connect to, and how is access controlled?**

- Answer: List, one item per line. Optional at intake.
- Help: List each API or service with its purpose, authentication and any known limits. Do not include credentials.
- Why: Identifies integration contracts, failure cases and the external seams that can be mocked in tests.
- Example: GitHub for release metadata without authentication; Optional AI provider with a user-owned key

### Data and protection

Describe the information the project owns and the rules around it.

**11. What information does the project store or manage?**

- Answer: List, one item per line. Optional at intake.
- Help: List the main records and relationships using the project's own terms.
- Why: Establishes the domain model, storage boundaries and glossary candidates.
- Example: Projects have profiles; Actions have plans and run results

**12. Which privacy, security or data-retention rules must it respect?**

- Answer: Paragraph. Optional at intake.
- Help: Describe sensitive data, sharing boundaries, permissions, deletion or retention requirements. Do not include secrets.
- Why: Turns protection requirements into architecture constraints and testable acceptance criteria.
- Example: Keep project source local and never send it to an AI service from the app.

### Runtime and delivery

Record where users encounter the project and how it reaches them.

**13. Where will the project run?**

- Answer: Choose one, with an Other answer. Optional at intake.
- Help: Choose the main surface or describe another one.
- Why: Determines runtime capabilities, packaging and the relevant user workflows.
- Example: desktop
- Choices: a) Desktop app; b) Web app; c) Command line; d) Mobile app; e) Library or service; f) Other.

**14. How will the first version be deployed or distributed?**

- Answer: Paragraph. Optional at intake.
- Help: Name the intended environment, installation path, update method and relevant platform restrictions.
- Why: Makes deployment, installation and release work part of the Bootstrap plan.
- Example: An unsigned Apple Silicon app downloaded from GitHub Releases, with manual updates.

### Priorities, limits and references

State the trade-offs and source materials that guide later decisions.

**15. Which qualities matter most?**

- Answer: Choose any that apply, with Other answers. Optional at intake.
- Help: Choose all that apply and add other priorities when needed.
- Why: Gives the agent a basis for comparing alternatives and proposing meaningful ADRs.
- Example: simplicity; accessibility
- Choices: a) Simplicity; b) Performance; c) Accessibility; d) Offline use; e) Low operating cost; f) Other.

**16. Which constraints or fixed decisions must the work respect?**

- Answer: Paragraph. Optional at intake.
- Help: Include relevant budget, deadlines, compatibility, licensing, performance or operational limits.
- Why: Bounds scope and feasibility and prevents the agent from silently overriding a fixed decision.
- Example: Apple Silicon only, no developer account, and no authenticated agent runs in CI.

**17. Which existing documents, examples or source materials should guide the work?**

- Answer: List, one item per line. Optional at intake.
- Help: Put one project-relative file or useful reference on each line, with its purpose when helpful.
- Why: Gives Discovery an evidence trail and lets the agent find facts before asking the person.
- Example: VISION.md for behavior; docs/design-system.md for interface rules

## Review decision

Choose one in the chat:

- **a)** Approve this seventeen-question draft and continue implementation.
- **b)** Make the initial list shorter before approval.
- **c)** Change specific blocks/questions; tell me which ones.

You can also give a free-text response. Approval will name the exact template revision and date. After approval, P05 completes the architecture skill, examples, final onboarding checks and real-agent scenarios. This review is the explicit P05 product gate retained by D23; no new general phase go-ahead is needed.

## Review history

- 2026-10-13: Draft 1 prepared from the approved scope. Seventeen questions, nine blocks, one required intake answer. Awaiting your decision; no approval recorded.
