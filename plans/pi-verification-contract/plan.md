# Pi Verification Contract Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/verify` closeout prompt that returns `VERIFIED` or `BLOCKED` after `/execute`, and make `/execute` direct completed work to it instead of claiming final verification.
**Architecture:** Add one global Pi prompt at `dot_pi/agent/exact_prompts/verify.md`, make a surgical lifecycle-handoff change in `dot_pi/agent/exact_prompts/execute.md`, and add a Pi-authored `## Current Model` context line to the existing `dot_pi/agent/exact_extensions/user-context.ts`. `/verify` resolves a candidate and requirements baseline, collects fresh change-aware evidence, requires model-separated semantic review for behavior-bearing work, and reports a binary verdict without modifying the candidate. Chezmoi renders the prompt sources to `~/.pi/agent/prompts/` and the extension to `~/.pi/agent/extensions/`.
**Tech Stack:** Markdown Pi prompt templates, Git, chezmoi, Pi-agent npm resource validation, Pi `/model` and `/new` session commands, optional `maat` diff analysis.

---

## Source of Truth and Boundaries

`plans/pi-verification-contract/design.md` is the approved source of truth for the contract, goals, non-goals, risk boundary, and rollout. This plan implements only its three declared components:

- create `dot_pi/agent/exact_prompts/verify.md`;
- modify `dot_pi/agent/exact_prompts/execute.md` only where its terminal verification claim and handoff need to change;
- add a `## Current Model` context line to the existing `dot_pi/agent/exact_extensions/user-context.ts` so `/execute` and `/verify` read a Pi-authored model identity.

Do not add a new standalone extension, preset, configuration file, shared helper, workflow router, or changes to `/brainstorm`, `/plan`, `/systematic-review`, or repository-wide `AGENTS.md`. The only extension change permitted is the current-model context line in the existing `user-context` extension. Do not make `/verify` edit, format, generate, apply chezmoi state, stage, commit, push, open/update a PR, or switch branches.

## Feasibility Gate

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Global `/verify` command | A top-level Markdown file in `dot_pi/agent/exact_prompts/` maps through chezmoi `dot_`/`exact_` naming to `~/.pi/agent/prompts/verify.md`; Pi discovers global `~/.pi/agent/prompts/*.md` templates non-recursively. | `dot_pi/agent/exact_prompts/` contains all current global commands; Pi `docs/prompt-templates.md` documents the global discovery path and frontmatter format. | After targeted apply, start Pi and confirm `/verify` appears in prompt-template completion; `npm run test:smoke` exits 0 with no `[Extension issues]`. | Block the implementation if the rendered prompt is not discovered; do not add an extension as a substitute. |
| Target-plan worktree resolution | Reuse the installed `resolve-worktree` skill with `**/plans/*/plan.md`; it resolves an existing path directly and sets the owning worktree as context. | `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md` documents direct-path and all-worktree resolution; `/execute` already uses this mechanism. | Manual `/verify <existing-plan-path>` run reports that plan's owning worktree before collecting Git evidence. | Return `BLOCKED` with the unresolved/ambiguous path; do not guess a worktree. |
| Complete candidate scope and base | Git captures commits relative to the selected base plus staged, unstaged, and intended untracked files. Reuse the base precedence already defined by `codex-review.md`: explicit context, `git machete show up`, open-PR base from `gh`, then remote default branch. | `dot_pi/agent/exact_prompts/codex-review.md` implements and documents that precedence; Git status/diff commands are available in repository guidance. | A temporary branch with both committed and uncommitted changes produces a report naming base and all four change classes; a conflicting base returns `BLOCKED`. | Return `BLOCKED` rather than silently falling back to a different base. |
| Fresh deterministic evidence | Use `git diff --check`, plan/repository/package-required commands, change-specific non-fixing checks, and `chezmoi --source <resolved-worktree> diff` for chezmoi changes. | `AGENTS.md` requires chezmoi source editing and diff-before-apply; `chezmoi diff --help` supports `--source`; `dot_pi/agent/package.json` exposes `npm test` and `npm run test:all`. | The verifier records each command and fresh result; a deliberately failing required command results in `BLOCKED`. | Missing required tool, credential, or command results in `BLOCKED`; only genuinely optional/inapplicable checks may be skipped with rationale. |
| Structural regression evidence when supported | Invoke `maat analyze <supported-pattern> --diff-base <selected-base>` only when the repository and changed language/package are supported. | The locally installed maat README documents `--diff-base`, exit code 0 for no regression, and exit code 1 for a regression. | On a supported Go repository, command output reports `diff.degraded: false` for a passing candidate; unsupported repositories record a skip. | Record a skip only when unsupported or inapplicable. If repository guidance or the plan requires maat, return `BLOCKED` when it is unavailable. |
| Human-enforced reviewer-model separation | The `user-context` extension injects a Pi-authored `## Current Model` line from `ctx.model`. `/execute` names that model in its handoff and instructs the user to run `/model`, `/new`, then `/verify`. `/verify` runs in the fresh session, reads its own injected `## Current Model`, and stops when it matches the implementation model named in the handoff. Pi performs the semantic review natively under the switched model; no separate review tool and no session-log parsing are used. | `ctx.model` (`Model` with `id`/`name`) is available in the `before_agent_start` hook per Pi `dist/core/extensions/types.d.ts`; `statusline.ts` already reads `ctx.model`; Pi `README.md` documents `/model` and `/new`; existing prompts already run in `/new` sessions. | A behavior-bearing candidate verified under a model different from the one named in the handoff reaches the semantic-review layer; a matching model or an unnamed model stops with a switch-and-retry instruction. | Instruct the user to switch models and re-run. Machine-enforced routing remains out of scope for presets. |
| Read-only verification and side-effect detection | Snapshot branch, HEAD, porcelain status, and candidate scope before checks; compare the same state after all checks. Select non-fix commands and inspect suspicious commands from the diff before execution. | The design requires this comparison; Git status and diff are available; `execute.md` already uses Git-state inspection. | A check that creates a tracked or untracked repository file causes `BLOCKED` and reports the delta. | Return `BLOCKED`; hand control back to `/execute` or the user for repair. |

## Implementation Contract

**Components Affected**

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Model context | `dot_pi/agent/exact_extensions/user-context.ts` | Inject a Pi-authored `## Current Model` line (from `ctx.model`) into session context via a small exported formatter helper. | `npm run test:unit` covering the new formatter helper; `npm run test:all` smoke check. |
| Verification contract | `dot_pi/agent/exact_prompts/verify.md` | Resolve target/base/scope, trace requirements, select and run fresh read-only evidence, require independent semantic review where applicable, compare state, and report `VERIFIED` or `BLOCKED`. | Prompt scenario exercise; `npm test`; `npm run test:all`; targeted chezmoi diff/apply. |
| Execution handoff | `dot_pi/agent/exact_prompts/execute.md` | Preserve executor checks but describe them as implementation evidence; direct plan-backed and trivial completion to `/verify` rather than a final success claim. | Diff review, rendered prompt inspection, Pi smoke validation, and handoff scenario exercise. |

**Key Decisions**

- Reuse prompt templates rather than add orchestration code. Pi performs the semantic review natively under a user-switched model; the design intentionally defers presets and automatic model routing.
- Enforce model separation through a deliberate human switch, not session-metadata proof. Surface the active model through a Pi-authored `## Current Model` line injected by the existing `user-context` extension; `/execute` names it and `/verify` reads its own and stops when they match.
- Extend the existing `user-context` extension rather than add a verification extension. The model line is generally useful context and reuses the `ctx.model` the statusline already reads.
- Run `/verify` in a fresh `/new` session after switching models for context independence. Do not parse session logs or write model provenance into the plan ledger.
- Use behavior effect, not extension, to classify risk. Pi prompts and skills are behavior-bearing even though they are Markdown; prose-only documentation may skip semantic review only with a recorded rationale.
- Preserve `/systematic-review` as the pre-execution gate. `/verify` is a separate, post-implementation closeout gate with fresh evidence.
- Use `chezmoi --source <resolved-worktree>` for verification because the configured default source can be the base checkout. `/verify` never runs `chezmoi apply`.

**Security Requirements**

- Inspect commands introduced by a suspicious or untrusted candidate before executing them; if safety cannot be established, report the command and return `BLOCKED`.
- Do not echo secrets, tokens, private keys, or unrelated sensitive environment data in the report or reviewer input.
- Treat permissions, security configuration, CI, infrastructure, executable scripts, dependencies, and Pi behavior changes as behavior-bearing.
- Do not grant the verifier mutation authority. Repository-state comparison is a required safety control, not a best-effort warning.

**Observability Requirements**

- This is a local workflow with no service runtime, metrics, alerts, dashboard, or on-call runbook.
- The report is the operational artifact: it MUST include worktree, branch, HEAD, base, diff scope, requirements source, risk classification, commands/results, the implementation model named in the handoff and the verifier's model when semantic review is required, findings/skips, initial/final state comparison, verdict, and the next non-mutating action.
- Keep passing reports concise; include detailed output for failures, gaps, skipped checks, and disputed findings.

**Failure Modes to Handle**

- Ambiguous target, base, or requirements baseline: return `BLOCKED` without guessing.
- No candidate change, unexplained unrelated change, failed deterministic command, uncovered acceptance scenario, or state mutation: return `BLOCKED` with the observed evidence.
- Missing required tooling/credentials: return `BLOCKED`; unsupported optional structural tooling is a documented skip.
- Verifier running under the same model named in the `/execute` handoff, or a handoff that named no model, for behavior-bearing work: stop and instruct the user to switch models and re-run.
- Confirmed material semantic regression or a material concern that cannot be confidently validated or dismissed: return `BLOCKED`. Pre-existing, out-of-scope, duplicate, speculative, and unsupported style findings are recorded with rationale but do not block.
- Any repair invalidates prior evidence. `/verify` must restart discovery and rerun all applicable successful layers instead of reusing prior green output.

**Rollout and Rollback**

- Roll out as one commit spanning the two prompts and the extension change. Validate the source, inspect the targeted rendered diff, then apply only `~/.pi/agent/prompts/verify.md`, `~/.pi/agent/prompts/execute.md`, and `~/.pi/agent/extensions/user-context.ts` after review.
- The prompt owner monitors representative behavior-bearing and non-behavioral runs for false positives, model-identity blocks, missed checks, and runtime cost before considering presets.
- Roll back by reverting the one implementation commit, then applying the same three target paths. No data migration, persistent state, or remote service rollback is needed.

**Test Strategy**

- Prompt Markdown has no repository prompt-body unit-test harness: `npm test` validates Pi resources/dependencies and `npm run test:all` adds the offline Pi smoke test, but neither proves the contract's semantic behavior. Use the reproducible manual contract scenarios below as the behavior tests.
- For every plan-backed scenario, require an implementation path, a covering test or supported executable check, fresh passing output, and semantic agreement among requirement, test, and implementation. Do not count plan checkboxes, historical logs, or `/execute` output as fresh evidence.
- Mock no internal application collaborator. `/verify` is an agent workflow prompt; its supported interfaces are Git, repository-declared checks, chezmoi, and the injected `## Current Model` context.

## Acceptance Requirements

### Requirement: Candidate and baseline resolution

The verifier SHALL resolve a unique target worktree, requirements baseline, comparison base, and complete candidate scope before it can return `VERIFIED`.

#### Scenario: Plan-backed candidate includes all change classes

- GIVEN `/verify` receives a resolvable `plans/<feature>/plan.md` and the selected worktree has branch commits, staged changes, unstaged changes, and intended untracked files
- WHEN it performs discovery
- THEN its report identifies the plan and sibling design when present, worktree, branch, HEAD, selected base, and each candidate change class
- AND it uses the plan/design as the requirements baseline rather than inferring intent from the diff

#### Scenario: Ambiguous or empty target blocks

- GIVEN base precedence conflicts without a resolvable winner, the requirements baseline materially contradicts itself, or no candidate change exists
- WHEN discovery completes
- THEN the verifier returns `BLOCKED`
- AND the report identifies the exact ambiguity or absence without selecting a fallback candidate

### Requirement: Fresh deterministic and traceability evidence

The verifier SHALL collect fresh, non-mutating evidence appropriate to the selected change and SHALL block when a required acceptance scenario lacks adequate implementation, executable coverage, or fresh passing output.

#### Scenario: Required check failure blocks

- GIVEN the plan, repository guidance, package metadata, or affected change declares a required check
- WHEN the verifier reruns that check in a non-fixing mode and it fails or its tool/credential is unavailable
- THEN the verifier returns `BLOCKED`
- AND its report includes the command, fresh failure summary, and reason it was required

#### Scenario: Scenario-shaped test does not cover required behavior

- GIVEN a plan acceptance scenario has a test or command that resembles the scenario but does not observe its stated outcome
- WHEN the verifier compares the requirement, implementation, test/check, and fresh result
- THEN the verifier returns `BLOCKED`
- AND the traceability report identifies the missing observable coverage

#### Scenario: Optional structural check is unsupported

- GIVEN the candidate is in a repository or language unsupported by maat and no repository guidance or plan requires maat
- WHEN change-specific checks are selected
- THEN the verifier records maat as inapplicable or unavailable with the reason
- AND it does not fail solely because that optional structural tool cannot run

### Requirement: Independent semantic review

The verifier SHALL require semantic review for every behavior-bearing candidate and SHALL accept that layer only when it is running under a model different from the implementation model named in the `/execute` handoff.

#### Scenario: Pi prompt change is behavior-bearing

- GIVEN the candidate changes a file under `dot_pi/agent/exact_prompts/`
- WHEN the verifier classifies risk
- THEN it classifies the candidate as behavior-bearing despite the Markdown extension
- AND it requires a semantic review before `VERIFIED` is possible

#### Scenario: Verifier model matches the implementation model

- GIVEN the candidate is behavior-bearing and the verifier is running under the same model named in the `/execute` handoff, or the handoff named no implementation model
- WHEN the verifier evaluates semantic-review eligibility
- THEN it returns `BLOCKED`
- AND the report states that the model must be switched and the run repeated

#### Scenario: Material reviewer concern remains unresolved

- GIVEN an independent reviewer reports a potentially material correctness, security, operability, compatibility, or maintainability concern attributable to the candidate
- WHEN the verifier validates the concern against the diff, code, tests, repository rules, and fresh evidence
- THEN it returns `BLOCKED` when the concern is confirmed or cannot be confidently dismissed
- AND it records rejected, pre-existing, duplicate, or non-blocking findings with concise evidence and rationale

### Requirement: Read-only binary closeout

The verifier SHALL not intentionally mutate the selected worktree and SHALL end every run with exactly one top-level verdict: `VERIFIED` or `BLOCKED`.

#### Scenario: Verification check changes repository state

- GIVEN the initial state snapshot is clean apart from the intended candidate
- WHEN a selected verification command creates or changes a tracked or untracked file in the worktree
- THEN final state comparison detects the new delta and returns `BLOCKED`
- AND the report names the state change and gives a repair/retry action without repairing it

#### Scenario: Non-behavioral candidate passes without semantic review

- GIVEN the entire candidate is demonstrably prose-only documentation, design/plan artifacts, comments/spelling, formatting-only content, or generated output mechanically validated against its source
- WHEN all applicable deterministic and traceability layers pass and final state matches the snapshot
- THEN the verifier may return `VERIFIED` without semantic review
- AND it records the written behavior classification and semantic-review skip rationale

## Task Sequence

### Task 1: Inject the current model into session context

**Files:** Modify `dot_pi/agent/exact_extensions/user-context.ts`; add a focused test to `dot_pi/agent/exact_extensions/user-context.test.mjs`.

**Traces to:** Independent semantic review; design decision to surface a Pi-authored `## Current Model` line.

- [x] Add a small exported pure helper (e.g. `formatCurrentModel(model)`) that returns the `## Current Model` context lines from a `{ id?, name? }` model and returns no lines when the id is absent, mirroring the existing `formatPR` helper style.
- [x] Call the helper inside the `before_agent_start` handler using `ctx.model`, appending the `## Current Model` section alongside the existing `## User Identity` block. Add no async work or new external calls.
- [x] Add a focused unit test in `user-context.test.mjs` (written failing first) that asserts the helper emits the heading and a `name (id)` line for a populated model and emits nothing for an undefined or id-less model.
- [x] Run `npm run test:unit` from `dot_pi/agent`; expect exit 0 with the new test passing.
- [x] Confirm `git diff --check` exits 0 for the changed files.

### Task 2: Add the read-only verification contract

**Files:** Create `dot_pi/agent/exact_prompts/verify.md`.

**Traces to:** Goal; Candidate and baseline resolution; Fresh deterministic and traceability evidence; Independent semantic review; Read-only binary closeout.

- [x] Start with Pi prompt frontmatter that describes `/verify` and accepts an optional plan path, then state the strict read-only hard gate and binary verdict contract.
- [x] Implement the five ordered prompt phases: target/requirements/base/scope resolution; behavior-risk classification; fresh deterministic and acceptance-scenario traceability evidence; model-separated semantic review; final state comparison and concise report.
- [x] Reuse the installed `resolve-worktree` skill for plan paths. Define base selection in the documented precedence, stop on material conflicts, and include committed, staged, unstaged, and intended untracked changes in scope.
- [x] Encode the deterministic-layer selection rules: complete state snapshot, `git diff --check`, required plan/repository/package checks, change-specific non-fixing checks, optional supported `maat` diff analysis, and source-explicit chezmoi diff for managed files. Require recorded reason for every selected, skipped, unavailable, or inapplicable layer.
- [x] Encode Given/When/Then traceability rules for plan-backed work and current-task baseline rules for work without a plan. Require an implementation path, observable test/check, fresh passing output, and semantic agreement; block gaps instead of accepting plan checkboxes or prior logs.
- [x] Encode behavior-bearing classification and the model-separation guard: read the implementation model named in the `/execute` handoff, read the model `/verify` is running under from the injected `## Current Model` context, and stop with a switch-and-retry instruction when the two match or the handoff named no model. Perform the semantic review natively under the current model, and encode reviewer finding triage without invoking a separate review tool or parsing session logs.
- [x] Encode command safety review, prohibited mutations, initial/final snapshot comparison, no reuse of green evidence after repair, and the exact required report sections and `VERIFIED`/`BLOCKED` outcomes.
- [x] Verify the source file is plain Markdown with valid frontmatter and that it adds no template syntax, secret, or implementation helper: `git diff --check -- dot_pi/agent/exact_prompts/verify.md` exits 0.

**Focused behavior validation (manual because no prompt-body test harness exists):** After Task 3 is rendered, run the four scenarios in the **Contract Exercise Procedure** below. Record the report output as validation evidence; do not add fixture files to the repository.

### Task 3: Replace executor finality with a verification handoff

**Files:** Modify `dot_pi/agent/exact_prompts/execute.md`; verify `dot_pi/agent/exact_prompts/verify.md` from Task 2 and the injected `## Current Model` context from Task 1.

**Traces to:** Goal; Read-only binary closeout; design decision to ship the minimal `/execute` handoff with `/verify`.

- [x] Update only the final verification/terminal-state/handoff language so executor-run checks remain required implementation evidence but are not represented as final independent verification.
- [x] Emit a copy-paste handoff block that names the implementation model (read from the injected `## Current Model` context) and directs the user to switch models and verify: `/model` to select a different model, `/new`, then `/verify <absolute-plan-path>` for plan-backed work or `/verify` for trivial bare-prompt work. Tell the user to confirm the injected `## Current Model` (also visible in the statusline) shows the intended model before running `/verify`. Preserve `/execute`'s existing review, execution, PR, and plan-ledger responsibilities.
- [x] Ensure `/execute` does not tell the verifier to commit, apply, repair, or reuse executor output as fresh verification evidence.
- [x] Review the implementation diff against the design non-goals: `git diff --check` exits 0; after excluding committed lifecycle artifacts under `plans/pi-verification-contract/`, the branch and working-tree diff names only `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_extensions/user-context.ts`, and `dot_pi/agent/exact_extensions/user-context.test.mjs` for the implementation slice.
- [x] Run `npm test` from `dot_pi/agent`; expect exit 0.
- [x] Run `npm run test:all` from `dot_pi/agent`; expect exit 0, including the offline Pi smoke check with no `[Extension issues]` output.
- [x] Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/verify.md ~/.pi/agent/prompts/execute.md ~/.pi/agent/extensions/user-context.ts` from repository root; expect a diff limited to the new `verify.md` target, the changed `execute.md` target, and the changed `user-context.ts` target. Apply only after review with `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/verify.md ~/.pi/agent/prompts/execute.md ~/.pi/agent/extensions/user-context.ts`.
- [~] Confirm Pi discovers the rendered prompt by opening prompt-template completion and finding `/verify`; invoke the handoff text on one plan-backed and one trivial completion case as specified in the Contract Exercise Procedure.
- [ ] Commit the implementation files only after validation passes (`verify.md`, `execute.md`, `user-context.ts`, and `user-context.test.mjs`): `feat(pi): add verification closeout contract`.

### Task 4: Documentation and future-agent guidance review

**Files to inspect:** `README.md` if present, `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/systematic-review.md`, `dot_pi/agent/exact_prompts/compound.md`, `dot_pi/agent/exact_prompts/simplify.md`, and the changed prompts. `compound.md`, `simplify.md`, and `systematic-review.md` carry explicit lifecycle narratives or a terminal `/execute` handoff and are the most likely to become inaccurate.

**Traces to:** Required Medium/Large plan documentation task; design non-goal to avoid unrelated workflow-prompt and general-guidance changes.

- [ ] Inspect user-facing documentation, developer documentation, READMEs, runbooks/operational docs, examples/generated references, and every relevant `AGENTS.md`.
- [ ] Update documentation only if it contains a durable, now-inaccurate statement that `/execute` is the final verification gate. Do not update unrelated lifecycle materials merely to advertise a new command.
- [ ] Record in the plan ledger why each inspected artifact required no update or identify the minimal updated path. Add `AGENTS.md` guidance only for durable source-of-truth, required-command, generation, testing, or rollout knowledge; the design currently indicates no such repository-wide rule is needed.
- [ ] Confirm final repository status contains only the intentional prompt and extension changes and the plan ledger update; do not absorb unrelated files. If another file is modified by validation, treat it as a verifier failure per the new contract and repair outside `/verify` before retrying.

## Contract Exercise Procedure

Run after targeted chezmoi apply and before the implementation commit. These are manual tests because the repository has no harness that can execute and assert an LLM prompt's reasoning or reviewer interaction. Use a disposable Git worktree outside this repository for candidate fixtures and delete it after each run; never commit the fixtures here.

1. **Empty candidate:** In a clean disposable worktree with no commits or local changes relative to its selected base, invoke `/verify`. Expected result: one top-level `BLOCKED` verdict that says there is no candidate change and includes the discovered worktree/base/state snapshot.
2. **Required-check failure:** In a disposable worktree, create a plan whose acceptance scenario names an executable check that exits non-zero and create an intended candidate change. Invoke `/verify <plan-path>`. Expected result: one top-level `BLOCKED` verdict with the exact command, fresh failure summary, and no semantic-success claim.
3. **Behavior-bearing prompt candidate under the same model:** In a fresh `/new` session running the same model named in the `/execute` handoff, or with no model named in the handoff, invoke `/verify` against this prompt change. Expected result: one top-level `BLOCKED` verdict that classifies the Markdown prompt change as behavior-bearing and instructs the user to switch models and re-run.
4. **Non-behavioral green path:** In a disposable worktree, make a prose-only documentation change with a clear current-task baseline and no repository-declared checks beyond hygiene. Invoke `/verify`. Expected result: one top-level `VERIFIED` verdict with a recorded non-behavioral rationale, explicit semantic-review skip, fresh `git diff --check` result, unchanged final state, and next action.
5. **State-mutating verification command:** In a disposable worktree with a clean snapshot apart from the intended candidate, drive `/verify` so a selected check writes a tracked or untracked file in the worktree. Expected result: one top-level `BLOCKED` verdict where final-state comparison names the new delta and gives a repair/retry action without repairing it.
6. **Ambiguous base:** In a disposable worktree where base precedence yields conflicting candidates without a resolvable winner, invoke `/verify`. Expected result: one top-level `BLOCKED` verdict that names the exact base ambiguity and selects no fallback candidate.

For every run, capture only command/status summaries necessary to establish the expected verdict. Redact credentials and delete the disposable worktree afterward. If the verifier is running under the same model named in the handoff, its expected `BLOCKED` result validates the switch-and-retry path; do not bypass it by asserting a different identity manually.

## Documentation Impact

The new prompt is self-documenting at its supported interface (`/verify`). No README, runbook, generated reference, or general `AGENTS.md` update is expected because the design explicitly excludes broad workflow-documentation changes. Task 4 verifies this expectation and records any exception in the plan ledger.

## Execution Ledger
- Task 1: Added the failing formatter test before implementation. After the user approved `npm ci` in `dot_pi/agent`, `npm run test:unit` passes (77 tests); the focused formatter test and `git diff --check` also pass. The install emitted expected pending-script warnings for `@google/genai` and `protobufjs`; no scripts were approved. The untracked `node_modules` directory was removed after validation because its presence conflicts with chezmoi's exact source rendering.
- Task 2: `verify.md` has valid prompt frontmatter, no Go-template delimiters, and passes `git diff --check`.
- Task 3: `npm test` and `npm run test:all` pass; the smoke test has no extension issues. Targeted chezmoi diff/apply changed only the three intended targets. API-level prompt-template loading discovered the rendered `/verify` prompt and expanded its plan-path argument. The interactive contract exercises remain pending because they require a human-operated Pi session and deliberate model switch.
