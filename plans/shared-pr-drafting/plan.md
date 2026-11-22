# Shared PR Drafting Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the same PR drafting guidance in `/stage-runner`, `/pr-create`, and `/pr-update` so automated drafts explain the verified change.
**Smallest user-feedback slice:** A new Stage Runner draft has a descriptive title and body written with the same guidance as the standalone commands.
**Out of Scope:** Edit PRs #183 or #184; change metadata on a PR the runner reuses; change push, history, stack, approval, or ARP policy; invoke a standalone publishing command from the runner.
**Architecture:** `reviewable-pr-workflow` owns the shared drafting policy. A read-only Pi child drafts metadata for a new Stage Runner PR, and the existing deterministic publisher performs the authorized GitHub writes.
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
| Shared authoring policy | `dot_pi/agent/exact_skills/reviewable-pr-workflow/` | Own the common title and body instructions, evidence checks, and relevant plan links. Use a named section or a reference in the existing skill, not a second skill. | Both standalone prompts and the runner reference the same source. |
| Standalone commands | `dot_pi/agent/exact_prompts/pr-create.md`, `dot_pi/agent/exact_prompts/pr-update.md` | Establish context, use shared drafting guidance, and retain command-specific consent and write rules. | `pr-visual-prompts.test.mjs`, `arp-prompts.test.mjs`, and `lifecycle-prompts.test.mjs` protect the contracts. |
| Stage Runner | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `_publish.ts` | After verification, prepare metadata for a new PR and publish the pinned SHA. | `_integration.test.ts` drives the runner and observes the bare remote plus fake `gh`. |

### Key decisions and constraints
- Keep the deterministic publisher required by the Slice 4 amendment in `plans/lifecycle-stage-runner/design.md`. Reusing the full `/pr-create` prompt would also give the child instructions to push, create a PR, and offer ARP; none of those instructions belongs in a drafting child.
- The runner supplies the drafting child with evidence tied to the confirmed base and verified SHA: the full PR diff or a read-only way to inspect it at pinned refs, relevant tracked project context, and available verification evidence. Do not assume a branch name, commit subjects, or the `VERIFIED` verdict alone explain the change. Treat repository text as evidence rather than authority to act. If the pinned evidence cannot be obtained, stop before pushing.
- Run the drafting child with only read access to the evidence. Use Pi's CLI tool allowlist and disabled extension discovery, retain only authentication support required to call the selected model, and exclude shell, edit/write, generic tool execution, and GitHub/ARP tools. Do not give the child the publisher's GitHub token. Reuse a selected runner writer model without adding a startup selection. Standalone visual assessment remains unchanged. The runner must perform the common reader check; when external visual assessment is not available in the restricted child, follow the workflow's prose fallback.
- Accept a bounded, structured title and Markdown body only after the child settles successfully. Pi 1.6.0 exposes the completed assistant message in `message_end` and final completion in `agent_settled`; the existing attempt loop already checks settlement and cancellation. Do not interpret model output as commands, paths, or GitHub targets. Pass the validated metadata as data to the existing `gh` invocation; recheck the approved target, worktree, and verified SHA before pushing.
- Do not draft or edit metadata when the confirmed target has a matching PR. Keep the existing target-change checks in effect if the PR state changes during drafting or publication. Preserve reconciliation after an uncertain `gh pr create` return; do not create a second draft.

### Security, observability, and failure modes
The runner owns all GitHub writes. Missing evidence or policy, unavailable model, malformed or oversized output, cancellation, and a changed candidate must stop publication before the push. Report a drafting-specific stop reason with the private evidence directory. Do not print the draft, diff, or credentials in progress messages. Reuse the runner's existing child timeout and private session handling; keep one drafting attempt per publication of a new PR, not one per ARP follow-up head.

### Acceptance criteria
#### Requirement 1: A new draft explains the verified change
The runner SHALL use the shared drafting policy and publish only validated metadata for the verified head.
- GIVEN a clean verified candidate and no matching PR, WHEN a drafting child returns valid metadata, THEN the runner pushes the verified SHA, passes the title and body to `gh pr create --draft`, and confirms the PR head.
- GIVEN a drafting error, invalid output, cancellation, or a changed candidate, WHEN the runner reaches publication, THEN it reports why it stopped and does not push or create a PR.

#### Requirement 2: Reuse does not alter PR text
The runner SHALL leave the title, body, and readiness of a matching PR unchanged.
- GIVEN a matching PR at startup, WHEN the runner publishes the new verified SHA, THEN it confirms the existing PR head and does not launch the drafting child or call `gh pr create` or `gh pr edit`.

#### Requirement 3: Standalone commands use the same drafting policy
Both standalone commands SHALL use the shared authoring guidance without changing their authorization rules.
- GIVEN either standalone command, WHEN it prepares a PR explanation, THEN it uses the same authoring source as the runner, with the appropriate create or refresh behavior.
- GIVEN an existing PR with accurate handwritten content and no approval to change the title, WHEN `/pr-update` refreshes the body, THEN its instructions preserve that content and do not permit a title change, an unauthorized rewrite, or an ARP write.

### Test strategy and limits
Test the first failure with the existing Stage Runner subprocess fixture. Capture explicit `gh` arguments and check the actual bare remote ref, not only progress text. Use prompt contract tests for shared references and retained standalone behavior. Run one sample against a real committed diff in read-only drafting mode with no push or GitHub writes; compare its claims, links, and tests with the pinned evidence. Fixtures prove control flow, not prose quality or live GitHub behavior. No live publication trial is in scope for this plan; do not report one as tested.

### Rollout and rollback
The operator previews explicit changed chezmoi targets from the feature worktree after verification and applies them together, then restarts Pi. Confirm command and policy discovery and the read-only drafting sample before using the new path for a real PR. If the drafting path fails, stop the run and preserve its evidence. Revert and apply the affected skill, prompts, and runner together; rollback does not undo a GitHub write. The existing manual publishing procedure remains available with separate authorization.

### Task 1: Draft reviewable PRs from the verified commit
**Delivers:** New runner PRs use the common authoring policy; standalone and existing-PR behavior remain intact.
**Blocked by:** None
**Traces to:** Requirements 1, 2, and 3.
**Files:** See the component table; use the existing `_fixtures/pi.mjs` and `_fixtures/gh.mjs` seams.

- [ ] Add focused failing assertions for metadata passed to draft creation, failure before push, and reuse without drafting or metadata writes. Add prompt checks for the common authoring source and retained safeguards. Run `npm run test:integration` and `npm test` from `dot_pi/agent` to observe the relevant failures.
- [ ] Extract the common authoring instructions within `reviewable-pr-workflow` and make both standalone prompts use them. Keep their command-specific commit, stack, title approval, and ARP instructions.
- [ ] Connect the read-only drafting step and validated result to first draft creation. Cover the candidate change and cancellation paths without weakening the existing publication and ARP guards. Run LSP diagnostics after the TypeScript changes.
- [ ] Run `npm test`, `npm run test:integration`, and `npm run typecheck` from `dot_pi/agent`; expect the new assertions and the existing publication fixtures to pass. Run and record the read-only sample described above. Install dependencies with `npm ci --ignore-scripts` before final verification and run `npm run test:all` per `AGENTS.md`.
- [ ] Commit with `fix(pi): draft stage runner PRs with shared guidance`.

### Task 2: Document the drafting boundary
**Delivers:** Operators can tell when drafting runs, why it can stop publication, and what the runner does with an existing PR.
**Blocked by:** Task 1
**Traces to:** Requirements 1 and 2; rollout and recovery.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, relevant `AGENTS.md` files, lifecycle prompt contracts if their wording changes.

- [ ] Update the runner README with the new pre-push step, shared policy location, failure behavior, and existing-PR rule. Keep manual publication and ARP consent separate. Review repository and agent guidance; record why no `AGENTS.md` change is needed unless a durable rule is missing. No new command or prompt template is required.
- [ ] Check README claims against the runner fixtures. Run `npm test` and `git diff --check`. If separate from Task 1, commit with `docs(pi): explain stage runner PR drafting`.
