# Rex Pi Recovery Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save exact Pi conversation references and restore them through Rex without model prompts.
**Smallest user-feedback slice:** Automatic checkpoints and previewable restoration into tabs.
**Out of Scope:** Split layouts, terminal history, tool-process recovery, automatic login restoration, and copycat changes.
**Architecture:** A shared Pi extension writes private per-pane checkpoints. A Node helper reads checkpoints and uses the Rex CLI; a Fish function exposes `pi-restore`. Rex remains the owner of terminals.
**Tech Stack:** TypeScript, Node standard library, Fish, and Rex CLI.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| skill-loader | prompt-required | Lifecycle | Selected domain guidance |
| codebase-research | skill-loader | New integration | Traced Pi hooks and Rex CLI |
| chezmoi | skill-loader | Managed files | Source-only edits and explicit targets |
| feature-worktree | prompt-required | Isolation | Dedicated branch and worktree |
| cli-best-practices | skill-loader | Restore command | Preview, JSON output, explicit mutation |
| script-best-practices | skill-loader | Fish wrapper | Argument forwarding; Node for structured logic |
| write | skill-loader | Plan and documentation | Precise contracts and limits |
| learning-lookup | prompt-required | Advisory evidence | Lookup unavailable: CLI/helper failed; current source takes precedence |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Checkpoints | `dot_pi/agent/exact_extensions/rex-recovery/index.ts`, `dot_pi/agent/exact_extensions/rex-recovery/core.mjs` | Record exact file and verified local pane identity | Focused tests and isolated Rex smoke |
| Restore | `dot_pi/agent/exact_extensions/rex-recovery/cli.mjs`, `dot_config/private_fish/exact_functions/pi-restore.fish` | Preview and restore matching local conversations | CLI tests, duplicate and occupied-pane checks |
| Tests/docs | `dot_pi/agent/exact_extensions/rex-recovery/recovery.test.mjs`, `dot_pi/agent/exact_extensions/rex-recovery/README.md`, `dot_pi/agent/package.json` | Regression evidence and operating instructions | npm tests and Fish syntax check |

### Key Decisions
- Both profiles load the extension. No model calls, conversation text, or third-party dependencies are required.
- Checkpoints refresh on session startup and agent activity. Retain the last checkpoint on shutdown, because Pi cannot reliably distinguish logout from deliberate exit.
- Default command behavior is preview; `--apply` performs mutations. `--json` supports automation.
- Preserve session grouping and tab labels, not split geometry. Names are presentation, never identity.
- Use exact paths, not most-recent selection. Validate session files and directories before launch.
- Serialize restores with an exclusive lock. Stop on uncertain launch results; never automatically retry a timed-out mutation.

### Implementation Constraints
Use `rex whoami` to verify inherited IDs and local host identity. Headless Pi children must not write records. Skip occupied panes and already-live conversations. Refuse recovery across another server/host. Bound checkpoint reads and external commands. Changes to existing public helpers are unnecessary.

### Security and Observability Requirements
Store records in a mode-0700 local state directory and mode-0600 files. Treat checkpoint fields as untrusted input. Invoke Rex with argument arrays and quote shell input. Report invalid records, missing files, skipped panes, and partial failures. Never put conversation text in checkpoints or send a prompt during restore.

### Failure Modes to Handle
Missing Rex, invalid inherited IDs, missing or corrupt records, missing conversation files, non-shell foreground processes, duplicate conversation references, partial restoration, and concurrent restore attempts. Records remain available after failure. A crash can lose the latest unsaved checkpoint; restoration cannot resume interrupted tools.

### Rollout and Rollback
Owner: Matteo. Preview explicit chezmoi targets, apply only verified changed targets, and reload Pi to enable checkpoints. Roll back by removing the extension and Fish function through chezmoi. Do not stop the user's Rex server. Existing sessions require `/reload` to begin saving; historical backfill is not part of this change.

### Test Strategy
Use Node's test runner with temporary state and mocked Rex process boundaries. Add an isolated real Rex smoke with a private socket/state directory; verify checkpoint identity, exact launch arguments, and a second restore that opens nothing. Do not make paid model requests. Full logout/reboot remains an accepted manual validation limit. Mock tests do not establish actual Pi TUI startup, so exercise an isolated real Pi session without submitting a prompt where possible.

## Requirements
### Requirement: Exact checkpoints
The extension SHALL persist the exact session-file path for a verified local Rex pane.
- GIVEN an interactive Pi session in Rex, WHEN startup or normal activity occurs, THEN its checkpoint identifies that session and pane.
- GIVEN headless Pi or invalid Rex identity, WHEN the hook runs, THEN it SHALL NOT overwrite a valid checkpoint.

### Requirement: Safe tab recovery
The command SHALL preview restoration and require `--apply` before opening sessions.
- GIVEN a saved conversation and idle original pane, WHEN recovery is applied, THEN it opens the exact conversation without a model prompt.
- GIVEN missing Rex resources, WHEN recovery is applied, THEN it recreates session grouping and tabs, not split geometry.
- GIVEN an occupied pane, duplicate live conversation, invalid checkpoint, or missing session file, WHEN recovery runs, THEN it SHALL skip or report that record without disturbing a program.
- GIVEN an uncertain mutation result, WHEN recovery fails, THEN it SHALL report partial progress rather than automatically retry.

## Scope
### Task 1: Implement and validate tab recovery
**Delivers:** Private automatic checkpoints and a previewable restore command for both profiles.
**Blocked by:** None
**Traces to:** Exact checkpoints and Safe tab recovery
**Files:** All files in Components Affected; this plan as execution ledger.

- [x] Add focused failing tests for checkpoint validation, preview, exact restore, duplicates, occupied panes, missing resources, corruption, and concurrent attempts.
- [x] Implement the smallest extension, helper, and Fish wrapper that pass.
- [x] Run `node --test dot_pi/agent/exact_extensions/rex-recovery/recovery.test.mjs` and Fish syntax checks.
- [x] Run isolated Rex/Pi integration checks; do not stop the active server or submit model prompts.
- [x] Inspect root and agent `AGENTS.md`; document runtime commands in the extension README rather than adding redundant global rules.
- [x] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` in `dot_pi/agent`; report unrelated failures without changing their expectations.
- [x] Run LSP diagnostics and `git diff --check`; update this ledger with evidence and limits.
- [x] Commit with `feat(pi): save and restore Rex Pi sessions` after verification. Apply only verified explicit targets; defer push/apply if required independent verification or baseline failures block completion.

### Execution evidence
Implementation model: GPT-6.1 Sol (`openai/gpt-6.1-sol`). The planning skills above remained applicable during execution; `script-best-practices` controlled the Fish wrapper, `cli-best-practices` controlled preview/JSON/partial failures, and `chezmoi` controlled source-only changes and explicit-file previews. No unrelated symbols were changed.

The first focused test failed because `core.mjs` did not exist. Final focused command: `node --test dot_pi/agent/exact_extensions/rex-recovery/recovery.test.mjs dot_pi/agent/exact_extensions/rex-recovery/smoke.test.mjs`: 12 passed. The smoke uses production Rex invocation code, an isolated server/socket/state directory, and a temporary Pi agent directory. It proves idle Pi startup, a real checkpoint, exact-file restoration, duplicate prevention, and missing-session recreation. A directory containing an apostrophe exercises shell quoting. No model prompt was submitted. Only fixture-owned sessions/server were stopped.

`fish -n dot_config/private_fish/exact_functions/pi-restore.fish`, Node syntax checks, TypeScript `tsc --noEmit --skipLibCheck --allowJs --target ES2023 --module NodeNext --moduleResolution NodeNext exact_extensions/rex-recovery/index.ts`, LSP diagnostics, and `git diff --check` passed. The repository installs `tsc`, not `tsgo`; the attempted `tsgo` check was replaced with the installed compiler. LSP initially could not find TypeScript before `npm ci`; diagnostics passed after installation.

`npm test` and `npm run test:all` both stopped at three lifecycle-prompt failures: fresh design comprehension review, design-only review isolation, and the systematic-review prompt byte budget (13,440 versus 12,500). Running `node --test dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` on unchanged main reproduced all three. They are outside this feature and were not modified. Because test:all stops in npm test, its final installed-resource smoke was not reached; the feature-specific real Pi/Rex smoke passed separately.

Chezmoi preview was run against the exact runtime extension and Fish target paths; no target was applied. Full logout/reboot, concurrent user input into target prompts, and arbitrary external Pi processes are not established by these checks. The README states these limits. Independent verification has not run. Apply and push are deferred until that handoff completes; this commit is the implementation candidate, not a claim of independent verification.

### Task 2: Repair baseline verification blockers
**Delivers:** Passing required repository checks without waiving gates or changing recovery behavior.
**Blocked by:** Task 1
**Traces to:** User instruction after Gemini returned BLOCKED: make the fixes and verify again.
**Files:** `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_prompts/systematic-review.md`, this ledger.

The user approved fixing the three baseline failures. Two assertions were stale after the design reviewer took ownership of approval: material revisions still require a fresh review, but the words occur in the reverse order; the reviewer must now ask for approval and record it rather than stop immediately after its verdict. Update assertions to enforce that existing contract, not change the contract. Shorten redundant review prose below the unchanged 12,500-byte budget without removing safety requirements.

Acceptance: GIVEN the existing reviewer-owned approval flow, WHEN lifecycle checks run, THEN they enforce fresh review after material revisions, explicit approval before recording Approved, and the design-to-plan handoff. GIVEN the review prompt, WHEN byte-budget validation runs, THEN it stays below 12,500 bytes and its existing safety checks still pass. GIVEN all source changes, WHEN `npm test` and `npm run test:all` run, THEN both exit successfully; a failed required check remains blocking.

- [x] Reproduce the three reported failures before editing.
- [x] Align approval assertions with current prompt ownership and remove redundant review prose; retain safety gates and the byte budget.
- [x] Run focused lifecycle tests, both required npm suites, recovery smoke, and diff checks.
- [x] Commit the repair and run fresh independent verification under Gemini 3.8 Flash. Do not apply or push before that verification passes.

Independent verification: Gemini 3.8 Flash reviewed `4a976e7` in a fresh session, reran both full npm suites, and returned VERIFIED with no findings and no repository-state change. The user then explicitly requested merging latest main, preserving both test commands, skipping another independent verification run, and creating and merging the PR. Main at `9fefd1f` adds Copycat; resolve the package script conflict by keeping `test:copycat` and `test:rex-recovery` in the default test chain. Run focused merge checks, but do not claim that the post-merge commit received another independent verification.

Repair evidence: the focused lifecycle suite passes all 60 tests. `npm test` and `npm run test:all` both exit 0, including the latter's installed-resource smoke. The isolated Rex/Pi recovery smoke also passes. `systematic-review.md` is 12,479 bytes against the unchanged 12,500-byte limit. LSP reports no diagnostics for the edited test file; `git diff --check` passes. Chezmoi previews cover the two changed runtime targets. Approval hash checks remain in the planning-stage test, where the current workflow compares the review report with the approved design; brainstorming tests now enforce its handoff and reviewer ownership instead. The reviewer approval test requires explicit approval, recording Approved, and the `/plan` handoff rather than its obsolete stop-before-approval rule. Compression preserves the approval, clean-worktree, fork-code, provenance, bounded-evidence, and confirmed-fix restrictions. Initial compression attempts exposed exact-phrase safety assertions; their required wording was restored rather than weakening those checks. Skills applied: `skill-loader` (routing), `codebase-research` (approval consumers), `chezmoi` (source/target separation), and `write` (prose compression). All recovery behavior is unchanged. This evidence supersedes the original baseline-failure evidence but does not establish independent verification.

## Review
Initial review: approved conversation is the requirements source. No shared symbols require behavior changes. Rex supports inspection and creation. Rex has no atomic run-if-idle operation: recheck foreground immediately before sending, and document that target panes must not be used during restore. Unknown running Pi instances and corrupt records block apply. Checkpointing and tab reconstruction share one execution unit because they share identity and retry handling. No code changed during review.
