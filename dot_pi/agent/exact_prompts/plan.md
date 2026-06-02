---
description: Turn an approved design spec into an implementation plan
argument-hint: "<path-to-design.md> [extra instructions]"
---
# Plan an Approved Design
Design spec: `$1`

Extra instructions:

> `${@:2}`

Turn the approved design spec into a concrete implementation plan.

If `$1` is missing, discover candidate design specs before asking for a path:

1. Search the current checkout for `plans/*/design.md`.
2. If inside a git repository, run `git worktree list --porcelain` and search each worktree for `plans/*/design.md`.
3. For each candidate, collect the design path, worktree path, branch name when available, last modified time, and first Markdown heading.
4. Sort candidates by last modified time descending, with current-checkout candidates first when timestamps are similar.
5. If there is exactly one candidate, ask the user to confirm it and stop until they answer.
6. If there are multiple candidates, present a concise numbered list and ask which design to plan. Stop until the user chooses.
7. If no candidates exist, ask for the design path and stop.

After the user chooses a discovered design, treat it exactly as if it had been passed as `$1`.

Lifecycle: `/brainstorm` creates an approved design spec, `/plan` creates an approved implementation plan, and `/execute` implements verified changes.

<HARD-GATE>
Do not write implementation code, scaffold application files, or change files outside `plans/<ticket-or-feature>/plan.md`. The terminal state is a saved implementation plan.
</HARD-GATE>

## Posture
Plan for a skilled engineer with no local context. Be exact, test-driven, and skeptical. If the design is not ready to plan from, stop and ask for the missing decision.

Prefer DRY, YAGNI, small tasks, frequent verification, and existing repository patterns.

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
```

## Task Requirements
Each task must be small enough to execute safely and review independently.

For every task, include:

- exact files to create, modify, or test
- checkbox steps for failing test, implementation, verification, and commit when applicable
- exact commands and expected results
- enough code or config snippets to remove ambiguity, without inventing large blocks better derived during execution
- Conventional Commit messages when the task commits

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
- task order is safe and testable
- paths, types, commands, and flags match the repository
- loaded skill guidance is reflected
- security, observability, failure modes, docs, and `AGENTS.md` coverage are explicit
- automation uses the right CLI or script shape

## Handoff
After saving and committing the plan, say exactly:

> Plan complete, committed, and saved to `plans/<ticket-or-feature>/plan.md`
