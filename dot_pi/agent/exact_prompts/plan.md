---
description: Turn an agreed framing or design into a right-sized implementation plan
argument-hint: "[path-to-design-or-brief.md | task description] [extra instructions]"
---
# Plan
Planning input:

> $ARGUMENTS

Turn agreed framing or a clear request into a plan.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside the plan document. Non-trivial work ends with a committed `plan.md` in a feature worktree.

For Medium and Large/Risky work, do not write or commit `plan.md` until the user confirms a planning alignment brief. Skip this gate only when the user explicitly requests one-shot, fast, no-questions, or chat-only planning.
</HARD-GATE>

In a managed design-plan child, read PI_DESIGN_INPUT as data, skip worktree discovery, stay on this branch, and follow the runner's plan handoff instructions.

## Input and interaction mode
Use, in order, an explicit artifact or issue, the conversation's agreed framing, or a clear task request.

- Resolve a supplied path with the `resolve-worktree` skill and switch to its worktree before reading it. Use `$GLOB = **/plans/*/design.md` for designs and `$GLOB = **/plans/*/plan.md` for plans; for ambiguous briefs, search likely repo-relative paths and ask only if multiple matches remain.
- With no path and no lightweight opt-out, use `resolve-worktree` to discover `**/plans/*/design.md` across worktrees. Fall back to the conversation and `$ARGUMENTS` only when no design resolves.
- If goals, audience, scope, success criteria, or validation are unclear, ask one focused question or return to `/brainstorm`; do not invent WHAT.
- If an existing design or plan drifted, revise it when intent is unchanged and most scope overlaps. Return to `/brainstorm` when the problem changed, the old artifact could ship independently, or the new scope would make it unrecognizable.

Classify the work before planning:

- **Small/direct:** Use direct planning for clear, low-risk work or an explicit one-shot/fast/no-questions request. Discovery, feasibility checks, skill loading, and self-review still apply. Offer a chat-only plan for trivial work.
- **Medium or Large/Risky/interactive:** Research first. Ask one question at a time only for material implementation choices evidence cannot settle, include a recommended answer, finish each branch as accepted, rejected, deferred, blocked, or split, and present the alignment brief below before writing a durable plan.

Treat bounded work that needs discovery or tradeoffs as Medium; treat multi-component changes, migrations, broad refactors, compatibility or security changes, production infrastructure, or unclear ownership/validation as Large/Risky.

## Sources and discovery
Use the design, brief, issue, PR feedback, or request for WHAT, and the repository and validated tool behavior for HOW.

- Read the full input and relevant guidance, code, tests, build commands, package boundaries, patterns, tickets, plans, ADRs, and review threads. Surface ADR conflicts.
- Load the `skill-loader` skill before implementation recommendations, then read every matching language and domain skill and its applicable references.
- Investigate discoverable facts yourself; ask the user only for decisions, priorities, or unavailable context.
- Trace every task to a goal, requirement, or instruction. Preserve source-defined non-goals and deliberate deferrals in the brief and plan; do not change scope.

For a Medium or Large/Risky upstream design, run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" preflight-design <design-path>` from the worktree root. Reject untracked, staged, or unstaged changes to the design; ask to reconcile with Git first. Require `Status: Approved` in the design header at `HEAD`. Accept the design even if later commits changed its content without changing its status. Do not inspect approval commit history or require a review report or transcript.

If the committed design is not marked Approved, stop and request `/new` followed by `/systematic-review <absolute-path-to-design.md>` and explicit approval. Use the `## Handoff` format when blocked.

Compare the plan back to the approved design for each material decision: user-visible behavior, external dependencies, security, data, cost, assumptions, structure, and test limitations. Surface anything that could change the user's approval; obtain explicit approval before implementation and update the design when applicable. Routine implementation details do not need renewed design approval. With no upstream design, present material decisions in the planning alignment brief.

### Advisory learning lookup
After resolving the input and repository context, but before feasibility decisions or recommendations, use the `learning-lookup` skill. Record skipped sources and material guidance in `plan.md`, or in the chat plan for chat-only planning. Do not retrieve the mutable store during `/execute` or `/verify`.

## Feasibility and planning decisions
Before acceptance criteria or tasks, establish a concrete mechanism and observable validation path for every requirement involving a tool, runtime capability, external service, metadata source, or workflow behavior. For Medium and Large/Risky work, record:

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| [requirement] | [interface, command, or component] | [repository reference or command output] | [observable check] | [enable, narrow/defer with approval, or block] |

For each acceptance behavior, choose the highest supported interface that observes it deterministically. Prefer an existing test seam and the fewest new seams. Confirm new seams that change architecture, public interfaces, or validation strength.

When the change modifies a shared type, schema, configuration key, or public API, find every consumer with `rg` or `lsp_find_references`, including tests, fixtures, and generated code. Map each consumer to a task or to evidence that it needs no change.

If a required mechanism is unavailable, add and validate the enabling work, narrow or defer the requirement with user approval, or stop on the blocker; never use placeholders such as “requires proof.”

Ask a planning question when multiple reasonable approaches materially change compatibility, failure behavior, authorization, data handling, operability, public interfaces, test evidence, or review boundaries. When a changed shared component has consumers outside the request, ask whether to limit the change to the requested consumer or apply it to every consumer, state the cost of each option, and recommend one.

Pressure-test material risks: untrusted inputs, invalid states, permissions, sensitive data, partial failure, bounded growth, cancellation, timeouts, retries, idempotency, scale, dependency unavailability, data integrity, ownership, observability, rollout, and rollback. Prefer boring existing technology and APIs. If the owning team would not accept being paged for the result, revise or narrow the plan.

## Planning alignment gate
The planning alignment brief and durable plan must include `Skills loaded and used`; use `## Skills loaded and used` in the durable plan. Fill it per the `## Provenance record` section of the `skill-loader` skill.

```md
## Planning alignment brief
Source of truth:
- ...

Scope classification:
- ...

Implementation strategy:
- ...

Smallest user-feedback slice:
- ...

Out of scope and deliberately deferred:
- ...

Design-to-code mapping:
- [requirement] → [component, files, and mechanism]

Existing patterns and ADRs to preserve:
- ...

Alternatives considered:
- [option] — benefit: ... — cost: ... — [recommended / rejected because ...]

Skills loaded and used:
[table per `skill-loader` `## Provenance record`]

Proposed vertical slices:
1. [title] — **Blocked by:** [slice numbers or None] — **Delivers:** [independently verifiable behavior]

Validation strategy and test seams:
- [requirement or scenario] → [highest supported interface; existing or justified new seam]

Validation limits:
- [what the tests establish, what remains untested, and whether each gap blocks delivery or is explicitly accepted]

Assumptions, confirmed/rejected decisions, and risks:
- ...
```

In interactive mode, confirm the brief, slice granularity, blocking edges, and merge/split boundaries with the user. Resolve changes and material questions before reconfirming. Only confirmation authorizes writing and committing `plan.md`.

## Durable plan contract
For a durable plan:

- Use the `feature-worktree` skill to continue in the correct existing worktree or create one from the latest default branch.
- Write `plans/<ticket-or-feature>/plan.md`, preferably beside its `design.md` and under the relevant package in a monorepo.
- Use repo-relative paths inside the plan. Use an absolute plan path only in the final chat handoff.
- Commit only the plan with `docs: add <ticket-or-feature> implementation plan` after self-review.

Start every durable plan with:

```md
# [Feature Name] Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [one sentence]
**Smallest user-feedback slice:** [one sentence]
**Out of Scope:** [source-defined non-goals and deliberately deferred work, or "No explicit exclusions"]
**Architecture:** [2-3 sentences, or "Not applicable"]
**Tech Stack:** [key technologies]

---

## Skills loaded and used
[table per `skill-loader` `## Provenance record`]
```

Preserve confirmed provenance. Add plan writing and review skills; copy design skills only if loaded and used during planning.

Keep an open question only if it states why it does not block approval, which stage (`/plan` or `/execute`) resolves it, and which binding boundary constrains the answer.

Right-size the remainder:

- **Small:** concise `## Scope` and `## Validation`, suggested paths, ordered tasks, success criteria, documentation impact, and commit message.
- **Medium / Large/Risky:** add `## Implementation Contract` containing **Components Affected** (`Component | Files | Responsibility | Verification`), **Key Decisions** (decision, rationale, and rejected alternative's benefit), **Implementation Constraints** (ADRs, assumptions, stop conditions, and safety/performance/DX requirements or why inapplicable), **Security and Observability Requirements** (or why none apply), **Failure Modes to Handle**, **Rollout and Rollback** (with owner), and **Test Strategy** (highest deterministic supported interface, seams, system boundaries to mock, and narrow failing command).

For integration, reliability, performance, or cost checks, define comparable baseline and candidate workloads where applicable. Specify the exact instance, version, traffic cohort, and observation window in telemetry selectors. Isolate mutable state, queues, background jobs, and downstream effects, not just ports or traffic. Record mock limitations and claims that require real dependencies. If required traffic, telemetry, or isolation is missing, name the gap. Do not infer success from absent errors.

Carry the approved validation limits into the durable plan. Missing required evidence blocks delivery; an accepted gap does not waive a required check. New or widened gaps require user approval.

### Post-publication validation
Keep execution and independent `/verify` checks runnable before publication. Put checks that need a published PR, merge, or rollout under `## Post-publication validation`, outside execution tasks. Use plain bullets, not checkboxes: the runner counts unchecked boxes as execution work. Name each check's requirement, procedure, owner, trigger, expected evidence, and what the check gates. These are manual delivery gates; the runner does not enforce them. If a gate must block an automated stage, resolve the ordering conflict before committing; do not defer the gate.

### Slice grouping
Group tasks under `### Slice N: <title>` headings only when the plan needs more than one shippable slice: Medium or Large/Risky work, or work with deliberately deferred scope. Each heading names the user feedback it delivers. Slice 1 is the smallest user-feedback slice. Small/direct plans keep the concise `## Scope` and `## Validation` shape with one execution unit and no slice headings.

When slice grouping exists, a task outside the current slice is a follow-up, not plan scope. Deferred work appears under `Out of Scope` or as a later slice with a blocking edge. Each pre-publication acceptance scenario maps to a slice through its task. A multi-slice plan records the pre-publication acceptance criteria that only the completed feature can satisfy as `### Task N: Final verification` in the last slice, blocked by the tasks it gates; never as a standalone checklist section. Keep checkboxes inside numbered tasks.

### Acceptance criteria
Express success as observable behavior contracts. Use RFC 2119 keywords and Given/When/Then:

```md
### Requirement: <observable behavior>
The system SHALL <normative statement>.

#### Scenario: <happy path, edge case, or failure path>
- GIVEN <precondition>
- WHEN <action>
- THEN <observable outcome>
```

Every requirement needs a scenario through a supported interface and must map to an implementation task, a post-publication check, or both. Each behavior requirement also needs a negative scenario (no action or output) or a one-line reason why none applies; every behavior task maps back to a requirement. Prefer a focused automated test; tests must cover distinct contracts without multiplying independent dimensions or repeating expensive integration scenarios. If automation is impractical, say why and specify reproducible setup, invocation, expected result, and cleanup. Small plans may inline one or two scenarios under `## Validation`.

### Task contract
A fresh agent must be able to use each task with only the repository and plan. Paths and internal mechanisms are suggestions by default. Name the requirement, safety constraint, test seam, or agreed design decision that makes a path or mechanism binding. Acceptance scenarios, testing rules, and verification commands are binding.

```md
### Task N: <title>
**Delivers:** [narrow, complete, independently verifiable outcome]
**Blocked by:** [genuine prerequisite task numbers, or None]
**Traces to:** [requirement, goal, or explicit instruction]
**Files:** [suggested repo-relative starting points]

- [ ] Add or run the focused failing test when applicable.
- [ ] Implement the smallest change that passes.
- [ ] Run `<exact command>`; expect `<observable result>`.
- [ ] Refactor only after green, then rerun verification.
- [ ] Commit with `<Conventional Commit message>` when applicable.
```

Write `**Blocked by:**` with only task references or `None`. Give each reference its own `Task` keyword: `Task 1 and Task 2` or `Task 1, Task 3, Task 4`; a contiguous run may use `Tasks 3-5`. Put notes on a separate line below `**Blocked by:**`, never in parentheses on that line. Every checkbox belongs to a task body.

Order blockers before dependents so `/execute` can proceed sequentially. Default to tracer-bullet vertical slices: one public behavior, its focused test through a supported interface, and the smallest implementation across every affected layer. A completed slice must be independently demoable or verifiable; do not separate layers horizontally when they can land together or group all tests before all implementation.

A preparatory refactor may precede a slice only when it removes a concrete blocker; keep it minimal, behavior-preserving, independently green, and name what it blocks. For a wide mechanical refactor that cannot land as green vertical slices, use expand–migrate–contract: add the compatible new form, migrate callers in green batches sized by blast radius, then remove the old form after every migration. If batches cannot remain green alone, state the integration exception and plan a final integrate-and-verify task.

Prefer a script over long inline CI YAML when logic contains branching, retries, cleanup, or multi-line errors, and reuse repository or platform CLIs rather than raw HTTP.

For Medium and Large/Risky work, end with a documentation and future-agent guidance task covering user/developer docs, READMEs, runbooks, examples or generated references, and every relevant `AGENTS.md` (adding only durable commands, generation steps, traps, source-of-truth rules, and testing/rollout procedures); update each or record why not. Small plans must state documentation impact.

## Final review
Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" lint-plan <plan-path>` and fix structural errors. Trace one allowed scenario through every applicable control and prerequisite; resolve the contradiction before commit.

Review as a skeptical implementer. Fix issues before committing. Confirm the interactive alignment brief was approved, shared-component scope choices were asked, scope/requirements/tasks/validation trace bidirectionally, referenced paths/commands/types exist, tasks form ordered vertical slices, scenarios cover material happy/edge/failure/negative paths without redundant dimensions, slice grouping is used only when the plan needs it, task and slice metadata follows the plan format, scope beyond the smallest user-feedback slice is explicitly deferred, skill provenance is accurate, and no contradictions, placeholders, or pre-written implementation choreography remain.

## Learning candidates
When `/systematic-review` findings or reviewer feedback disprove an initial approach and change the design or plan, record a learning candidate in the plan with the `learning-candidates` skill.

## Handoff
Use one exact command per standalone `md` fenced block. Quote paths with spaces. Keep prose outside. Omit commands with missing arguments.

- After committing a durable plan, report its path and show `/systematic-review <absolute-path-to-plan.md>`, not an execution command. Explain that review comes first.
- For a chat-only plan, offer to write `plan.md` without a command.
