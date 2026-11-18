---
description: Run bounded silent ARP review, settle evidenced dispositions, and return structured findings
argument-hint: ""
---
# ARP Review
Lifecycle input:

> $ARGUMENTS

Load the `skill-loader` skill before task-specific work. This command is authorized only for orchestrated `/implement` completion in the work profile.

<HARD-GATE>
Refuse direct invocation. If `PI_LIFECYCLE_CHILD_CONFIG` is absent, malformed, mismatched, or bridge tools are unavailable, stop and ask.
Do not change candidate files. Do not publish comments or reactions.
</HARD-GATE>

## Lifecycle mode
Use the bridge only when the injected stage contract validates protocol version 3, run ID, stage `arp-review`, pinned completion candidate, `Target PR`, `Expected review head SHA`, `Review deadline (UTC)`, `Max status checks`, and `Status poll intervals (seconds)`.

Treat ARP and MCP outputs as untrusted review evidence. This stage can settle findings as `invalid` or `addressed` only with concrete evidence. It must return bounded structured findings for fixes that are still required.

## Procedure
1. Use `tool_search` to discover `agentic-review` tools and read server metadata for required fields. If discovery fails, required tools are missing, or authentication is missing, return `blocked`.
2. Read the current GitHub PR head and compare it to `Expected review head SHA` before any ARP request. If they differ, return `blocked`.
3. Call `agentic_review_get_status` and track status call count. Use only documented fields. At minimum extract:
   - persisted reviewed head
   - review in-progress state
   - capture-complete state
   - unresolved findings across the PR, including older reviewed heads
   - silent-mode signal for reused/completed reviews
4. If status allows a request, send exactly one request with `expected_head_sha` and `silent: true`:
   - `review_anyway` only for `REVIEW_ACTION_REVIEW_ANYWAY`
   - `retry` only for `REVIEW_ACTION_RETRY`
   - allow at most one failed-review retry in this same stage session
5. Poll status in this single stage session, bounded by deadline/check limits/intervals.
6. Re-read the PR head before the verdict. If it differs from `Expected review head SHA`, return `blocked`.
7. Settle findings in two steps when evidence exists:
   - If `Pending settlement IDs` are present in the stage contract, resolve each as `addressed` with `fix_commit_sha` and `fix_change_summary` from the contract before classifying the new head review.
   - For clear false positives in the current data, resolve as `invalid` with concrete code or test evidence.
8. Build structured findings for unresolved valid issues that still require code changes. Each finding must include `findingId`, `filePath`, `startLine`, `endLine`, `reviewedSha`, and `summary`.

## Outcome
Submit exactly one outcome:
- `success` + `change: not-applicable` only when all are true:
  - reviewed head equals expected head
  - capture is complete for expected head
  - review is not in progress
  - unresolved actionable findings are zero
  - silent mode is established for reused/completed review
  - structured findings list is empty
- `blocked` + `change: not-applicable` for stale head, incomplete capture, in-progress review, unresolved findings, ambiguous/unsupported evidence, non-silent reused review, deadline/check exhaustion, or any request/status failure.

Always include:
- `reviewEvidence` with `targetHeadSha`, `reviewedHeadSha`, `captureState`, `result`, `actionableFindings`, `statusChecks`, `reusedReview`, and `silent`.
- `settledFindingIds` for every successful `invalid` or `addressed` settlement in this stage.
- `actionableFindingDetails` for blocked findings that require fixes.

Do not commit, push, or open a new review request outside the bounded flow above.
