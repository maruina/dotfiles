---
description: Run a systematic code review against the codebase, a directory, or a file
argument-hint: "[target-path] [extra context]"
---
# Systematic Review

Target: `$1` (default: repository root / current codebase)
Extra context: `${@:2}`

Perform a full systematic code review. If `Target` is empty, review the codebase from the repository root. If `Target` is a directory, use it as the starting point but follow important callers, callees, tests, configs, and public interfaces outside that directory when needed. If `Target` is a file, review that file in context: read its tests, direct dependencies, callers, and relevant configuration.

Do not edit files. Investigate first, then report findings with concrete evidence.

## Review checklist

Look for:

- Duplicative code that should be common
- Abstractions that are too much or too little
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

1. Identify the project shape: language, package boundaries, test/build commands, entry points, and relevant guidance files.
2. Map the target area: core files, tests, dependencies, callers, and ownership boundaries.
3. Review from multiple angles: correctness, concurrency, security, performance, API/UX, tests, and maintainability.
4. Validate high-confidence findings with code references, tests, type information, or command output where practical.
5. Avoid speculative noise. If a concern depends on an assumption, state the assumption and confidence.

## Output format

Return a concise review with these sections:

1. **Scope reviewed** — target, extra context used, files/components inspected.
2. **Executive summary** — highest-risk themes in 3-5 bullets.
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
