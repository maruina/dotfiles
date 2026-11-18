---
description: Publish a verified candidate to a draft PR in orchestrated completion mode
argument-hint: ""
---
# PR Publish
Lifecycle input:

> $ARGUMENTS

Load the `skill-loader` skill before task-specific work. This command is authorized only for orchestrated `/implement` completion in the work profile.

<HARD-GATE>
Refuse direct invocation. If `PI_LIFECYCLE_CHILD_CONFIG` is absent, malformed, mismatched, or the bridge tools are unavailable, stop and ask. Do not call `/pr-create` or `/pr-update` from this prompt.
</HARD-GATE>

## Lifecycle mode
Use the bridge only when the injected stage contract validates protocol version 3, run ID, stage `pr-publish`, pinned baseline, pinned completion candidate, selected model, and both `lifecycle_request_decision` and `lifecycle_submit_outcome` tools.

The candidate is already verified implementation output. Keep repository state unchanged except for publishing to GitHub. Do not open a non-draft PR, mark a PR ready, merge, or rewrite stack structure.

## Procedure
1. Confirm the worktree is clean, on the pinned branch, and still at the pinned completion candidate head.
2. Capture the exact local head SHA (`localHead`).
3. Read the current PR for this branch. If no PR exists, create one as draft. If a PR exists, keep it draft.
4. Capture the PR URL and current pushed head SHA (`remoteHead`).
5. If `remoteHead != localHead`, push the branch and re-read the PR head to confirm `remoteHead == localHead`.
6. Submit one outcome only after the final read confirms exact-head identity:
   - `outcome: success`, `change: not-applicable`.
   - `prUrl` set to the draft PR URL.
   - `publishedHeadSha` set to the exact pushed PR head SHA.
   - `commitRefs` containing the same pushed PR head SHA.
7. Submit `blocked` when publication cannot complete safely or exact-head identity cannot be confirmed.

Never offer or request ARP review in this prompt. Completion review is owned by `arp-review`.
