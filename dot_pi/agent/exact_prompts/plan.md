---
description: Turn an approved design spec into an implementation plan
argument-hint: "<path-to-design.md> [extra instructions]"
---
# Plan an Approved Design
Design spec: `$1`

Extra instructions:

> `${@:2}`

Turn the approved design spec into a concrete implementation plan.

Use the `resolve-worktree` skill to resolve `$1` with `$GLOB = plans/*/design.md`. Switch context to the owning worktree before reading the spec.

Lifecycle: `/brainstorm` creates an approved design spec, `/plan` creates an approved implementation plan, and `/execute` implements verified changes.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside `plans/<ticket-or-feature>/plan.md`. The terminal state is a saved implementation plan.
</HARD-GATE>

## Posture
Plan for a skilled engineer with no local context. Be exact, test-driven, and skeptical. If the design is not ready to plan from, stop and ask for the missing decision.

Prefer DRY, YAGNI, small vertical slices, frequent verification, and existing repository patterns.

Verify the design's scale assumptions are explicit and mapped to implementation constraints, tests, rollout guardrails, and observability. Do not add speculative optimizations. If expected scale, growth path, or operational limits are missing from the design, stop and ask before planning.

## Workflow
1. Read the design spec completely.
2. Inspect relevant guidance, code, tests, build commands, package boundaries, existing patterns, tickets, prior plans, architecture decision records, and review threads.
3. Load relevant planning skills before writing tasks. Prefer specific skills over general ones.
4. Check scope. If the design spans independent subsystems, suggest separate plans unless the spec already decomposes them into independently testable deliverables.
5. Map files before tasks: each file to create or modify, its responsibility, boundaries, and tests.
6. Before writing the plan, verify the selected design spec is already committed in git. If it is uncommitted or untracked, stop and ask the user to commit the design first.
7. Write the plan to `plans/<ticket-or-feature>/plan.md` in the same directory as the design.
8. Self-review the plan and fix issues inline.
9. If in a git repository, commit only the plan with Conventional Commit message `docs: add <ticket-or-feature> implementation plan`. Do not include unrelated changes. If the branch is `main` or `master`, stop and ask before committing.
10. Report the exact handoff phrase below.

## Plan Requirements
Start every plan with:

```markdown
# [Feature Name] Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]

---
```

Then include:

```markdown
## Implementation Contract

**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| [component] | `[paths]` | [what this owns] | [command or check] |

**Key Decisions**
- [decision and rationale]

**Security Requirements**
- [credential, authorization, input-validation, data-exposure, or permission constraint]

**Observability Requirements**
- [logs, metrics, traces, alerts, dashboards, or explicit reason none are needed]

**Failure Modes to Handle**
- [failure mode, expected behavior, and verification]

**Test Strategy**
- [public behaviors and interfaces to verify, plus the narrow command that should fail before implementation]
- [system boundaries to mock, if any; do not mock internal collaborators unless the repository already uses that seam]
```

## Task Requirements
Each task must be small enough to execute safely and review independently.

For every task, include:

- exact files to create, modify, or test
- checkbox steps for one behavior-focused failing test, minimal implementation, verification, refactor after green when needed, and commit when applicable
- exact commands and expected results
- enough code or config snippets to remove ambiguity, without inventing large blocks better derived during execution
- Conventional Commit messages when the task commits

For testable behavior, plan vertical slices/tracer bullets: one public behavior, one focused failing test through the supported interface, the smallest implementation that passes, then refactor only after verification is green. Do not plan all tests first and all implementation later unless the design explicitly requires that sequencing.

Prefer naturally testable interfaces: small surface area, dependencies accepted rather than created internally, and results returned rather than hidden behind side effects. Tests should verify observable behavior and remain refactor-safe; avoid coupling them to private helpers, internal call order, direct storage inspection, or internal collaborators.

Prefer scripts over long inline CI YAML when logic has branching, loops, retries, temp files, cleanup, multi-line errors, or remediation text. Prefer existing repository or platform CLIs over raw HTTP calls.

## Required Final Task
Every plan must end with a documentation and future-agent guidance task. It must require the implementer to inspect each relevant item and either update it or record why no update is needed:

- user-facing docs
- developer docs
- READMEs
- runbooks or operational docs
- examples or generated reference docs
- every relevant `AGENTS.md`

For `AGENTS.md`, add only durable knowledge: required commands, generation steps, repository traps, source-of-truth rules, and testing or rollout procedures.

## Plan Quality Bar
Do not include placeholders or vague instructions, including `TBD`, `TODO`, `implement later`, `add validation`, `handle edge cases`, `write tests for the above`, `similar to Task N`, or references to nonexistent files, types, functions, or commands.

Before reporting completion, verify:

- every spec requirement maps to a task
- task order is safe, vertical, and testable
- paths, types, commands, and flags match the repository
- loaded skill guidance is reflected
- security, observability, failure modes, docs, and `AGENTS.md` coverage are explicit
- automation uses the right CLI or script shape

## Handoff
After saving and committing the plan, say exactly:

> Plan complete, committed, and saved to `plans/<ticket-or-feature>/plan.md`. Run `/systematic-review plans/<ticket-or-feature>/plan.md` to validate it before handing off to `/execute`.
