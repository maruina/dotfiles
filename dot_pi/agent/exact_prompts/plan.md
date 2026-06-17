---
description: Turn an agreed framing or design into a right-sized implementation plan
argument-hint: "[path-to-design-or-brief.md | task description] [extra instructions]"
---
# Plan
Planning input:

> $ARGUMENTS

Turn an agreed problem framing, alignment brief, design spec, issue, or clear task request into a concrete implementation plan.

Brainstorming answers what problem to solve and what first slice is useful. Planning answers how to implement that slice. Execution makes the change.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside the plan document. The default terminal state for non-trivial work is a committed `plan.md` in a feature worktree.
</HARD-GATE>

## Input Handling
`/plan` can start from:

- a path to a design spec, alignment brief, issue, or existing plan
- the current conversation's agreed alignment brief
- a clear task description

If a path is provided, use the `resolve-worktree` skill to resolve it. For design specs, set `$GLOB = **/plans/*/design.md`; for plan files, set `$GLOB = **/plans/*/plan.md`; for ambiguous markdown briefs, search likely repo-relative locations first, then ask if multiple matches exist. Switch context to the owning worktree before reading the artifact.

If no path is provided, use the current conversation context and `$ARGUMENTS`. When directly invoked, stay in planning mode. Do not abandon the workflow because the input is imperfect. Ask focused questions or recommend returning to `/brainstorm` only when missing decisions are problem-framing decisions rather than planning details.

If the input is a broad idea with unclear goal, audience/user, scope, success criteria, or validation, stop and ask one question at a time before writing a plan.

For trivial or explicitly ephemeral work, ask whether the user wants a chat-only plan instead of a committed `plan.md`. Otherwise write a durable plan file.

## Source of Truth
Use the upstream alignment brief, design spec, Jira, issue, PR comment, or user request as the source of truth for WHAT.

Do not reinvent goals, scope, user-facing behavior, or success criteria during planning. If these are missing or contradictory, stop and ask one question at a time.

Every major task must trace back to a goal, requirement, or explicit user instruction from the input. Remove tasks that do not map to the source of truth, or mark them as optional follow-up.

## Posture
Plan for a skilled engineer with no local context. Be exact, test-driven, and skeptical. If the input is not ready to plan from, stop and ask for the missing decision.

Prefer DRY, YAGNI, small vertical slices, frequent verification, and existing repository patterns. Use boring technology. Reuse existing libraries, services, CLIs, controllers, APIs, and platform primitives instead of reimplementing them.

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
3. Load relevant planning skills before writing tasks. Prefer specific skills over general ones.
4. Check scope. If the work spans independent subsystems, suggest separate plans unless the input already decomposes them into independently testable deliverables.
5. Right-size the plan based on risk and complexity.
6. Map files before tasks: each file to create or modify, its responsibility, boundaries, and tests.
7. Decide where the plan should live. Prefer `plans/<ticket-or-feature>/plan.md` relative to the relevant package directory in monorepos. If a design spec was provided, write the plan in the same directory as the design.
8. Ensure the worktree policy is satisfied before writing a durable plan.
9. Write the plan document only. Do not change implementation files.
10. Self-review the plan and fix issues inline.
11. Commit only the plan: `docs: add <ticket-or-feature> implementation plan`. Do not include unrelated changes. If the branch is `main` or `master`, stop and ask before committing.
12. Report the exact handoff phrase below.

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
- [public behaviors and interfaces to verify, plus the narrow command that should fail before implementation]
- [system boundaries to mock, if any; do not mock internal collaborators unless the repository already uses that seam]
```

For Small plans, replace the implementation contract with concise `## Scope` and `## Validation` sections, but still include exact files, ordered tasks, success criteria, and documentation impact.

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

- every input requirement maps to a task or explicit follow-up
- task order is safe, vertical, and testable
- paths, types, commands, and flags match the repository
- all file paths inside the plan are repo-relative
- loaded skill guidance is reflected
- security, observability, failure modes, rollout, rollback, docs, and `AGENTS.md` coverage are explicit for the plan's risk level
- automation uses the right CLI or script shape
- the plan reuses existing patterns and does not reimplement platform capabilities without justification
- the plan does not invent product behavior beyond the source of truth
- no placeholders: no `TBD`, `TODO`, `implement later`, `add validation`, `handle edge cases`, `write tests for the above`, `similar to Task N`, or references to nonexistent files, types, functions, or commands

## Handoff
After saving and committing a durable plan, say exactly:

> Plan complete, committed, and saved to `<absolute-path-to-plan.md>`. Run `/systematic-review <absolute-path-to-plan.md>` to validate it before handing off to `/execute <absolute-path-to-plan.md>`.

Replace `<absolute-path-to-plan.md>` with the absolute path to the plan file in the worktree.

For a chat-only plan, end with:

> Plan complete. If you want to execute it with the standard workflow, I can write this to a durable `plan.md` next.
