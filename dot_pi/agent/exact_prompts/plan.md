---
description: Turn an agreed framing or design into a right-sized implementation plan
argument-hint: "[path-to-design-or-brief.md | task description] [extra instructions]"
---
# Plan
Planning input:

> $ARGUMENTS

Turn an agreed problem framing, alignment brief, design spec, issue, or clear task request into a concrete implementation plan.

Brainstorming answers what problem to solve. Planning answers how to implement it. Execution makes the approved change.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside the plan document. The default terminal state for non-trivial work is a committed `plan.md` in a feature worktree.
</HARD-GATE>

## Input Handling
`/plan` can start from:

- a path to a design spec, alignment brief, issue, or existing plan
- the current conversation's agreed alignment brief
- a clear task description

If a path is provided, use the `resolve-worktree` skill to resolve it. For design specs, set `$GLOB = **/plans/*/design.md`; for plan files, set `$GLOB = **/plans/*/plan.md`; for ambiguous markdown briefs, search likely repo-relative locations first, then ask if multiple matches exist. Switch context to the owning worktree before reading the artifact.

If no path is provided and the user did not explicitly request lightweight/chat-only planning, use the `resolve-worktree` skill with `$GLOB = **/plans/*/design.md` to discover existing design specs across worktrees. If a design spec is resolved, switch context to the owning worktree and use it as the source of truth. If no design spec is found, use the current conversation context and `$ARGUMENTS`.

Only skip design spec discovery when the user explicitly asks for lightweight planning, no artifacts, no worktree, or a quick chat-only plan. When directly invoked, stay in planning mode. Do not abandon the workflow because the input is imperfect. Ask focused questions or recommend returning to `/brainstorm` only when missing decisions are problem-framing decisions rather than planning details.

If the input is a broad idea with unclear goal, audience/user, scope, success criteria, or validation, stop and ask one question at a time before writing a plan.

If a resolved design spec or existing plan has drifted from the current request, decide whether to revise it or restart before writing tasks. Revise the existing artifact when the intent is unchanged and most of the scope still overlaps. Return to `/brainstorm` for a new design when the problem itself changed, the scope grew until the original is unrecognizable, or the original could ship as-is and this is follow-up work.

When asking a blocking planning question, include a recommended answer if there is enough evidence:

```md
## Blocking question
...

## Recommended answer
I recommend ... because ...

If that is right, I will plan around ...
```

For trivial or explicitly ephemeral work, ask whether the user wants a chat-only plan instead of a committed `plan.md`. Otherwise prefer a durable plan file, and prefer an existing `design.md` as input when one exists.

## Source of Truth
Use the upstream alignment brief, design spec, Jira, issue, PR comment, or user request as the source of truth for WHAT.

Do not reinvent goals, scope, user-facing behavior, or success criteria during planning. If these are missing or contradictory, stop and ask one question at a time.

Every major task must trace back to a goal, requirement, or explicit user instruction from the input. Remove tasks that do not map to the source of truth, or mark them as optional follow-up.

## Posture
Plan for a skilled engineer with no local context. Be exact, test-driven, and skeptical. If the input is not ready to plan from, stop and ask for the missing decision.

Prefer DRY, YAGNI, small vertical slices, frequent verification, and existing repository patterns. Use boring technology. Reuse existing libraries, services, CLIs, controllers, APIs, and platform primitives instead of reimplementing them.

Do not ask the user to identify files, commands, patterns, or existing behavior if those can be discovered from the repository. Investigate first, then ask only to confirm ambiguous choices or product decisions.

Capture decisions, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write large implementation blocks or shell-command choreography. Include snippets only when they clarify an interface, schema, command, invariant, or expected behavior.

Honor user-named resources. When the user names a CLI, MCP server, URL, file, doc link, issue, PR, or prior artifact, treat it as authoritative input. Discover it if unknown before assuming it is unavailable. If it fails or does not exist, say so explicitly rather than silently substituting.

## Worktree Policy
Prefer feature worktrees for durable plans and implementation work.

When creating or updating a durable plan:

- Fetch the latest default branch.
- Branch from the latest default branch, not from the current HEAD.
- Use branch name `maruina/<ticket-or-feature>` unless repository guidance specifies otherwise.
- Follow repository worktree guidance. For Datadog repositories, use `~/dd/.worktrees/<repo-name>-<branch-slug>`.
- If already in the correct feature worktree, continue there.
- If in a base checkout on `main` or `master`, create a feature worktree before writing the plan unless the user explicitly asks not to.
- If the default branch, branch name, or worktree location is ambiguous, ask before creating.

## Workflow
1. Read the planning input completely. If it is a path, resolve it to the correct worktree first.
2. Inspect relevant guidance, code, tests, build commands, package boundaries, existing patterns, tickets, prior plans, architecture decision records, and review threads.
3. Before writing the plan, pressure-test the input. Ask one question at a time only if the answer materially changes the implementation plan. Prefer inspecting evidence over asking the user. Check whether the problem is framed clearly enough to plan, success criteria are observable, the first slice is small enough to implement and review safely, existing repository or platform patterns can be reused, and rollout, rollback, ownership, and validation are clear enough for the risk level.
4. Load relevant planning skills before writing tasks. Prefer specific skills over general ones.
5. Check scope. If the work spans independent subsystems, suggest separate plans unless the input already decomposes them into independently testable deliverables.
6. Right-size the plan based on risk and complexity.
7. Map files before tasks: each file to create or modify, its responsibility, boundaries, and tests.
8. Decide where the plan should live. Prefer `plans/<ticket-or-feature>/plan.md` relative to the relevant package directory in monorepos. If a design spec was provided, write the plan in the same directory as the design.
9. Ensure the worktree policy is satisfied before writing a durable plan.
10. Write the plan document only. Do not change implementation files.
11. Self-review the plan and fix issues inline.
12. Commit only the plan: `docs: add <ticket-or-feature> implementation plan`. Do not include unrelated changes. If the branch is `main` or `master`, stop and ask before committing.
13. Report the exact handoff phrase below.

## Right-Size the Plan
Match plan detail to risk.

### Small Work
Use a compact plan with:

- goal
- affected files
- ordered steps
- validation
- commit message if applicable
- documentation impact, or why none is needed

### Medium Work
Include:

- goal and scope
- components affected
- key decisions
- task sequence
- tests
- validation
- documentation impact
- operational impact

### Large/Risky Work
Use the full implementation contract:

- components affected
- key decisions
- security requirements
- observability requirements
- failure modes
- rollout and rollback
- test strategy
- documentation and future-agent guidance

Large/Risky includes multi-component changes, migrations, refactors, behavior changes with compatibility risk, production-impacting infrastructure work, unclear ownership, broad docs/process rewrites, or work without obvious validation.

## Operational Soundness
For technical plans, answer these before approval:

- Which existing repository patterns, libraries, services, CLIs, controllers, APIs, or platform primitives does the implementation reuse?
- What are the main failure modes, and how does the system detect, mitigate, and roll back each one?
- What happens when dependencies are slow, unavailable, inconsistent, or partially successful?
- What data could be lost, duplicated, corrupted, or exposed?
- What logs, metrics, traces, alerts, dashboards, or runbooks are needed? If none are needed, explain why.
- What is the smallest safe rollout and fastest safe rollback?
- Would the owning team be comfortable being paged for this at 3am?

If the on-call answer is no, revise the plan before writing tasks.

## Path Portability
Inside the plan document, use repo-relative paths. Do not use absolute paths in file lists, implementation units, pattern references, origin document links, or prose mentions.

Use absolute paths only in the final chat handoff so `/systematic-review` and `/execute` can resolve the exact plan file across worktrees.

## Plan Requirements
Start every durable plan with:

```markdown
# [Feature Name] Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences, or "Not applicable" for small non-architecture work]
**Tech Stack:** [key technologies]

---
```

For Medium and Large/Risky plans, include:

```markdown
## Implementation Contract

**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| [component] | `[repo-relative paths]` | [what this owns] | [command or check] |

**Key Decisions**
- [decision and rationale]

**Security Requirements**
- [credential, authorization, input-validation, data-exposure, permission constraint, or explicit reason none are needed]

**Observability Requirements**
- [logs, metrics, traces, alerts, dashboards, runbooks, or explicit reason none are needed]

**Failure Modes to Handle**
- [failure mode, expected behavior, and verification]

**Rollout and Rollback**
- [smallest safe rollout, fastest safe rollback, and owner]

**Test Strategy**
- [public behaviors and interfaces to verify, mapped to the acceptance requirements above, plus the narrow command that should fail before implementation]
- [system boundaries to mock, if any; do not mock internal collaborators unless the repository already uses that seam]
```

For Small plans, replace the implementation contract with concise `## Scope` and `## Validation` sections, but still include exact files, ordered tasks, success criteria, and documentation impact.

## Acceptance Criteria
Express the plan's success criteria as testable behavior contracts, not prose. Each behavior the change must guarantee is a requirement with at least one concrete scenario.

Use RFC 2119 keywords and Given/When/Then:

```md
### Requirement: <observable behavior>
The system SHALL <normative statement>.

#### Scenario: <happy path or edge case>
- GIVEN <precondition>
- WHEN <action>
- THEN <observable outcome>
- AND <additional outcome>
```

Rules:

- Use SHALL/MUST for required behavior; SHOULD/MAY only for genuine options.
- Every requirement has at least one scenario, and every scenario exercises the requirement it sits under.
- Scenarios must be observable through a supported interface so each maps to a test.
- Cover the happy path, the edge cases you care about, and failure paths. The most valuable scenario is often the one you almost forgot to state.

Each scenario becomes the focused failing test in a red-green-refactor task. Trace every acceptance requirement to at least one task, and every behavior task back to a requirement.

Scale to risk: Small plans may inline one or two scenarios in `## Validation`; Medium and Large/Risky plans list acceptance requirements explicitly and reference them from the Test Strategy.

## Task Requirements
Each task must be small enough to execute safely and review independently.

For every implementation task, include:

- exact repo-relative files to create, modify, or test
- checkbox steps for one behavior-focused failing test when applicable, minimal implementation, verification, refactor after green when needed, and commit when applicable
- exact commands and expected results
- Conventional Commit messages when the task commits
- the requirement, goal, or explicit instruction the task traces back to

Plan vertical slices: one public behavior, one focused failing test through the supported interface, the smallest implementation that passes, then refactor only after verification is green. Do not plan all tests first and all implementation later unless the input explicitly requires that shape.

Prefer naturally testable interfaces: small surface area, dependencies accepted rather than created internally, and results returned rather than hidden behind side effects. Tests verify observable behavior and stay refactor-safe. Avoid coupling to private helpers, internal call order, direct storage inspection, or internal collaborators.

Prefer scripts over long inline CI YAML when logic has branching, loops, retries, temp files, cleanup, multi-line errors, or remediation text. Prefer existing repository or platform CLIs over raw HTTP calls.

## Required Final Task
For Medium and Large/Risky plans, end with a documentation and future-agent guidance task. The implementer must inspect each item and either update it or record why no update is needed:

- user-facing docs
- developer docs
- READMEs
- runbooks or operational docs
- examples or generated reference docs
- every relevant `AGENTS.md`

For `AGENTS.md`, add only durable knowledge: required commands, generation steps, repository traps, source-of-truth rules, and testing or rollout procedures.

For Small plans, include documentation impact in validation or explicitly state why no docs update is needed.

## Plan Quality Bar
Before reporting completion, verify:

- every requirement maps to a task or explicit follow-up
- acceptance requirements are expressed as testable scenarios, each mapped to at least one task
- tasks are vertical, ordered safely, and independently verifiable
- each task includes a focused failing test or an explicit reason one is not practical
- file paths, commands, types, functions, flags, and dependencies exist and match the repository
- all file paths inside the plan are repo-relative
- loaded skill guidance is reflected
- security, observability, failure modes, rollout, rollback, docs, and `AGENTS.md` coverage are explicit for the plan's risk level
- automation uses the right CLI or script shape
- the plan reuses existing patterns and does not reimplement platform capabilities without justification
- the plan does not invent behavior beyond the source of truth
- no placeholders, contradictions, duplicated work, or bloated instructions remain: no `TBD`, `TODO`, `implement later`, `add validation`, `handle edge cases`, `write tests for the above`, `similar to Task N`, or references to nonexistent files, types, functions, or commands

## Handoff
After saving and committing a durable plan, say exactly:

> Plan complete, committed, and saved to `<absolute-path-to-plan.md>`. Run `/systematic-review <absolute-path-to-plan.md>` to validate it before handing off to `/execute <absolute-path-to-plan.md>`.

Replace `<absolute-path-to-plan.md>` with the absolute path to the plan file in the worktree.

For a chat-only plan, end with:

> Plan complete. If you want to execute it with the standard workflow, I can write this to a durable `plan.md` next.
