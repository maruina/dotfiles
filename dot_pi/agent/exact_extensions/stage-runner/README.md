# Run a plan without publishing
Use `/stage-runner` for a reviewed, committed plan that nobody has started. The runner executes one slice at a time, simplifies the full feature once, and stops at an independent `VERIFIED` verdict. It instructs each child not to push, apply changes, or create a PR. This instruction is not an access control.

If execution has already started manually, finish manually: repeat `/execute` for the remaining slices, then follow the full-feature `/simplify` and `/verify` handoffs with all writer IDs. Manual verification can publish after `VERIFIED` unless publication is excluded. For per-slice verification and the legacy completion workflow, use [`/implement`](../ship-conductor/README.md).

## Start or cancel a run
1. Open interactive Pi 1.6.0 in a local Rex pane. Use a clean feature worktree with the plan tracked at `HEAD`. Confirm that the signing agent can sign child commits and that the scoped models include an authenticated verifier distinct from both writers.
2. Enter `/stage-runner plans/my-feature/plan.md`, replacing the example path with your plan. Select a model and a supported thinking level for execute, simplify, and verify. Check the plan path before confirming the run.
3. Watch the **Stage runner** entries in the invoking Pi transcript. They show the stage and attempt, when to use the Rex recovery pane, and the final result. On `VERIFIED`, review the reported evidence directory before deciding whether to publish separately.

To stop, enter `/stage-runner-cancel` in the invoking Pi session. Session shutdown also requests cancellation. Leave edits and commits in place. Check the reported run directory before starting more work; cancellation does not roll back a partial slice.

## Recover in the Rex split
- **Execute or simplify failed:** The runner resumes the failed writer's saved session. If it cannot establish that session's identity, it stops. In the recovery pane, address the blocker, run the slice checks, leave a clean worktree, and exit Pi. An idle prompt is not an exit. In the invoking pane, review the commit range and completed tasks before accepting the recovered writer. Execute must have committed task progress; simplify can leave the candidate unchanged. Refusal stops the run.
- **Verify failed or returned `BLOCKED`:** If the verifier left Git unchanged and an attempt remains, the split starts a fresh execute-model session with the failure details, not the verifier's transcript. Inspect the findings, repair the candidate, and exit with a clean worktree. Do not select the verifier model for repairs. A fresh verifier must check the full feature even if recovery changed nothing. The limit is three verifier launches, including startup failures. If the verifier changed Git state, inspect the worktree; the runner stops rather than asking a writer to adopt those edits.

## Investigate a retained lock
Run evidence lives under `~/.pi/agent/lifecycle-runs/`. Run directories use mode `0700`; private files use `0600`. The runner retains the newest 100 completed bundles, including stopped runs marked complete. It does not prune active or uncertain runs. Keep transcripts and failure details private; local permissions do not prevent Pi from sending context to its provider.

Read the reported `lock-…` file for the canonical worktree (`cwd`), runner PID (`pid`), bundle (`dir`), and recorded recovery state. Inspect `run.json` for the starting commit and plan blob. In the attempt directory, compare `handoff.json`, `failure.txt`, saved sessions, and `accepted.json` when present. A handoff alone does not prove advancement.

If split creation definitely failed, use the reported manual command only after checking the target worktree and Rex IDs. If the result is uncertain, do not repeat the split. Inspect the recorded session and pane in Rex and check their process identity against the recorded PID. Do not signal a process based only on a reused PID. Do not remove a lock while a run or recovery child could still use the worktree. If you cannot confirm exit, preserve the lock and evidence for investigation.

## Qualify, install, or roll back
Before installation, test the candidate prompts and extension with a temporary Pi agent directory and disposable feature worktrees. Use the same two-slice workload for manual and automated runs, with publication disabled. Confirm writer resume, detection of an earlier-slice defect, fresh writer and verifier histories, and recovery-pane cleanup with authenticated Pi and Rex. Fixture tests do not establish these results.

After qualification, from the feature worktree run `chezmoi --source "$PWD" diff <target-file>` for each changed managed file. Check the three lifecycle prompts under `~/.pi/agent/prompts/`, the files under `~/.pi/agent/extensions/stage-runner/`, agent guidance, and changed test scripts. Apply only reviewed files with `chezmoi --source "$PWD" apply <target-file>`, then reload Pi. Do not apply the entire agent directory.

To roll back, stop the runner and confirm its children have exited. Restore the prior prompts and guidance from the pre-feature revision through chezmoi, and remove only targets introduced for `stage-runner`. Reload Pi and check the legacy `/implement` command. Preserve operator commits, run bundles, and any lock whose owner might still be active.
