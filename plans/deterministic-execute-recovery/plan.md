# Deterministic Execute Recovery Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/implement` show why `execute` stopped and distinguish a clean worktree from a resolved blocker.
**Smallest user-feedback slice:** A typed execute blocker appears in the summary and recovery handoff, and cleanup alone does not offer an immediate retry of the same candidate.
**Out of Scope:** Rex design-review feature changes, a new manual checkpoint state, model selection on retry, changes to other stage outcomes, a higher recovery limit, and weaker approval or verification gates.
**Architecture:** The Pi child bridge validates the execute blocker and sends it through the existing outcome envelope. `ship-conductor` uses the envelope and the existing Git snapshots to select recovery options. The model diagnoses the blocker; the user confirms whether an external prerequisite changed.
**Tech Stack:** Pi extension, TypeScript, Node.js test runner, Git.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Plan workflow | Selected guidance for the protocol, CLI, prose, and worktree. |
| `codebase-research` | `skill-loader` | Cross-component recovery behavior | Traced the bridge outcome, coordinator decision, and recovery tests. |
| `cli-best-practices` | `skill-loader` | Recovery options and diagnostics | Kept the stop reason structured and independent of report prose. |
| `chezmoi` | `skill-loader` | Managed Pi files | Kept changes in source and identified the explicit-target rollout boundary. |
| `feature-worktree` | `prompt-required` | Durable plan | Created a dedicated worktree from `origin/main`. |
| `write` | `skill-loader` | Plan prose | Named the stop reason, candidate comparison, and user decision separately. |
| `learning-lookup` | `prompt-required` | Advisory learning lookup | The Obsidian query timed out; no advisory guidance was used. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Execute workflow | Selected code, CLI, documentation, and dotfile guidance. |
| `resolve-worktree` | `prompt-required` | Absolute plan path | Resolved the plan to its owning Git worktree. |
| `feature-worktree` | `prompt-required` | Source changes | Confirmed the plan's clean feature worktree and left `main` unchanged. |
| `codebase-research` | `skill-loader` | Cross-component recovery | Traced the bridge outcome, candidate digest, RPC parsing, and coordinator retry checks. |
| `cli-best-practices` | `skill-loader` | Stop diagnostics and recovery options | Kept the blocker separate from report prose and distinguished confirmation from retry. |
| `chezmoi` | `skill-loader` | Managed Pi files | Used the source worktree and kept rendered targets out of scope. |
| `write` | `skill-loader` | Plan ledger and prompts | Kept the stop diagnosis explicit and condensed the execute posture without raising the prompt budget. |
| `learning-candidates` | `prompt-required` | Prompt budget assumption | Recorded the context budget failure and how to check it before editing. |
| `rex` | `agent-selected` | Live Pi UI | Ran the smoke check in a separate Rex pane without changing the active session. |
| `diataxis` | `skill-loader` | Recovery how-to and protocol reference | Documented the operator choices separately from the outcome contract. |
| `script-best-practices` | `agent-selected` | Smoke launcher and evidence commands | Passed the candidate paths explicitly and checked command results. |

## Implementation Contract
### Components affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Child outcome | `dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts`, `_bridge.ts` in that directory | Require bounded, nonblank `step`, `reason`, `evidence`, and `nextAction` on an explicit blocked execute outcome. Preserve the existing report. | Protocol tests and a child that first submits an invalid stop, then corrects it and settles once. |
| Run and recovery | `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts` | Present the stop reason and pass the structured fields to recovery. Compare the clean recovered candidate with the candidate at the blocked outcome. | Coordinator fixture with setup commits before the stop, cleanup after the stop, and operator confirmation with unchanged `HEAD`. |
| Execution policy | `dot_pi/agent/exact_prompts/execute.md` | Continue authorized work until the current step has a real blocker. Require an actionable diagnosis; do not treat a later approval or live check as a current blocker unless the plan makes it a prerequisite. | Prompt contract test. |

### Decisions and constraints
- Scope the new blocker requirement and retry rule to explicit blocked outcomes from the slice `execute` stage. Do not change process-failure recovery or the simplify, verify, and completion contracts. The user confirmed this scope. Map schema consumers in the bridge, spawn path, coordinator, completion, run records, and fixtures before changing the shared protocol. Preserve access to historical reports and summaries; do not require old records to contain a blocker.
- Compare with the outcome's candidate, not the round's unit base or `candidateBefore`. Otherwise a baseline merge made by `execute` before it stopped could count as a recovery change. A dirty index or worktree becoming clean is not, by itself, evidence of blocker resolution. Use the existing snapshot fields only after checking how their digest is calculated; compare the committed candidate identity without counting cleanup as a change.
- Keep existing branch, cleanliness, scoped-plan, recovery-limit, cancellation, writer, and verifier checks. For an unchanged candidate, do not show the direct retry option. Offer a separately worded, non-default confirmation path for a resolved external prerequisite. Only explicit confirmation permits that retry. Dismissal or rejection does not start a child. If the candidate changed during recovery, retain the normal user-selected retry path; candidate movement does not prove the diagnosis was corrected.
- Offer a clear direct interactive handoff when the blocker remains unresolved. Use the same plan path and worktree; do not run a direct lifecycle command automatically. Do not change which tasks are complete or claim the slice is ready for release.
- Keep blocker content bounded, plain text, and local to the existing run record and UI. Normalize display text where the coordinator expects one line. The bridge can check shape and presence; it cannot validate the factual diagnosis. No report parsing, new external service, credential handling, or unbounded retry loop.

### Feasibility and validation
| Requirement | Mechanism | Evidence | Validation | If unavailable |
|---|---|---|---|---|
| Reject incomplete blocker data without ending the child | Existing `lifecycle_submit_outcome` validation rejects a failed submission and permits a corrected outcome | `_bridge.ts`, `_protocol.ts`, `_rpc.test.ts` | Run the real Pi 1.5.0 RPC fixture; observe a rejected call followed by one accepted outcome and orderly settlement | Block delivery until the real RPC check runs |
| Prevent cleanup-only retry | Coordinator owns recovery dialogs, captures clean candidates, and validates plan scope | `_conductor.ts` `handleStop`, `_worktree.ts`, `_conductor.test.ts` | Use fixture snapshots with a pre-stop merge, unchanged committed candidate after cleanup, and a subsequent attempt only after explicit external confirmation | Do not fall back to comparing report prose |
| Expose what stopped execution | Existing outcome and summary paths store typed decisions and report references | `_conductor.ts`, `_state.ts` | Assert concrete summary reason, structured handoff, and legacy summary rendering | Keep the run blocked rather than invent a reason |
| Preserve live approval and operator behavior | Existing Pi dialogs and isolated `/implement` smoke procedure | `AGENTS.md`, `ship-conductor/README.md` | Run candidate Pi in a disposable worktree with the candidate prompts and an isolated agent directory. Observe the blocked summary and recovery menu. Confirm that declining the external-prerequisite confirmation starts no child. | Leave the change unapplied and report the missing live evidence |

Tests can prove outcome validation, state transitions, and dialog options. They cannot prove that a model correctly diagnoses every blocker. The live run checks behavior in the Pi UI; it does not verify the separate Rex design-review feature.

### Rollout and rollback
The dotfiles owner controls rollout. Do not apply rendered targets before independent `/verify` confirms the candidate and required live evidence. Use explicit chezmoi targets from this worktree and reload Pi after application. Apply the matching bridge, coordinator, protocol, and prompt together. To roll back, stop any active run, revert the implementation, apply the same explicit targets, and reload Pi. Keep run records for diagnosis.

## Acceptance criteria
### R1: Actionable execute stops
- GIVEN an `execute` child submits `blocked` without complete blocker fields, WHEN the bridge validates the submission, THEN it rejects the call without settling the stage and accepts a corrected submission.
- GIVEN a valid blocked outcome, WHEN the coordinator records the stop, THEN the summary shows the concrete reason and recovery receives the structured blocker fields. Other stages retain their existing behavior.
- GIVEN the plan requires a later live check and that check is not a prerequisite for the current step, WHEN `/execute` processes the earlier step, THEN its instructions require it to continue authorized work rather than report the later check as a current blocker.

### R2: Recovery must distinguish cleanup from resolution
- GIVEN a blocked execute candidate, including any baseline merge made before the stop, WHEN recovery leaves the same commit clean, THEN the menu does not offer a direct retry. Declining or dismissing the external-prerequisite confirmation starts no child.
- GIVEN the same clean candidate, WHEN the user explicitly confirms that an external prerequisite changed, THEN the coordinator permits a fresh execute retry on that candidate.
- GIVEN recovery changes the committed candidate and passes existing safety checks, WHEN the user chooses retry, THEN the coordinator starts a fresh execute child. A dirty worktree or a disallowed plan change must still block retry.

## Tasks
### Slice 1: Deterministic execute recovery
### Task 1: Implement and test typed execute blockers and recovery choices
**Delivers:** Concrete blocker details and no immediate same-candidate retry after cleanup alone.
**Blocked by:** None
**Traces to:** R1, R2.
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts`, `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [x] Add focused failing protocol, RPC, coordinator, and prompt tests for R1 and R2. Cover absent and invalid blocker data, cleanup after a pre-stop baseline merge, external confirmation and dismissal, and unchanged behavior for non-execute stops.
- [x] Implement the smallest passing protocol, coordinator, and prompt changes. Record the exact candidate snapshot at outcome submission (`candidateAtStop`) in stage/stop records so the post-recovery check compares against that commit rather than `candidateBeforeStage`. Check TypeScript diagnostics and rerun focused tests after any refactoring.
- [x] From `dot_pi/agent`, run `npm ci --ignore-scripts`, `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`, and `npm run test:prompts`. Require the Pi 1.5.0 RPC tests to run and pass, not skip. Keep dependencies until independent verification and the full suites finish.
- [x] Commit with `fix(pi): make execute blocker recovery deterministic`. Do not apply or publish yet.

Evidence: The focused protocol, RPC, coordinator, and prompt tests failed before the fix and passed afterward. TypeScript diagnostics reported no errors in the changed files. `npm ci --ignore-scripts` passed. With `$HOME/.pi/agent/install/releases/1.5.0/node_modules/.bin` first on `PATH`, the targeted ship-conductor suite passed 202 tests with no skips, including the real Pi RPC suite. The first `npm run test:prompts` failed because `execute.md` grew to 14,930 bytes. Condensing the execute posture reduced it to 14,445 bytes without changing the 14,500-byte limit; all 103 prompt tests then passed.

### Task 2: Validate the live handoff and document recovery
**Delivers:** Live evidence and instructions for the operator.
**Blocked by:** Task 1
**Traces to:** R1, R2, rollout and rollback.
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/README.md`, `AGENTS.md`, `dot_pi/agent/AGENTS.md`, this plan ledger.

- [x] In a disposable worktree and isolated candidate Pi agent directory, run a committed smoke plan whose execute child stops on an intentionally absent local prerequisite. Check the concrete reason in the summary after stopping. Retry the smoke scenario, choose recovery without changing the candidate or prerequisite, and check the available actions. Decline the external-prerequisite confirmation and check that no retry starts. Do not simulate approval by editing the run record or modify rendered Pi targets. Record exact invocation, candidate, observations, and cleanup in the plan ledger.
- [x] Update the coordinator README with the new recovery options and their limits. Inspect both `AGENTS.md` files and record why no change is needed unless they lack durable guidance required for this path.
- [x] Run `git diff --check`, `npm test`, and `npm run test:all` from `dot_pi/agent`. Use the isolated candidate agent directory for the Pi smoke command. Record results and leave apply and publication to verified closeout.
- [x] Commit with `docs(pi): explain execute blocker recovery`.

Live smoke: The disposable worktree started from implementation commit `3341308` and had smoke plan commit `51aafe71a6c16dbeb16f34c1f39be7611bca1d8f`. The isolated agent directory used the candidate prompts and `pi-client-session-id`, loaded only the gateway package, and did not load MCP servers. Launch:

```sh
rex run -s "$REX_SESSION" -c /tmp/pi-execute-recovery.wcGhuL0D/worktree --label 'Execute recovery smoke' --focus=false --keep-open --json -- env PI_CODING_AGENT_DIR=/tmp/pi-execute-recovery.wcGhuL0D/agent /Users/matteo.ruina/.local/bin/pi --no-mcp --no-session --models gpt-6.2-sol,gpt-6.2-astra --model gpt-6.2-sol --thinking low --extension /tmp/pi-execute-recovery.wcGhuL0D/worktree/dot_pi/agent/exact_extensions/ship-conductor/index.ts
```

- Ran `/implement /tmp/pi-execute-recovery.wcGhuL0D/worktree/plans/smoke-execute-recovery/plan.md` twice in Pi 1.5.2. Selected Sol for execute and simplify, Astra for verify, and low thinking for all stages.
- First run `4ae7c1b1-7a8d-4d5e-bdde-49cabd0b84c0`: selected **Stop**. The summary said `Reason: Operator prerequisite file is missing` and gave the direct `/execute` handoff for the smoke plan.
- Second run `5a804961-5f56-45c7-84af-d4e2939c5c8e`: selected **Recover**. The session model confirmed the file was still absent and did not change Git. The menu showed **Recover again**, **Stop**, and **Confirm external prerequisite changed**, with no direct retry. Selected confirmation, then **Keep stopped**. The two runs each had one execute config, zero verification attempts, and no later stage. `HEAD` still matched `candidateAtStop.head`, `git status --porcelain` was empty, and no coordinator lock remained. Only the UI supplied operator choices.
- Cleanup: Pi exited with code 0. Closed the smoke Rex tab and removed the disposable worktree and its branch. Kept the private agent directory and captures under `/tmp/pi-execute-recovery.wcGhuL0D` because the shell guard prohibits recursive deletion. No rendered target changed.
- Guidance inspection: `AGENTS.md` already requires the isolated live test, real Pi 1.5.0 RPC coverage, and structured lifecycle outcomes. `dot_pi/agent/AGENTS.md` already assigns lifecycle rules to the templates. Neither needs a change.

Final checks: `git diff --check`, `npm test`, and `npm run test:all` passed. Ran both npm commands serially from `dot_pi/agent` with Pi 1.5.0 first on `PATH` and the isolated `PI_CODING_AGENT_DIR`; the agent directory also discovered the candidate coordinator for `test:smoke`. The unit suite reported 472 passes and three unrelated Rex startup skips, with no failures. The first parallel run of the two suites failed because both TypeScript LSP integration tests wrote `node_modules/.pi-lsp-integration.ts`. The serial rerun passed without code or test changes. Dependencies remain available for independent verification.

## Learning candidates
- 2026-11-19: `execute.md` had only two bytes of headroom before this change. Check the per-template byte budget before adding lifecycle policy; condense existing instructions without weakening them — evidence: `npm run test:prompts` first rejected 14,930 bytes against the 14,500-byte limit in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
- 2026-11-19: Run `npm test` and `npm run test:all` serially in one Pi source worktree. Both runs of the TypeScript integration test write `node_modules/.pi-lsp-integration.ts` — evidence: simultaneous runs failed in `dot_pi/agent/exact_extensions/lsp/__tests__/lsp.test.mjs`; both commands passed serially without code changes.
