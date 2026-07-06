---
description: Review a plan, codebase, directory, or file systematically
argument-hint: "[target-path] [extra context]"
---
# Systematic Review
Review input:

> $ARGUMENTS

Validate a plan or review code without editing files. Treat the first path in the input as the target (default: repository root / current codebase); treat any remaining text as extra context.

If the target is a `plan.md`, use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md`, switch to the owning worktree, and review whether the plan is executable, complete, and consistent with the codebase. If the target is another path, resolve it with `resolve-worktree` without `$GLOB`. If no target is given, use the current repository root.

Use the `codebase-research` skill before critique. First document current behavior and existing patterns, then report evidence-backed findings.

Do not edit files.

## Code review checklist

For code targets, look for:

- Duplicative code that should be common
- Abstractions that are too much or too little, including thin wrappers, identity layers, and unclear type boundaries
- Structural complexity that should be deleted rather than rearranged: ad-hoc branching, special cases, misplaced feature logic, giant files, or spaghetti control flow
- Race conditions and concurrency issues, especially CRDT/sync behavior
- Edge cases and off-by-one errors
- Error handling gaps
- Null/undefined safety
- Architecture and coupling concerns
- Maintainability issues: naming, dead code, unnecessary complexity
- Security issues: input validation, injection, auth boundaries, CLI access control, and anything security-funky
- Performance issues: N+1 behavior, hot paths, scale blow-ups
- Tests that assert implementation details instead of meaningful behavior
- Code that is inordinately complicated for what it does

Also argue against the design: explain what you would do differently, why, and the trade-offs.

## Plan review checklist

For `plan.md` targets, check that:

- every requirement maps to a task or explicit follow-up
- acceptance requirements are expressed as testable scenarios, each mapped to at least one task
- tasks are vertical, ordered safely, and independently verifiable
- each task includes a focused failing test or an explicit reason one is not practical
- file paths, commands, types, functions, flags, and dependencies exist and match the repository
- all file paths are repo-relative
- security, observability, failure modes, rollout, rollback, docs, and `AGENTS.md` coverage are explicit for the plan's risk level
- the plan reuses existing patterns and does not reimplement platform capabilities without justification
- the plan does not invent behavior beyond the source of truth
- stop conditions, assumptions, and scope boundaries are explicit
- no placeholders, contradictions, duplicated work, or bloated instructions remain

## Method

1. Use `codebase-research` to locate the target area, analyze current behavior, and find similar patterns.
2. Identify the project shape: language, package boundaries, test/build commands, entry points, and relevant guidance files.
3. Map the target area: core files, tests, dependencies, callers, and ownership boundaries. For plans, also read the sibling `design.md`.
4. Review from multiple angles: correctness, concurrency, security, performance, API/UX, tests, and maintainability.
5. Prefer structural findings over low-value nits.
6. Validate high-confidence findings with code references, tests, type information, or command output where practical.
7. Avoid speculative noise. If a concern depends on an assumption, state the assumption and confidence.

## Output format

Return a concise review with these sections:

1. **Scope reviewed** — target, extra context used, files/components inspected.
2. **Discovery summary** — current behavior, existing patterns, and key assumptions from `codebase-research`.
3. **Executive summary** — highest-risk themes in 3-5 bullets.
4. **Findings** — sorted by severity. For each finding include:
   - Severity: Critical / High / Medium / Low
   - Evidence: file path and line/function references
   - Why it matters
   - Suggested fix or alternative
   - Confidence: High / Medium / Low
5. **Design challenge** — argue against the current design and propose one better alternative, including trade-offs.
6. **Test gaps** — meaningful missing tests or tests that overfit implementation details.
7. **Open questions** — only questions that block confidence or change the recommendation.

If no issues are found, say so explicitly and still include the design challenge and any residual risks.

## Handoff
Close with the recommended next step:

- For a `plan.md` target with no blocking findings: `Review complete. Run /execute <absolute-path-to-plan.md> to implement it.`
- For a `plan.md` target with blocking findings: `Review complete. Address the findings above, then re-run /systematic-review <absolute-path-to-plan.md>, or return to /plan to revise.`
- For a code-only target with no plan: recommend the highest-priority next action instead of a pipeline handoff.
