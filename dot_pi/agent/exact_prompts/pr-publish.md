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
3. Capture the active GitHub login with `gh auth status --json hosts`.
4. Enforce account routing for every `gh` command in this stage:
   - use `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`
   - use `maruina` for every other repository, including `DataDog/*`
5. Read the current PR and remote branch head for this branch. Record the remote branch SHA as `remoteHead`, or record that the branch does not exist. Before any push, stop with `blocked` if publishing requires unsupported stack restructuring.
   - If no PR exists, push the exact verified branch, then run `gh pr create --draft`.
   - If a draft PR exists and `remoteHead != localHead`, push the exact verified branch, then re-read the PR head.
   - If a PR exists and is not draft, stop with `blocked` as an existing non-draft PR (do not change ready/non-draft state).
6. After create/update and any required push, capture the PR URL and pushed head SHA (`remoteHead`).
7. Confirm exact-head identity with bounded checks only:
   - Re-read at most 6 times over at most 60 seconds.
   - Stop `blocked` if identity is still not confirmed.
   - Never replace a required push with polling.
8. Restore the original GitHub login on both success and error paths, including timeout and cancellation, then verify the active login with `gh auth status --json hosts`. If restoration or verification fails, return `blocked`.
9. Submit one outcome only after the final read confirms exact-head identity:
   - `outcome: success`, `change: not-applicable`.
   - `prUrl` set to the draft PR URL.
   - `publishedHeadSha` set to the exact pushed PR head SHA.
   - `commitRefs` containing the same pushed PR head SHA.
10. Submit `blocked` when publication cannot complete safely or exact-head identity cannot be confirmed.

Never offer or request ARP review in this prompt. Completion review is owned by `arp-review`.
