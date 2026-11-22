# Shared PR Drafting Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the same PR drafting guidance in `/stage-runner`, `/pr-create`, and `/pr-update` so automated drafts explain the verified change.
**Smallest user-feedback slice:** A new Stage Runner draft has a descriptive title and body written with the same guidance as the standalone commands.
**Out of Scope:** Edit PRs #183 or #184; change metadata on a PR the runner reuses; change push, history, stack, approval, or ARP policy; invoke a standalone publishing command from the runner.
**Architecture:** `reviewable-pr-workflow` owns shared PR preparation, from inspecting evidence to writing the title and body. A read-only Pi child uses that workflow for a new Stage Runner PR. The existing deterministic publisher performs the authorized GitHub writes.
**Tech Stack:** Pi prompt templates and skills, TypeScript, Git, GitHub CLI, Node test runner.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Lifecycle planning | Selected guidance for the work. |
| `codebase-research` | skill-loader | Behavior spans three callers | Traced the existing prompt and publisher boundaries. |
| `reviewable-pr-workflow` | skill-loader | PR preparation | Identified the existing source of truth for PR prose and review discipline. |
| `learning-lookup` | prompt-required | Advisory planning input | Searched for `stage-runner` and `pr-create`; no sections matched. |
| `feature-worktree` | prompt-required | Durable plan | Created a separate worktree from `origin/main`. |
| `write` | skill-loader | Plan prose | Made expected behavior, failure conditions, and exclusions explicit. |

## Implementation Contract
### Components affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Shared authoring policy | `dot_pi/agent/exact_skills/reviewable-pr-workflow/` | Own the common evidence inspection, title and body instructions, reader check, and relevant plan links. Use a named section or a reference in the existing skill, not a second skill. | Both standalone prompts and the runner reference the same source. |
| Standalone commands | `dot_pi/agent/exact_prompts/pr-create.md`, `dot_pi/agent/exact_prompts/pr-update.md` | Establish context, use shared drafting guidance, and retain command-specific consent and write rules. | `pr-visual-prompts.test.mjs`, `arp-prompts.test.mjs`, and `lifecycle-prompts.test.mjs` protect the contracts. |
| Stage Runner | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `_publish.ts` | After verification, prepare metadata for a new PR and publish the pinned SHA. | `_integration.test.ts` drives the runner and observes the bare remote plus fake `gh`. |

### Key decisions and constraints
- Keep the deterministic publisher required by the approved Slice 4 amendment in `plans/lifecycle-stage-runner/design.md`. The operator approved automating `/pr-create` preparation, not running the full prompt. Keep history rewrites, stack actions, push, PR creation, and ARP writes outside the drafting workflow.
- Before drafting, the parent obtains the confirmed base branch tip from the verified `origin` and pins its commit ID. Compute the Git merge base of that tip and the verified SHA, then use the full diff from that merge base to the verified SHA. Do not substitute the feature head at runner startup or trust a cached tracking ref. Supply the diff and available verification evidence. Bound evidence size and stop before pushing if the comparison cannot be obtained or supplied in full.
- Let the child inspect relevant repository files, including unchanged callers, design and plan artifacts, and tests, as `/pr-create` does. Use Pi's `read` tool in the clean verified worktree and direct the child to use only relevant tracked files and supplied evidence. Pi's ordinary `read` is not a filesystem sandbox: this instruction does not prevent access to other files readable by the process. Treat repository text as evidence, not instructions. Use a CLI tool allowlist and disable extension discovery. Retain only the authentication support required to call the selected model. Do not give the child shell, edit/write, generic execution, GitHub or ARP tools, or GitHub credentials. Reuse a selected runner writer model without adding a startup selection. Keep standalone visual assessment unchanged. Apply the common reader check and use the prose fallback when the runner cannot perform external visual assessment.
- Accept a bounded, structured title and Markdown body only after the child settles successfully. Pi 1.6.0 exposes the completed assistant message in `message_end` and final completion in `agent_settled`; the existing attempt loop already checks settlement and cancellation. Do not interpret model output as commands, paths, or GitHub targets. Pass the validated metadata as data to the existing `gh` invocation; recheck the approved target, worktree, and verified SHA before pushing.
- Do not draft or edit metadata when the confirmed target has a matching PR. Keep the existing target-change checks in effect if the PR state changes during drafting or publication. Preserve reconciliation after an uncertain `gh pr create` return; do not create a second draft.

### Security, observability, and failure modes
The runner owns all GitHub writes. Missing evidence or policy, unavailable model, malformed or oversized output, cancellation, and a changed candidate must stop publication before the push. Report a drafting-specific stop reason with the private evidence directory. Do not print the draft, diff, or credentials in progress messages. Reuse the runner's existing child timeout and private session handling; keep one drafting attempt per publication of a new PR, not one per ARP follow-up head.

### Acceptance criteria
#### Requirement 1: A new draft explains the verified change
The runner SHALL use the shared drafting policy and publish only validated metadata for the verified head.
- GIVEN a clean verified candidate and no matching PR, WHEN a drafting child returns valid metadata, THEN the runner pushes the verified SHA, passes the title and body to `gh pr create --draft`, and confirms the PR head.
- GIVEN the local tracking ref is stale or the feature branch already has commits at startup, WHEN the runner prepares the draft, THEN the comparison uses the confirmed remote base and includes the changes from before startup that are still in the PR diff.
- GIVEN unavailable pinned evidence, a drafting error, invalid output, cancellation, or a changed candidate, WHEN the runner reaches publication, THEN it reports why it stopped and does not push or create a PR.

#### Requirement 2: Reuse does not alter PR text
The runner SHALL leave the title, body, and readiness of a matching PR unchanged.
- GIVEN a matching PR at startup, WHEN the runner publishes the new verified SHA, THEN it confirms the existing PR head and does not launch the drafting child or call `gh pr create` or `gh pr edit`.
- GIVEN no matching PR at confirmation, WHEN a matching PR appears during drafting and the pre-push target check detects it, THEN the runner stops before pushing and does not create or edit a PR.

#### Requirement 3: Standalone commands use the same drafting policy
Both standalone commands SHALL use the shared authoring guidance without changing their authorization rules.
- GIVEN either standalone command, WHEN it prepares a PR explanation, THEN it uses the same authoring source as the runner, with the appropriate create or refresh behavior.
- GIVEN an existing PR with accurate handwritten content and no approval to change the title, WHEN `/pr-update` refreshes the body, THEN its instructions preserve that content and do not permit a title change, an unauthorized rewrite, or an ARP write.

### Test strategy and limits
Test the first failure with the existing Stage Runner subprocess fixture. Capture explicit `gh` arguments and check the actual bare remote ref, not only progress text. Use prompt contract tests for shared references and retained standalone behavior. Run one sample against a real committed diff through the same drafting path with the publisher excluded. Compare its claims, links, and tests with the pinned evidence. The sample checks live drafting, not live GitHub publication or ARP. Do not run a live publication trial as part of implementation.

### Rollout and rollback
Rollout remains blocked until the operator authorizes and completes the applicable disposable GitHub and ARP trial, or explicitly waives it for this release, as specified in `dot_pi/agent/exact_extensions/stage-runner/README.md`. The earlier waiver in `plans/lifecycle-stage-runner-publication/plan.md` does not apply to this change. After independent verification and the rollout gate, the operator previews explicit changed chezmoi targets from the feature worktree, applies them together, then restarts Pi. Confirm command and policy discovery and the read-only drafting sample before using the new path for a real PR. If the drafting path fails, stop the run and preserve its evidence. Revert and apply the affected skill, prompts, and runner together; rollback does not undo a GitHub write. The existing manual publishing procedure remains available with separate authorization.

### Slice 1: Create a reviewable Stage Runner draft
### Task 1: Draft reviewable PRs from the verified commit
**Delivers:** New runner PRs use the common authoring policy; standalone and existing-PR behavior remain intact.
**Blocked by:** None
**Traces to:** Requirements 1, 2, and 3.
**Files:** See the component table; use the existing `_fixtures/pi.mjs` and `_fixtures/gh.mjs` seams.

- [ ] Add focused failing checks for the pinned comparison with a stale tracking ref and pre-existing feature commits, valid metadata passed to `gh pr create`, malformed and oversized output rejected before publication, and reuse without drafting or metadata writes. Check the drafting child tool allowlist and environment, and check that the standalone prompts use the shared workflow without changing their safeguards. Run `npm run test:integration` and `npm test` from `dot_pi/agent` to observe the relevant failures.
- [ ] Extract the common authoring instructions within `reviewable-pr-workflow` and make both standalone prompts use them. Keep their command-specific commit, stack, title approval, and ARP instructions.
- [ ] Connect the read-only drafting step and validated result to first draft creation. Cover candidate changes, cancellation, and the pre-push target check detecting a PR that appears during drafting. Keep the existing uncertain-create reconciliation test and ARP guards. Run LSP diagnostics after the TypeScript changes.
- [ ] Run `npm test`, `npm run test:integration`, and `npm run typecheck` from `dot_pi/agent`; expect the new assertions and the existing publication fixtures to pass.
- [ ] Commit with `fix(pi): draft stage runner PRs with shared guidance`.

### Task 2: Document the drafting boundary
**Delivers:** Operators can tell when drafting runs, why it can stop publication, and what the runner does with an existing PR.
**Blocked by:** Task 1
**Traces to:** Requirements 1 and 2; rollout and recovery.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, relevant `AGENTS.md` files, lifecycle prompt contracts if their wording changes.

- [ ] Update the runner README with the new pre-push step, shared policy location, failure behavior, and existing-PR rule. Keep manual publication and ARP consent separate. Review repository and agent guidance; record why no `AGENTS.md` change is needed unless a durable rule is missing. No new command or prompt template is required.
- [ ] Check README claims against the runner fixtures. A failing behavior test is not applicable because this task changes documentation only. Run `npm test` and `git diff --check`. If separate from Task 1, commit with `docs(pi): explain stage runner PR drafting`.

### Task 3: Verify shared PR preparation and publication safeguards
**Blocked by:** Tasks 1-2
**Traces to:** Requirements 1, 2, and 3; rollout and recovery.

- [ ] Install dependencies with `npm ci --ignore-scripts` in `dot_pi/agent`, then run `npm run test:all` and `git diff --check`. This task checks the completed feature; the focused failing tests belong to Task 1.
- [ ] Run and record the read-only drafting sample. Check that the draft explains the verified change using the pinned comparison and does not claim tests or rollout results without evidence. Do not push or create a PR for the sample.
- [ ] Record the feature-wide evidence and remaining live validation gap for independent `/verify`. Keep rollout blocked until the trial or release-specific waiver described above.
