---
description: Run a systematic code review against the codebase, a directory, or a file
argument-hint: "[target-path] [extra context]"
---
# Systematic Review

Target: `$1` (default: repository root / current codebase)
Extra context: `${@:2}`

If `$1` is provided, use the `resolve-worktree` skill to resolve it (no `$GLOB` — discovery is not applicable here). Switch context to the owning worktree before reading any files. If `$1` is empty, use the repository root of the current checkout.

Perform a full systematic code review. If `Target` is a directory, use it as the starting point but follow important callers, callees, tests, configs, and public interfaces outside that directory when needed. If `Target` is a file, review that file in context: read its tests, direct dependencies, callers, and relevant configuration.

Use the `codebase-research` skill before applying the review checklist. Separate discovery from critique: first document current behavior and existing patterns, then report findings with concrete evidence.

Do not edit files.

## Review checklist

Look for:

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

## Method

1. Use `codebase-research` to locate the target area, analyze current behavior, and find similar patterns.
2. Identify the project shape: language, package boundaries, test/build commands, entry points, and relevant guidance files.
3. Map the target area: core files, tests, dependencies, callers, and ownership boundaries.
4. Review from multiple angles: correctness, concurrency, security, performance, API/UX, tests, and maintainability.
5. Prefer structural findings over low-value nits: identify where deleting indirection, moving logic to the canonical layer, making state explicit, or splitting oversized files would simplify the system.
6. Validate high-confidence findings with code references, tests, type information, or command output where practical.
7. Avoid speculative noise. If a concern depends on an assumption, state the assumption and confidence.

## Output format

Return a concise review with these sections:

1. **Scope reviewed** — target, extra context used, files/components inspected.
2. **Discovery summary** — current behavior, existing patterns, and key assumptions from `codebase-research`.
3. **Executive summary** — highest-risk themes in 3-5 bullets.
3. **Findings** — sorted by severity. For each finding include:
   - Severity: Critical / High / Medium / Low
   - Evidence: file path and line/function references
   - Why it matters
   - Suggested fix or alternative
   - Confidence: High / Medium / Low
4. **Design challenge** — argue against the current design and propose one better alternative, including trade-offs.
5. **Test gaps** — meaningful missing tests or tests that overfit implementation details.
6. **Open questions** — only questions that block confidence or change the recommendation.

If no issues are found, say so explicitly and still include the design challenge and any residual risks.
