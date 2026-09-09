---
description: Turn an agreed framing or design into a right-sized implementation plan
argument-hint: "[path-to-design-or-brief.md | task description] [extra instructions]"
---
# Plan
Planning input:

> $ARGUMENTS

Turn an agreed problem framing, design spec, issue, or clear request into a concrete implementation plan. Brainstorming decides what to solve; planning decides how; execution makes the approved change.

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

- **Small/direct:** Use direct planning for clear, low-risk work or an explicit one-shot/fast/no-questions request. Discovery, feasibility checks, skill loading, and self-review still apply. For trivial or ephemeral work, offer a chat-only plan.
- **Medium or Large/Risky/interactive:** Research first. Ask one question at a time only for material implementation choices evidence cannot settle. Include a recommended answer, finish that branch as accepted, rejected, deferred, blocked, or split, and present the alignment brief below even when discovery finds no open question.

Treat bounded work that needs discovery or tradeoffs as Medium. Treat multi-component changes, migrations, broad refactors, compatibility or security changes, production infrastructure, unclear ownership, or unclear validation as Large/Risky.

A recommendation is a strawman, not a decision. Wait for user confirmation before writing a durable plan in interactive mode.

## Sources and discovery
Use the upstream design, alignment brief, issue, PR feedback, or request as the source of truth for WHAT. Use the current repository, available tools, and validated command behavior as the source of truth for HOW.

- Read the input completely, then inspect relevant guidance, code, tests, build commands, package boundaries, existing patterns, tickets, prior plans, architecture decision records (ADRs), domain glossaries, and review threads.
- Use established repository vocabulary. Treat applicable ADRs as constraints and surface conflicts instead of silently overriding them.
- Load the `skill-loader` skill before implementation recommendations, then read every matching language and domain skill. Prefer specific guidance over general guidance.
- Investigate discoverable facts yourself. Ask the user only for decisions, priorities, unavailable context, or source-of-truth material you cannot access.
- Every task must trace to a goal, requirement, or explicit instruction. Carry source-defined non-goals and deliberate deferrals into the alignment brief and plan; do not silently add, drop, or reinterpret scope.

### Advisory learning lookup
After resolving the input and repository context, but before feasibility decisions or recommendations, derive narrow terms for the technology, error, API, tool, and pattern. Read `Datadog/Learnings.md` through Obsidian and pipe it locally to `learn-evidence.mjs learning-sections`. Pass only returned complete H2 sections into reasoning; apply no repository filter. Report matched section titles and material guidance used; do not report unrelated sections.

Learnings are advisory. Current source code, tests, and tool behavior, then authoritative documentation, take precedence. Treat an absent `Datadog/Learnings.md` as empty without warning noise. If Obsidian is unavailable, continue and record the skipped source in `plan.md`, or in the chat plan for chat-only planning. Record material guidance in `plan.md` or the chat-only plan, including when stronger evidence makes a learning stale, corrected, or intentionally omitted. Do not retrieve the mutable store during `/execute` or `/verify`.

## Feasibility and planning decisions
Before acceptance criteria or tasks, establish a concrete mechanism and observable validation path for every requirement involving a tool, runtime capability, external service, metadata source, or workflow behavior. For Medium and Large/Risky work, record:

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| [requirement] | [interface, command, or component] | [repository reference or command output] | [observable check] | [enable, narrow/defer with approval, or block] |

For each acceptance behavior, choose the highest supported interface that observes it deterministically. Prefer an existing test seam and introduce the fewest new seams necessary. Confirm a new seam when it changes architecture, a public interface, or validation strength.

If a required mechanism is unavailable, either add and validate the enabling work, narrow or defer the requirement with user approval, or stop on the blocker. Never use placeholders such as “requires proof” or validate only a nearby subsystem.

Ask a planning question when multiple reasonable approaches materially change compatibility, failure behavior, authorization or data handling, operability, public interfaces, test evidence, or review boundaries. Explain options, recommend one, and do not ask about mechanics established by repository evidence.

Pressure-test only material risks:

- untrusted inputs, invalid states, permissions, sensitive data, and partial failure
- bounded growth, cancellation, timeouts, retries, idempotency, and rollback
- expected scale and whether the path is hot, control-plane, batch, or one-off
- dependency slowness or unavailability and data loss, duplication, corruption, or exposure
- ownership plus required logs, metrics, traces, alerts, dashboards, runbooks, rollout, and rollback

Prefer boring existing technology and APIs. Avoid speculative abstractions or ceremony. If the owning team would not accept being paged for the result, revise or narrow the plan.

## Planning alignment gate
The planning alignment brief and durable plan must include `Skills loaded and used`; use the exact durable-plan heading `## Skills loaded and used`. Record only skills whose `SKILL.md` was read and applied, with source (`skill-loader`, `prompt-required`, `user-requested`, or `agent-selected`), loading reason, and effect. This provenance is feedback for improving `skill-loader`; do not infer usage from an upstream artifact. If none were used, say so explicitly.

```md
## Planning alignment brief
Source of truth:
- ...

Scope classification:
- ...

Implementation strategy:
- ...

Out of scope and deliberately deferred:
- ...

Design-to-code mapping:
- [requirement] → [component, files, and mechanism]

Existing patterns and ADRs to preserve:
- ...

Skills loaded and used:

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-name` | `skill-loader` / `prompt-required` / `user-requested` / `agent-selected` | [trigger] | [guidance applied] |

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

- Fetch the latest default branch and use a feature worktree based on it. Continue in the correct existing worktree; never write or commit the plan on `main` or `master`. Use `maruina/<ticket-or-feature>` and repository-specific worktree guidance.
- Write `plans/<ticket-or-feature>/plan.md`, preferably beside its `design.md` and under the relevant package in a monorepo.
- Use repo-relative paths inside the plan. Use an absolute plan path only in the final chat handoff.
- Commit only the plan with `docs: add <ticket-or-feature> implementation plan` after self-review.

Start every durable plan with:

```md
# [Feature Name] Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [one sentence]
**Out of Scope:** [source-defined non-goals and deliberately deferred work, or "No explicit exclusions"]
**Architecture:** [2-3 sentences, or "Not applicable"]
**Tech Stack:** [key technologies]

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-name` | `skill-loader` / `prompt-required` / `user-requested` / `agent-selected` | [trigger] | [guidance applied] |
```

Preserve the confirmed planning provenance and add skills used while writing or self-reviewing the plan. Do not copy skills from `design.md` unless they were also loaded and used during planning.

Right-size the remainder:

- **Small:** concise `## Scope` and `## Validation`, exact files, ordered tasks, success criteria, documentation impact, and commit message when applicable.
- **Medium:** components, decisions, task sequence, acceptance scenarios, tests, documentation, and operational impact.
- **Large/Risky:** the Medium contract plus explicit security, observability, failure modes, rollout/rollback, ownership, and migration requirements.

For Medium and Large/Risky plans, add `## Implementation Contract` containing:

- **Components Affected:** `Component | Files | Responsibility | Verification`
- **Key Decisions:** decision and rationale
- **Implementation Constraints:** applicable ADRs and patterns, assumptions, stop conditions, and material safety/performance/developer-experience requirements or why they are inapplicable
- **Security Requirements** and **Observability Requirements**, including an explicit reason when none apply
- **Failure Modes to Handle:** expected behavior and verification
- **Rollout and Rollback:** smallest safe rollout, fastest safe rollback, and owner
- **Test Strategy:** each requirement mapped to its highest deterministic supported interface, existing or justified new seams, system boundaries to mock, and the narrow command expected to fail before implementation

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

Every requirement needs a scenario through a supported interface and must map to a task; every behavior task maps back to a requirement. Prefer a focused automated test. When automation is impractical, specify reproducible setup, invocation, expected result, cleanup, and why automation is impractical. Small plans may inline one or two scenarios under `## Validation`.

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

Prefer public behavior over private helpers, and mock system boundaries rather than internal collaborators. Prefer a script over long inline CI YAML when logic contains branching, retries, cleanup, or multi-line errors. Reuse repository or platform CLIs rather than raw HTTP.

For Medium and Large/Risky work, end with a documentation and future-agent guidance task covering user/developer docs, READMEs, runbooks, examples or generated references, and every relevant `AGENTS.md`; update each or record why not. Add to `AGENTS.md` only durable commands, generation steps, traps, source-of-truth rules, and testing or rollout procedures. Small plans must state documentation impact.

## Final review
Before committing, confirm:

- interactive Medium/Large work has a user-confirmed alignment brief
- scope, non-goals, requirements, tasks, and validation are bidirectionally traceable
- paths, commands, types, dependencies, mechanisms, and expected results exist
- behavior tasks are complete vertical slices; genuine blockers appear first; any integration exception is explicit
- acceptance scenarios cover material happy, edge, failure, and integration paths at supported seams
- security, operability, failure behavior, rollout, rollback, ownership, and docs match risk
- skill provenance is accurate and loaded guidance is reflected
- the plan is right-sized and contains no contradictions, duplicated work, vague placeholders, or invented behavior

Self-review as a skeptical implementer and fix issues inline. Do not pre-write implementation code or shell-command choreography; use snippets only to pin an interface, schema, command, or invariant. Honor user-named resources rather than silently substituting them.

## Handoff
Report the exact handoff phrase below.

After saving and committing a durable plan, say exactly:

Plan complete, committed, and saved to `<absolute-path-to-plan.md>`. Run `/systematic-review <absolute-path-to-plan.md>` to validate it before handing off to `/execute <absolute-path-to-plan.md>`.

For a chat-only plan, end with:

Plan complete. If you want to execute it with the standard workflow, I can write this to a durable `plan.md` next.
