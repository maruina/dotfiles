---
description: Turn an agreed framing or design into a right-sized implementation plan
argument-hint: "[path-to-design-or-brief.md | task description] [extra instructions]"
---
# Plan
Planning input:

> $ARGUMENTS

Turn an agreed problem framing, design spec, issue, or clear request into a concrete implementation plan.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside the plan document. The default terminal state for non-trivial work is a committed `plan.md` in a feature worktree.

For Medium and Large/Risky work, do not write or commit `plan.md` until the user confirms a planning alignment brief. Skip this gate only when the user explicitly requests one-shot, fast, no-questions, or chat-only planning.
</HARD-GATE>

## Input and interaction mode
Use, in order, an explicit artifact or issue, the conversation's agreed framing, or a clear task request.

- Resolve a supplied path with the `resolve-worktree` skill and switch to its worktree before reading it. Use `$GLOB = **/plans/*/design.md` for designs and `$GLOB = **/plans/*/plan.md` for plans; for ambiguous briefs, search likely repo-relative paths and ask only if multiple matches remain.
- With no path and no lightweight opt-out, use `resolve-worktree` to discover `**/plans/*/design.md` across worktrees. Fall back to the conversation and `$ARGUMENTS` only when no design resolves.
- If goals, audience, scope, success criteria, or validation are unclear, ask one focused question or return to `/brainstorm`; do not invent WHAT during planning.
- If an existing design or plan drifted, revise it when intent is unchanged and most scope overlaps. Return to `/brainstorm` when the problem changed, the old artifact could ship independently, or the new scope would make it unrecognizable.

Classify the work before planning:

- **Small/direct:** Use direct planning for clear, low-risk work or an explicit one-shot/fast/no-questions request. Discovery, feasibility checks, skill loading, and self-review still apply. Offer a chat-only plan for trivial work.
- **Medium or Large/Risky/interactive:** Research first. Ask one question at a time only for material implementation choices evidence cannot settle, include a recommended answer, finish each branch as accepted, rejected, deferred, blocked, or split, and present the alignment brief below before writing a durable plan.

Treat bounded work that needs discovery or tradeoffs as Medium; treat multi-component changes, migrations, broad refactors, compatibility or security changes, production infrastructure, or unclear ownership/validation as Large/Risky.

## Sources and discovery
Use the upstream design, brief, issue, PR feedback, or request as the source of truth for WHAT, and the repository and validated tool behavior for HOW.

- Read the input completely, then inspect relevant guidance, code, tests, build commands, package boundaries, existing patterns, tickets, prior plans, ADRs, and review threads. Surface ADR conflicts instead of overriding them.
- Load the `skill-loader` skill before implementation recommendations, then read every matching language and domain skill and its applicable references.
- Investigate discoverable facts yourself; ask the user only for decisions, priorities, or unavailable context.
- Every task must trace to a goal, requirement, or explicit instruction. Carry source-defined non-goals and deliberate deferrals into the brief and plan without adding, dropping, or reinterpreting scope.

### Advisory learning lookup
After resolving the input and repository context, but before feasibility decisions or recommendations, use the `learning-lookup` skill. Record skipped sources and material guidance in `plan.md`, or in the chat plan for chat-only planning. Do not retrieve the mutable store during `/execute` or `/verify`.

## Feasibility and planning decisions
Before acceptance criteria or tasks, establish a concrete mechanism and observable validation path for every requirement involving a tool, runtime capability, external service, metadata source, or workflow behavior. For Medium and Large/Risky work, record:

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| [requirement] | [interface, command, or component] | [repository reference or command output] | [observable check] | [enable, narrow/defer with approval, or block] |

For each acceptance behavior, choose the highest supported interface that observes it deterministically. Prefer an existing test seam and introduce the fewest new seams necessary. Confirm a new seam when it changes architecture, a public interface, or validation strength.

When the change modifies a shared type, schema, configuration key, or public API, find every consumer with `rg` or `lsp_find_references`, including tests, fixtures, and generated code. Map each consumer to a task or to evidence that it needs no change.

If a required mechanism is unavailable, add and validate the enabling work, narrow or defer the requirement with user approval, or stop on the blocker; never use placeholders such as “requires proof.”

Ask a planning question when multiple reasonable approaches materially change compatibility, failure behavior, authorization, data handling, operability, public interfaces, test evidence, or review boundaries. When a changed shared component has consumers outside the request, ask whether to limit the change to the requested consumer or apply it to every consumer, state the cost of each option, and recommend one.

Pressure-test material risks: untrusted inputs, invalid states, permissions, sensitive data, partial failure, bounded growth, cancellation, timeouts, retries, idempotency, scale, dependency unavailability, data integrity, ownership, observability, rollout, and rollback. Prefer boring existing technology and APIs. If the owning team would not accept being paged for the result, revise or narrow the plan.

## Planning alignment gate
The planning alignment brief and durable plan must include `Skills loaded and used`; use the exact durable-plan heading `## Skills loaded and used`. Fill it per the `## Provenance record` section of the `skill-loader` skill.

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

Assumptions, confirmed/rejected decisions, and risks:
- ...
```

In interactive mode: ask the user to confirm or adjust the brief, including slice granularity, genuine blocking edges, and merge/split boundaries; resolve changes and newly material questions before asking again; only confirmation authorizes writing and committing `plan.md`.

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

Preserve the confirmed planning provenance and add skills used while writing or self-reviewing the plan; do not copy skills from `design.md` unless loaded and used during planning.

Right-size the remainder:

- **Small:** concise `## Scope` and `## Validation`, exact files, ordered tasks, success criteria, documentation impact, and commit message.
- **Medium / Large/Risky:** add `## Implementation Contract` containing **Components Affected** (`Component | Files | Responsibility | Verification`), **Key Decisions** (decision, rationale, and rejected alternative's benefit), **Implementation Constraints** (ADRs, assumptions, stop conditions, and safety/performance/DX requirements or why inapplicable), **Security and Observability Requirements** (or why none apply), **Failure Modes to Handle**, **Rollout and Rollback** (with owner), and **Test Strategy** (highest deterministic supported interface, seams, system boundaries to mock, and narrow failing command).

For integration, reliability, performance, or cost checks, define comparable baseline and candidate workloads where applicable. Specify telemetry selectors for the exact instance, version, traffic cohort, and observation window. Define isolation for mutable state, queues, background jobs, and downstream effects, not only ports or incoming traffic. Record mock limitations and which claims require real dependencies. If required traffic, telemetry, or isolation is unavailable, name the gap and do not plan to infer success from absent errors.

### Slice grouping
Group tasks under `### Slice N: <title>` headings only when the plan needs more than one shippable slice: Medium or Large/Risky work, or work with deliberately deferred scope. Each heading names the user feedback it delivers. Slice 1 is the smallest user-feedback slice. Small/direct plans keep the concise `## Scope` and `## Validation` shape with one execution unit and no slice headings.

When slice grouping exists, a task outside the current slice is a follow-up, not plan scope. Deferred work appears under `Out of Scope` or as a later slice with a blocking edge. Each acceptance scenario maps to a slice through its task. A multi-slice plan records a `Final verification` item naming the feature-level acceptance criteria that only the completed feature can satisfy.

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

Every requirement needs a scenario through a supported interface and must map to a task. Each behavior requirement also needs a negative scenario in which the system must not act or produce output, or a one-line reason why none applies; every behavior task maps back to a requirement. Prefer a focused automated test; tests must cover distinct contracts without multiplying independent dimensions or repeating expensive integration scenarios. When automation is impractical, specify reproducible setup, invocation, expected result, cleanup, and why automation is impractical. Small plans may inline one or two scenarios under `## Validation`.

### Task contract
Each task must be understandable and executable by a fresh agent from the plan and repository alone. Use:

```md
### Task N: <title>
**Delivers:** [narrow, complete, independently verifiable outcome]
**Blocked by:** [genuine prerequisite task numbers, or None]
**Traces to:** [requirement, goal, or explicit instruction]
**Files:** [exact repo-relative files to create, modify, or test]

- [ ] Add or run the focused failing test when applicable.
- [ ] Implement the smallest change that passes.
- [ ] Run `<exact command>`; expect `<observable result>`.
- [ ] Refactor only after green, then rerun verification.
- [ ] Commit with `<Conventional Commit message>` when applicable.
```

Order blockers before dependents so `/execute` can proceed sequentially. Default to tracer-bullet vertical slices: one public behavior, its focused test through a supported interface, and the smallest implementation across every affected layer. A completed slice must be independently demoable or verifiable; do not separate layers horizontally when they can land together or group all tests before all implementation.

A preparatory refactor may precede a slice only when it removes a concrete blocker; keep it minimal, behavior-preserving, independently green, and name what it blocks. For a wide mechanical refactor that cannot land as green vertical slices, use expand–migrate–contract: add the compatible new form, migrate callers in green batches sized by blast radius, then remove the old form after every migration. If batches cannot remain green alone, state the integration exception and plan a final integrate-and-verify task.

Prefer a script over long inline CI YAML when logic contains branching, retries, cleanup, or multi-line errors, and reuse repository or platform CLIs rather than raw HTTP.

For Medium and Large/Risky work, end with a documentation and future-agent guidance task covering user/developer docs, READMEs, runbooks, examples or generated references, and every relevant `AGENTS.md` (adding only durable commands, generation steps, traps, source-of-truth rules, and testing/rollout procedures); update each or record why not. Small plans must state documentation impact.

## Final review
Before committing, self-review as a skeptical implementer and fix issues inline: confirm the interactive alignment brief was approved, shared-component scope choices were asked, scope/requirements/tasks/validation trace bidirectionally, referenced paths/commands/types exist, tasks form ordered vertical slices, scenarios cover material happy/edge/failure/negative paths without redundant dimensions, slice grouping is used only when the plan needs it, scope beyond the smallest user-feedback slice is explicitly deferred, skill provenance is accurate, and no contradictions, placeholders, or pre-written implementation choreography remain.

## Learning candidates
When `/systematic-review` findings or reviewer feedback disprove an initial approach and change the design or plan, record a learning candidate in the plan with the `learning-candidates` skill.

## Handoff
Report the exact handoff phrase below.

After saving and committing a durable plan, say exactly:

Plan complete, committed, and saved to `<absolute-path-to-plan.md>`. Run `/systematic-review <absolute-path-to-plan.md>` to validate it before handing off to `/execute <absolute-path-to-plan.md>`.

For a chat-only plan, end with:

Plan complete. If you want to execute it with the standard workflow, I can write this to a durable `plan.md` next.
