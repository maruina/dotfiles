# Pi Lifecycle Model Recommender Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an advisory Pi extension that recommends approved model and thinking settings before lifecycle prompt expansion, while keeping the policy compatible with refreshed model catalogs.
**Architecture:** A pure policy module owns lifecycle command matching and the three-position recommendation matrix. A thin Pi `input` adapter handles confirmation and fail-open application, while the existing model-sync prompt runs the policy/catalog compatibility test and requires explicit approval before adopting replacement models.
**Tech Stack:** TypeScript, Pi 0.80.6 extension APIs, Node.js `node:test`, `@earendil-works/pi-ai`, npm, and chezmoi

---

## Goal and Scope
Implement the first version approved in `plans/pi-lifecycle-model-recommender/design.md`:

- Recommend lower-cost, approved, and higher-quality model/thinking choices for `/brainstorm`, `/plan`, `/systematic-review`, `/execute`, and `/verify`.
- Require confirmation before changing model or thinking settings.
- Continue lifecycle prompt expansion unchanged on cancellation, unavailable interaction, queued input, missing models, authentication failure, thinking-level clamping, or extension errors.
- Validate policy identities and thinking levels against the managed work-profile model catalog.
- Extend `/sync-pi-models` to review policy compatibility after catalog refreshes without automatically promoting newly introduced models.

Out of scope:

- Task-complexity inference, exact price calculation, telemetry, persistence, extra model calls, custom terminal components, lifecycle prompt changes, automatic model promotion, or direct catalog parsing in the runtime extension.
- Changes to `dot_pi/agent/models.json.tmpl`; the current catalog already contains every approved identity and capability.

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Lifecycle policy | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts` | Own exact command parsing, model identities, choices, qualitative cost classes, and rationales | `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts` |
| Policy/catalog tests | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.test.ts` | Verify the complete matrix, exact matching, managed-catalog identities, and supported thinking levels | Focused policy test exits 0 |
| Pi adapter | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts` | Register the `input` hook, present confirmation, apply selected settings in order, and fail open | Focused adapter test and candidate-specific Pi smoke command |
| Adapter tests | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_adapter.test.ts` | Exercise the registered input handler against mocked Pi runtime boundaries | `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_adapter.test.ts` |
| Test registration | `dot_pi/agent/package.json` | Include both recommender tests in the existing unit suite in source and rendered layouts | `npm test` |
| Catalog maintenance prompt | `dot_pi/agent/exact_prompts/sync-pi-models.md` | Add model-delta reporting, policy compatibility validation, explicit replacement approval, and scoped apply instructions | Rendered prompt inspection and targeted chezmoi diff |

**Key Decisions**
- Use the Pi `input` event because Pi awaits it before skill and prompt-template expansion.
- Match only a lifecycle command at character zero followed by whitespace or end of input. Arguments do not change phase selection; escaped text, prose, and similar prefixes do not match.
- Handle direct `interactive` and `rpc` input. Pass extension-injected input through unchanged so one extension cannot unexpectedly open another extension's dialog.
- Use `ctx.ui.select()` rather than a custom component so TUI and RPC share one supported interface.
- Leave TUI dialogs untimed. Pass `{ timeout: 30000 }` only in RPC mode; timeout is equivalent to Keep current settings.
- Resolve the selected provider/model through `ctx.modelRegistry.find()`, await `pi.setModel()`, and set thinking only after model selection succeeds.
- Compare the effective thinking level after setting it and warn when Pi clamps it.
- Keep the policy as checked-in TypeScript. The runtime extension does not read `models.json`; tests and `/sync-pi-models` own compatibility validation.
- Treat new catalog entries as review candidates, not automatic replacements. A missing referenced model or unsupported thinking level requires an explicit policy decision.
- Use Pi AI's `getSupportedThinkingLevels()` in tests rather than duplicating Pi's capability rules.
- Do not add shared tracing or telemetry. Dialogs, notifications, warnings, and Pi's visible model/thinking status provide sufficient local observability.

**Security Requirements**
- The extension MUST use Pi's registry and `setModel()`; it MUST NOT execute provider authentication commands, read credentials, or call provider APIs directly.
- Warnings MUST identify only the provider/model and effective thinking level; they MUST NOT expose API-key commands, resolved headers, credentials, prompt arguments, or catalog secrets.
- Raw input arguments MUST be used only to identify the leading command and MUST NOT be persisted or logged.
- The catalog test MAY render the work-profile template with dummy prompt values, but it MUST NOT execute command-backed API-key values.

**Observability Requirements**
- Show an informational notification when current settings already match the recommendation.
- Show warnings for queued lifecycle input, unavailable selected models, failed model authentication, and unexpected thinking-level clamping.
- Do not add metrics, traces, alerts, dashboards, or runbooks. This is a local advisory extension with no background process or production service.

**Failure Modes to Handle**
- No dialog-capable UI: continue unchanged without mutation.
- RPC client does not answer: the 30-second RPC-only timeout resolves as cancellation and continues unchanged.
- Steering or follow-up delivery: warn when UI exists, do not mutate the active run, and continue unchanged.
- Selected model absent from the runtime registry: warn and continue with current settings.
- `pi.setModel()` returns false: warn, leave thinking unchanged, and continue.
- Requested thinking level is clamped: keep the successfully selected model and effective level, warn with that level, and continue.
- User selects Keep current settings or cancels: perform no registry lookup or mutation and continue.
- An unexpected handler error: rely on Pi's documented extension error isolation; never return `handled` or transform lifecycle input.
- Refreshed catalog removes a policy model or capability: the focused catalog test fails, and `/sync-pi-models` stops for an explicit replacement decision before declaring synchronization complete.

**Rollout and Rollback**
- Smallest safe rollout: obtain an independent `VERIFIED` verdict on the source candidate, inspect targeted diffs, then have Matteo apply only `~/.pi/agent/extensions/lifecycle-model-recommender` and `~/.pi/agent/prompts/sync-pi-models.md` from the verified worktree before completing the normal push/merge workflow.
- Do not apply candidate targets during `/execute`; independent `/verify` must inspect the source candidate first.
- After apply, `/reload` or a new Pi session loads the extension. The next ordinary lifecycle invocation provides the user-visible rollout check as part of its intended model turn.
- Fastest rollback: revert the recommender and sync-prompt commits, inspect `chezmoi --source "$PWD" diff ~/.pi/agent/extensions ~/.pi/agent/prompts/sync-pi-models.md`, then apply the exact extensions directory and the sync prompt. No persistent state or remote cleanup is required.
- A catalog-only rollback does not require recommender state migration; restore the prior managed catalog and policy commit together when their identities changed.

**Test Strategy**
- Mock only Pi's runtime boundary: handler registration, UI, registry lookup, current model, model selection, and thinking getters/setters. Invoke the actual registered `input` handler and assert observable return values, UI calls, and mutations.
- Keep policy tests table-driven. Render the real work branch of `models.json.tmpl` with chezmoi when running from the source tree, or parse sibling `models.json` when running from the rendered target. Do not duplicate a model catalog fixture.
- Use `getSupportedThinkingLevels()` to verify every policy choice. Add negative test cases proving the catalog assertion detects a removed model and an unsupported thinking level.
- The narrow commands that fail before implementation are the focused Node test commands: they initially fail with `ERR_MODULE_NOT_FOUND` for `_policy.ts` and `index.ts`, respectively.
- Prompt behavior is not executed in an automated model session because `/sync-pi-models` mutates the user's live catalog and a text-presence test would couple to wording rather than semantics. Validate the rendered prompt with the reproducible inspection in Task 3 and rely on the automated policy/catalog test as its executable gate.

## Acceptance Criteria
### Requirement R1: Deterministic lifecycle policy
The policy module SHALL map every supported lifecycle invocation to the approved lower-cost, recommended, and increase-quality choices, and SHALL reject non-command lookalikes.

#### Scenario R1.1: Approved matrix
- GIVEN the five supported lifecycle commands
- WHEN the policy lookup runs for each command
- THEN every lower-cost, recommended, and increase-quality choice matches the provider, model ID, thinking level, qualitative cost class, and model label approved in the design
- AND every choice has a concise phase-specific rationale
- AND no choice uses `max` or GPT-5.6 Luna

#### Scenario R1.2: Exact command matching
- GIVEN commands with arguments, similar prefixes such as `/planning`, escaped command text, and prose containing `/plan`
- WHEN the parser examines the raw input
- THEN a command at character zero followed by whitespace or end of input maps to its phase
- AND all lookalikes return no phase

#### Scenario R1.3: Catalog compatibility
- GIVEN the rendered managed work-profile model catalog
- WHEN the focused policy test checks every choice
- THEN every provider/model pair exists
- AND Pi reports the requested thinking level as supported

### Requirement R2: Recommendation interaction
The extension SHALL show the approved recommendation before lifecycle prompt expansion when direct TUI or RPC input is idle and current settings differ.

#### Scenario R2.1: Settings already match
- GIVEN the current provider, model ID, and thinking level equal the phase recommendation
- WHEN the user invokes that lifecycle command
- THEN the extension emits one compact informational notification
- AND opens no dialog, performs no mutation, and returns `continue`

#### Scenario R2.2: Settings differ
- GIVEN idle direct user input with a mismatched model or thinking level
- WHEN the user invokes a lifecycle command
- THEN the extension presents Apply recommendation, Lower cost, Increase quality, and Keep current settings in that stable order
- AND each policy option shows its model label, thinking level, qualitative cost class, rationale, and current-setting marker when applicable
- AND RPC supplies a 30-second timeout while TUI supplies no timeout

### Requirement R3: Confirmed application only
The extension SHALL mutate model and thinking settings only for an explicitly selected policy choice.

#### Scenario R3.1: Apply any policy choice
- GIVEN the user selects the recommendation, lower-cost, or increase-quality option
- WHEN the selected model exists and authenticates
- THEN the extension awaits model selection before setting thinking
- AND returns `continue` without rewriting the lifecycle command or its arguments

#### Scenario R3.2: Keep, cancel, or timeout
- GIVEN the user selects Keep current settings, cancels the dialog, or an RPC dialog times out
- WHEN the selection resolves
- THEN no registry lookup, model mutation, or thinking mutation occurs
- AND the extension returns `continue`

### Requirement R4: Unsafe delivery contexts remain unchanged
The extension SHALL avoid model or thinking mutations when confirmation is unavailable or the input could affect an active run.

#### Scenario R4.1: Print and JSON modes
- GIVEN a lifecycle command in print or JSON mode with `ctx.hasUI` false
- WHEN the input handler runs
- THEN it performs no UI or model interaction
- AND returns `continue`

#### Scenario R4.2: Queued lifecycle command
- GIVEN a lifecycle command delivered as steering or follow-up input
- WHEN the input handler runs
- THEN it performs no registry lookup or mutation
- AND warns when UI is available
- AND returns `continue`

#### Scenario R4.3: Unrelated or extension-injected input
- GIVEN non-lifecycle text or lifecycle text with `event.source === "extension"`
- WHEN the input handler runs
- THEN it performs no UI, registry, or mutation calls
- AND returns `continue`

### Requirement R5: Routing failures fail open
The extension SHALL preserve lifecycle command usability when a confirmed route cannot be applied exactly.

#### Scenario R5.1: Model missing or unauthenticated
- GIVEN the selected provider/model is absent or `pi.setModel()` returns false
- WHEN the extension applies the selection
- THEN it warns with non-sensitive identity information
- AND does not set thinking
- AND returns `continue`

#### Scenario R5.2: Thinking level is clamped
- GIVEN model selection succeeds but Pi reports a different effective thinking level after the setter
- WHEN application completes
- THEN the extension warns with the requested and effective levels
- AND keeps the selected model and effective level
- AND returns `continue`

### Requirement R6: Model synchronization maintains explicit policy
The managed `/sync-pi-models` prompt SHALL validate lifecycle-policy compatibility after catalog reconciliation and SHALL require explicit approval before changing lifecycle role assignments.

#### Scenario R6.1: Newly introduced compatible model
- GIVEN `/refresh-models` adds a model while all current policy identities and thinking levels remain valid
- WHEN `/sync-pi-models` reconciles and reviews the catalog
- THEN it reports the added and removed provider/model IDs
- AND leaves `_policy.ts` unchanged unless the user explicitly approves a role change

#### Scenario R6.2: Referenced model or capability disappears
- GIVEN the refreshed catalog removes a referenced model or required thinking level
- WHEN the focused policy/catalog test runs
- THEN the test fails with the incompatible provider/model choice
- AND `/sync-pi-models` stops for an explicit replacement decision rather than applying an inferred replacement

#### Scenario R6.3: Approved policy replacement
- GIVEN the user approves a replacement policy identity or thinking level
- WHEN `/sync-pi-models` updates `_policy.ts`
- THEN it requires the focused policy test and relevant Pi-agent suites to pass
- AND previews both the model-catalog target and lifecycle-recommender target before applying either changed target

## Implementation Tasks
### Task 1: Define and validate the lifecycle policy
**Traceability:** R1 and the executable compatibility gate used by R6.

**Files:**
- Create `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts`.
- Create `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.test.ts`.
- Modify `dot_pi/agent/package.json`.

- [ ] From `dot_pi/agent`, run `npm ci --ignore-scripts` so the source worktree has the locked Pi 0.80.6 test dependencies. Leave `node_modules` present and ignored for the later independent verification run.
- [ ] Register `"$ext"/lifecycle-model-recommender/*.test.ts` in the existing `test:unit` command without changing unrelated scripts.
- [ ] Add table-driven policy tests for R1.1 and R1.2, including every approved matrix cell, choice metadata, arguments, whitespace boundaries, escaped text, prose, and similar command names.
- [ ] Add catalog tests for R1.3 that render the actual work branch of `models.json.tmpl` through `chezmoi execute-template --init` with dummy `email` and `signingKey` values when in the source tree, and parse `models.json` directly in the rendered layout.
- [ ] In the catalog test, use `getSupportedThinkingLevels()` for each choice and add synthetic removed-model and unsupported-level cases to prove the compatibility assertion fails for both forms of drift.
- [ ] Run `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts`; verify the red result is `ERR_MODULE_NOT_FOUND` for `_policy.ts`, not a dependency or harness failure.
- [ ] Implement the smallest typed policy module that makes the tests pass: exact phase parsing, immutable model identities, the approved three choices per phase, labels, cost classes, and rationales. Do not add runtime catalog reads or fallback rankings.
- [ ] Rerun the focused policy test; expect all policy, parsing, and catalog cases to pass.
- [ ] Refactor only after green to remove duplication in policy construction while keeping the matrix readable as the single maintenance surface, then rerun the focused test.
- [ ] Run `npm run test:unit`; expect the existing unit suite plus recommender policy tests to pass.
- [ ] Run LSP diagnostics for `_policy.ts` and `_policy.test.ts`; expect no errors.
- [ ] Commit only the Task 1 files with `feat(pi): define lifecycle model policy`.

### Task 2: Add advisory input routing and fail-open behavior
**Traceability:** R2, R3, R4, and R5.

**Files:**
- Create `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts`.
- Create `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_adapter.test.ts`.

- [ ] Build a minimal mock for the Pi system boundary that captures the registered `input` handler and records UI calls, registry lookup, model selection, and thinking access. Do not mock helpers inside the recommender.
- [ ] Add focused tests for R2: already-matching notification; stable dialog order and metadata; current-setting markers; untimed TUI selection; and RPC selection with `{ timeout: 30000 }`.
- [ ] Add focused tests for R3: recommendation, lower-cost, and increase-quality selections; model-before-thinking call order; unchanged arguments; Keep current; cancellation; and RPC timeout represented by an undefined selection.
- [ ] Add focused tests for R4: print and JSON without UI, both queued delivery modes with and without UI, non-lifecycle input, lookalikes, and extension-injected lifecycle text.
- [ ] Add focused tests for R5: missing registry model, failed `setModel()`, and effective thinking-level mismatch. Assert every expected path returns `{ action: "continue" }` and never returns `handled` or `transform`.
- [ ] Run `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_adapter.test.ts`; verify the red result is `ERR_MODULE_NOT_FOUND` for `index.ts`.
- [ ] Implement the minimal directory entrypoint: register one `input` handler, delegate parsing to `_policy.ts`, compare provider/model/thinking, use standard `ui.select()`, resolve the selected model, await `setModel()`, set and verify thinking, notify or warn, and return `continue` on every expected path.
- [ ] Preserve Pi's normal exception isolation instead of adding broad catches that could hide programming defects. Keep all user-visible failure messages free of credentials, headers, and command arguments.
- [ ] Rerun the focused adapter test; expect all R2-R5 cases to pass.
- [ ] Refactor only after green to keep option formatting and selection mapping deterministic and readable, then rerun both recommender test files.
- [ ] Run `npm run test:unit`; expect all unit tests to pass.
- [ ] Run LSP diagnostics for `index.ts` and `_adapter.test.ts`; expect no errors.
- [ ] Commit only the Task 2 files with `feat(pi): recommend models for lifecycle commands`.

### Task 3: Integrate lifecycle-policy review into model synchronization
**Traceability:** R6.

**Files:**
- Modify `dot_pi/agent/exact_prompts/sync-pi-models.md`.

Automation is impractical for the prompt's decision semantics: executing `/sync-pi-models` would invoke a model against and potentially mutate the live catalog, while string assertions would overfit prose without proving the agent follows it. Use the automated policy/catalog test as the executable compatibility gate and the rendered-prompt inspection below for the workflow contract.

- [ ] Preserve the existing provider-classification, credential-preservation, source-template editing, render comparison, and model-target apply instructions.
- [ ] Add an ordered post-reconciliation policy review that identifies provider/model ID additions and removals from the initial catalog diff and locates the managed recommender policy source.
- [ ] Require the focused policy/catalog test after updating `models.json.tmpl`. State that newly added models are candidates only and MUST NOT change lifecycle roles without explicit user approval.
- [ ] Require the workflow to stop and ask for a replacement decision when the test reports a missing identity or unsupported thinking level. Do not let the prompt infer replacement quality from names, recency, provider, context size, or reasoning metadata.
- [ ] When the user approves a policy change, require editing `_policy.ts`, running the focused policy and adapter tests plus the Pi-agent suites, and previewing both affected targets before scoped apply.
- [ ] From the repository root, render the managed prompt with `chezmoi --source "$PWD" cat ~/.pi/agent/prompts/sync-pi-models.md`. Starting from the documented precondition that `models.json.tmpl` has just been reconciled, inspect the output in order and verify it: preserves profile classification; reports ID deltas; runs the catalog gate; leaves compatible policy unchanged; stops for incompatible policy; requires explicit replacement approval; and previews/applies both targets only when both changed. No setup files or cleanup are required because `chezmoi cat` is read-only.
- [ ] From `dot_pi/agent`, run `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts`; expect the managed catalog and policy to remain compatible.
- [ ] From the repository root, run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/sync-pi-models.md`; expect only the approved maintenance-workflow additions.
- [ ] Commit only the sync prompt with `docs(pi): validate lifecycle policy during model sync`.

### Task 4: Complete documentation, future-agent guidance, and verification readiness
**Traceability:** All requirements and the repository's required final documentation task.

**Files to inspect:**
- `AGENTS.md`.
- `dot_pi/agent/AGENTS.md`.
- `plans/pi-lifecycle-model-recommender/design.md`.
- `plans/pi-lifecycle-model-recommender/plan.md`.
- Relevant user/developer docs, READMEs, runbooks, examples, and generated reference docs discovered during implementation.

- [ ] Inspect user-facing docs. Record in the plan execution notes why the self-explanatory dialog and `/sync-pi-models` prompt are sufficient, or update the narrowest existing document if users need additional invocation or failure guidance.
- [ ] Inspect developer docs and READMEs. Record why the design, policy table, tests, and sync prompt provide sufficient maintenance guidance, or update an existing document if implementation introduces a durable maintenance procedure not captured there.
- [ ] Inspect runbooks and operational docs. Record that no service, alert, dashboard, or on-call procedure exists or is required for this local advisory extension.
- [ ] Inspect examples and generated references. Record why no example or generated artifact changes are needed; do not create a duplicate example when the tested extension itself is the canonical implementation.
- [ ] Inspect every relevant `AGENTS.md`. Add guidance only if implementation reveals a durable repository trap, required command, source-of-truth rule, or rollout procedure not already covered. Do not duplicate lifecycle behavior from prompt or policy files.
- [ ] If the documentation inspection changes tracked files, run the relevant render or test check and commit those files only with `docs(pi): document lifecycle recommender workflow`. If no files change, record that outcome in the plan execution notes and do not create an empty commit.
- [ ] From `dot_pi/agent`, run both focused tests together: `node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts exact_extensions/lifecycle-model-recommender/_adapter.test.ts`; expect all cases to pass.
- [ ] From `dot_pi/agent`, run `npm test`; expect unit, skill, and dependency validation to pass.
- [ ] From `dot_pi/agent`, run `npm run test:all`; expect the repeated deterministic suites and existing Pi smoke test to pass.
- [ ] From `dot_pi/agent`, run `PI_OFFLINE=1 pi --no-session --no-context-files --no-extensions --extension "$PWD/exact_extensions/lifecycle-model-recommender/index.ts" --list-models __pi_lifecycle_recommender_smoke_no_match__`; expect exit 0 and no `[Extension issues]` output. This loads the source candidate without applying it or starting a model turn.
- [ ] Run LSP diagnostics for all four recommender TypeScript files; expect no errors.
- [ ] From the repository root, run `chezmoi --source "$PWD" execute-template --init --promptString email=matteo.ruina@datadoghq.com --promptString signingKey=test --promptString profile=work < dot_pi/agent/models.json.tmpl | diff -u - ~/.pi/agent/models.json`; expect exit 0 and no diff.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/lifecycle-model-recommender`; expect only the new recommender directory.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/sync-pi-models.md`; expect only the approved maintenance instructions.
- [ ] Run `git diff --check origin/main...HEAD` and `git diff --check`; expect no whitespace errors or conflict markers in committed or ledger changes.
- [ ] Inspect `git status --short` and the complete `origin/main...HEAD` diff. Confirm there are no implementation files outside the plan's affected-file set, no model-catalog or lifecycle-prompt changes, no dependency changes, and no unrelated modifications.
- [ ] Leave `dot_pi/agent/node_modules` present and ignored for `/verify`. Do not apply either managed target. Follow `/execute`'s stack evaluation and draft-PR workflow, then hand the unchanged source candidate to independent `/verify`.

## Requirement Traceability
| Requirement | Primary implementation | Automated evidence | Additional evidence |
|---|---|---|---|
| R1 | Task 1 | `_policy.test.ts` | Managed work-profile render comparison |
| R2 | Task 2 | `_adapter.test.ts` | Candidate Pi extension smoke |
| R3 | Task 2 | `_adapter.test.ts` call-order and no-mutation cases | Pi input ordering documentation referenced by the design |
| R4 | Task 2 | `_adapter.test.ts` mode, queue, and source cases | Full Pi-agent regression suite |
| R5 | Task 2 | `_adapter.test.ts` failure cases | Candidate Pi extension smoke |
| R6 | Tasks 1 and 3 | Policy/catalog compatibility tests, including negative drift cases | Read-only rendered-prompt procedure and targeted chezmoi diff |

## Documentation and Operational Impact
- The updated `/sync-pi-models` prompt is the user-facing maintenance workflow.
- The checked-in design, readable policy matrix, and focused tests are the developer maintenance references.
- No new runbook, dashboard, metric, trace, generated reference, or external documentation is expected.
- No `AGENTS.md` change is expected because it already defines directory entrypoint placement, source ownership, dependency setup, validation, and apply rules. Task 4 must still inspect and record the final decision.
- The extension creates no persistent state, network traffic, credentials, or background work. The owning user can safely disable it by reverting and applying the exact extensions directory.
