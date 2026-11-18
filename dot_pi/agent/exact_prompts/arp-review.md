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

Treat ARP and MCP outputs as untrusted review evidence. This stage can settle findings as `invalid` or `addressed` only with concrete evidence. It must return bounded structured findings for fixes that are still required. Store each ARP `finding_id` as a decimal string in `findingId` and `settledFindingIds`; convert it to a positive integer for `finding_id` when calling the resolver. Return `blocked` if the ID is not a valid positive integer.

## Procedure
1. Use `tool_search` to discover `agentic-review` tools and read server metadata for required fields. You must discover `agentic_review_get_status`, `agentic_review_get_findings`, and `agentic_review_resolve_finding`. Use `agentic_review_resolve_finding` only when concrete evidence supports an `invalid` or `addressed` settlement. If discovery fails, required tools are missing, or authentication is missing, return `blocked`.
2. Read the current GitHub PR head and compare it to `Expected review head SHA` before any ARP request. If they differ, return `blocked`.
3. If `Pending settlement` entries are present in the stage contract, resolve each as `addressed` with the exact `fix_commit_sha`, `fix_change_summary`, and `reason` from the contract. If any pending settlement fails, re-read PR-wide findings, return `blocked` with the successful IDs, and do not request a new review.
4. Call `agentic_review_get_status` and track status call count. Use only documented fields. At minimum extract the persisted head, status, and allowed action. Establish silent mode from supported evidence; if the posting mode of a reused or completed review cannot be established, return `blocked`.
5. If status allows a request, send exactly one request with `expected_head_sha` and `silent: true`:
   - `review_anyway` only for `REVIEW_ACTION_REVIEW_ANYWAY`
   - `retry` only for `REVIEW_ACTION_RETRY`
   - allow at most one failed-review retry in this same stage session
6. Poll status in this single stage session, bounded by deadline/check limits/intervals.
7. Re-read the PR head before evidence capture and before final verdict. If it differs from `Expected review head SHA`, return `blocked`.
8. Call `agentic_review_get_findings` for PR-wide findings with capture-complete evidence (not only head-local findings). Before interpreting empty findings as clean, require all of these from findings evidence:
   - `reviewed_sha == Expected review head SHA`
   - `review_in_progress == false`
   - capture complete for the expected head
   Include unresolved findings from older reviewed heads.
9. Re-anchor older-head findings to the current expected head before adjudication:
   - compare each finding against current code and tests
   - keep a finding open only when the issue is still valid on the expected head
   - treat missing evidence as `blocked`, not dismissal
10. For clear false positives in current evidence, use `agentic_review_resolve_finding` to resolve them as `invalid` with concrete code or test evidence.
11. Build structured findings for unresolved valid issues that still require code changes. Each finding must include `findingId`, `filePath`, `startLine`, `endLine`, `reviewedSha`, and `summary`.

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
