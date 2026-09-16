# Pi Lifecycle Model Recommender: Dynamic Pool Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static lifecycle policy table with a recommendation pool derived from the live scoped-models set, with phase-tier filters, computed default thinking levels, and a picker shown on every lifecycle command.
**Out of Scope:** Cost classes, per-position rationales, and lower-cost or increase-quality shortcuts; auto-apply or auto-skip of the picker; cross-phase state; lifecycle prompt changes; complexity inference; changes to `dot_pi/agent/models.json.tmpl` or `~/.pi/agent/settings.json`; waiting for an upstream scoped-models extension API.
**Architecture:** A pure policy module (`_policy.ts`) owns lifecycle command parsing, `enabledModels` parsing, phase-tier filtering, and default-thinking computation. A thin Pi `input` adapter (`index.ts`) reads the settings file on every invocation, resolves entries through the runtime model registry, shows the picker, applies confirmed settings model-first, and fails open on every error.
**Tech Stack:** TypeScript, Pi extension APIs (`@earendil-works/pi-coding-agent` 0.80.6), `@earendil-works/pi-ai` `getSupportedThinkingLevels`, Node.js `node:test`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | `/plan` startup | Determined which language and domain skills to load; no TypeScript-specific skill exists |
| `resolve-worktree` | prompt-required | Supplied design path | Resolved the worktree (`~/.worktrees/dotfiles-lifecycle-model-recommender-pool`, branch `maruina/lifecycle-model-recommender-pool`, based on current `main`, clean) |
| `chezmoi` | skill-loader | Chezmoi source files are modified | Scoped `chezmoi --source <worktree> diff/apply` to the extension target; applied the `npm ci --ignore-scripts`, test, and node_modules cleanup contract; confirmed the runtime import resolves in the rendered target |
| `write` | skill-loader | The plan and the design amendment are prose artifacts | Applied clarity rules: short literal sentences, RFC 2119 keywords, risks as specific failures |

Advisory learning lookup: ran `learn-evidence.mjs learning-sections` over `Datadog/Learnings.md` with terms for pi extensions, scoped models, thinking levels, settings.json, model registry, and enabledModels. The store holds one section; zero matched. No learning guidance was available to apply.

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Plan path input | Resolved `$RESOLVED_ROOT` to `~/.worktrees/dotfiles-lifecycle-model-recommender-pool`, branch `maruina/lifecycle-model-recommender-pool`; clean tree; design and plan committed in separate commits |
| `skill-loader` | prompt-required | `/execute` startup | Matched affected files: TypeScript (no TS skill exists), design.md prose (`write`), chezmoi source (`chezmoi`); no Go/shell/Terraform/Mermaid/k8s triggers |
| `chezmoi` | prompt-required (skill-loader) | Extension source lives under the chezmoi source tree | Scoped verification to the worktree source; will use `chezmoi --source "$PWD" diff` for the target check and follow the npm ci / node_modules cleanup contract |
| `write` | prompt-required (skill-loader) | Task 1 amends design.md prose | Applied clarity rules to the amendment: short literal sentences, no meaning drift, risks stated as specific failures |

Current task: complete. All tasks executed; one manual step remains (removing `dot_pi/agent/node_modules`, blocked by the compute-guardrails extension).

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Design spec | `plans/pi-lifecycle-model-recommender-pool/design.md` | Record the confirmed supported-levels thinking rule, the resolved open questions, and the selection-time registry reuse | Review of the amendment diff |
| Pure policy module | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts` | `parseLifecyclePhase` (unchanged), `enabledModels` parsing, phase-tier filtering, default-thinking computation | Focused policy test command below |
| Policy tests | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.test.ts` | Verify tier filters, ordering, thinking defaults for every catalog map shape, and malformed-entry handling | Focused policy test exits 0 |
| Pi adapter | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts` | Per-invocation settings read, registry resolution, picker construction, model-first application, fail-open behavior | Focused adapter test exits 0 |
| Adapter tests | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_adapter.test.ts` | Exercise the registered input handler against mocked Pi runtime boundaries and a fixture settings file | Focused adapter test exits 0 |

**Key Decisions**
- The default thinking level is the second-highest level of `getSupportedThinkingLevels(model)` from `@earendil-works/pi-ai`. A model without a `thinkingLevelMap` has no default; a single supported level is the default; zero supported levels means no default. Planning evidence showed the design's "keys present in the map" reading produces levels Pi clamps (`xhigh` for GLM models, `off` for Gemini), firing the clamp warning on every selection. The supported-levels rule preserves the "one below the max" intent, can never request a clamped level, and reuses Pi's own capability function. Confirmed in the planning alignment brief.
- The settings path is `process.env.PI_LIFECYCLE_SETTINGS_PATH ?? join(getAgentDir(), "settings.json")`, consulted on every invocation so tests point at a fixture and `/scoped-models` edits apply at the next command. Refines the design's proposed `PI_LIFECYCLE_SETTINGS`; confirmed in the brief.
- Candidate labels use the catalog `name` plus `| <thinking level>` when a default exists. When two pool candidates share a name, both get a ` [provider]` suffix; when they also share the provider, the suffix is the full ` [provider/model]` scoped entry, because `ctx.ui.select()` returns strings only and the selection maps back by label index. The candidate matching the active model carries a ` (current model)` marker.
- Unresolvable entries produce one warning line naming the skipped entries.
- A selection reuses the `Model` resolved during pool derivation; a second registry lookup at selection time is redundant. The first-version "selected model missing from the registry" warning path is subsumed by the pool-build skip warning.
- The four extension files are mutually coupled (the adapter and both test files import the policy module), so the rewrite lands as one green commit with test-first execution inside the task. The dotfiles repository has no CI gate; each commit still passes the focused tests.
- Deleted with this change: `LIFECYCLE_POLICY`, the three recommendation positions, cost classes, rationales, the per-model helper functions, and the match-and-notify early exit. `parseLifecyclePhase` and its command set are unchanged.

**Implementation Constraints**
- `_policy.ts` stays pure: no I/O, no `process.env`, no Pi runtime imports beyond types and `getSupportedThinkingLevels`. All file access and Pi interaction live in `index.ts`.
- `index.ts` performs no module-level I/O; the settings read happens inside the event handler so extension loading stays side-effect free for `npm run test:smoke`.
- Each `enabledModels` entry splits at the first `/` into provider and model ID; entries that are not strings or have no usable split are skipped.
- The `flash` and `gemini` tier matchers are case-insensitive substring tests on the model ID and carry a `deliberate:` comment: catalog ID renames change tier membership and can empty the `/execute` or `/verify` pool; the upgrade path is per-model tier metadata in the catalog when Pi supports it.
- The handler only ever returns `{ action: "continue" }`; it never transforms or blocks lifecycle input.
- Option strings are unique per dialog; the returned string maps back to the candidate by option index, never by re-parsing.
- `pi.setModel()` is awaited before `pi.setThinkingLevel()`; thinking is set only when the candidate has a default; the effective level is compared afterward and a clamp warns.
- Repository guidance for `dot_pi/agent`: `npm ci --ignore-scripts` before verification (done during planning), keep `node_modules` until `npm test` and `npm run test:all` pass, then remove it.

**Security Requirements**
- The extension MUST read only the `enabledModels` array from `settings.json`, which holds preferences, not credentials.
- Warnings MUST name only skipped entry strings, the phase, and effective thinking levels; they MUST NOT include settings file contents, credentials, headers, or prompt arguments.
- The extension MUST resolve and select models only through `ctx.modelRegistry.find()` and `pi.setModel()`; it MUST NOT call provider APIs or execute authentication commands.
- Raw input arguments MUST be used only to identify the leading lifecycle command and MUST NOT be persisted or logged.

**Observability Requirements**
- One-line warnings for unreadable settings, skipped entries, empty pools, queued input, failed model selection, and clamped thinking levels; the picker itself and Pi's status line are the primary signals.
- No metrics, traces, alerts, dashboards, or runbooks: this is a local advisory extension with no background process.

**Failure Modes to Handle**
| Failure | Expected behavior | Verification |
|---|---|---|
| `settings.json` unreadable or malformed, or `enabledModels` not an array | Warn once, continue with current settings, no picker, no mutation | Adapter test |
| Entry without `/` or non-string entry | Skip the entry at parse time and continue with the rest | Policy test |
| Entry does not resolve through the registry | Skip it, one warning naming all skipped entries, continue with the remaining pool | Adapter test |
| Pool empty after filtering | Warn that the phase has no candidate models, continue, no picker | Adapter test |
| No dialog-capable UI (`print`/`json` mode) | Continue unchanged without mutation | Adapter test |
| Queued input (`steer`/`followUp`) | Warn when UI exists, never mutate the active run, continue | Adapter test |
| RPC client does not answer | The 30-second RPC-only timeout resolves as cancellation; continue unchanged | Adapter test |
| `pi.setModel()` returns false | Warn, do not set thinking, continue | Adapter test |
| Effective thinking differs from requested | Warn with the effective level, keep the selected model, continue | Adapter test |
| User cancels or selects a keep option | No mutation, continue | Adapter test |
| Catalog rotation renames flash models | Pool can go empty; the empty-pool warning fires and the command continues | `deliberate:` comment plus empty-pool adapter test |

**Rollout and Rollback**
- Do not apply candidate targets during `/execute`; independent `/verify` inspects the source worktree first (first-version precedent).
- Smallest safe rollout after verification: `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/lifecycle-model-recommender` from the worktree root, confirm the diff matches the rewrite only, then `chezmoi --source "$PWD" apply ~/.pi/agent/extensions/lifecycle-model-recommender`. `/reload` or a new Pi session loads the extension.
- Manual rollout verification (the picker is an interactive TUI dialog, so automation is impractical): in a live Pi session, run `/plan` with the current model in the pool and expect "Keep current model" first; run `/execute` while on a non-flash model and expect "Keep current settings" last; cancel a picker and expect unchanged settings; disable one model with `/scoped-models`, rerun a lifecycle command, confirm the model left the pool, then re-enable it. Cleanup: restore the desired model and thinking level.
- Fastest rollback: revert the rewrite commit, then `chezmoi --source "$PWD" diff` and `apply` the same extension target. The extension has no persistent state; `/scoped-models` and the model catalog are not part of rollback. Owner: Matteo.

**Test Strategy**
- Policy module: pure-function tests through the module seam. Cover each phase tier, `enabledModels` order preservation, the thinking-default computation for multi-level, single-level, and absent maps, and malformed entries. A catalog test renders `dot_pi/agent/models.json.tmpl` with `chezmoi execute-template` (falling back to `~/.pi/agent/models.json`) and asserts the computed default of every catalog model with a `thinkingLevelMap` is a member of its `getSupportedThinkingLevels()`.
- Adapter: the existing harness pattern, mocking only Pi's runtime boundary (`pi` registration, `setModel`, thinking getters/setters, `ctx.ui`, `ctx.modelRegistry`, `ctx.model`). The settings file is the one new system boundary; tests write fixture JSON to a `node:test` temporary directory and set `PI_LIFECYCLE_SETTINGS_PATH` per test (each test file runs in its own process). One test changes the fixture between two invocations to prove there is no caching.
- Narrow command expected to fail before implementation and pass after: `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts exact_extensions/lifecycle-model-recommender/_adapter.test.ts`.
- Full verification: `npm test` and `npm run test:all` from `dot_pi/agent`, plus language-server diagnostics on the four changed files.

## Acceptance Criteria
### Requirement: Phase pools derive from the scoped-models set
The system SHALL derive each phase's candidate pool from the `enabledModels` array in the Pi agent `settings.json`, resolved through the runtime model registry, preserving `enabledModels` order. `/brainstorm`, `/plan`, and `/systematic-review` SHALL exclude model IDs containing `flash`; `/execute` SHALL require `flash` and exclude `gemini`; `/verify` SHALL require `flash`. Matching SHALL be case-insensitive on the model ID.

#### Scenario: Framing phases exclude flash models
- GIVEN a scoped set containing GLM-5.3, Kimi K3, GPT-5.6 Sol, and GLM-5.3-Flash
- WHEN the `/plan` pool is derived
- THEN the pool contains exactly the non-flash models in `enabledModels` order

#### Scenario: Execution phase excludes gemini
- GIVEN a scoped set containing GLM-5.3-Flash, DeepSeek V4 Flash, and Gemini 3.8 Flash
- WHEN the `/execute` pool is derived
- THEN the pool contains GLM-5.3-Flash and DeepSeek V4 Flash and excludes Gemini 3.8 Flash

#### Scenario: Verification phase includes gemini
- GIVEN the same scoped set
- WHEN the `/verify` pool is derived
- THEN the pool contains all three flash models in `enabledModels` order

#### Scenario: Malformed entries are skipped
- GIVEN an `enabledModels` array containing a non-string value and a string without `/`
- WHEN the array is parsed
- THEN both entries are skipped and the remaining entries parse into provider and model ID pairs

### Requirement: Computed default thinking levels
The system SHALL compute each candidate's default thinking level as the second-highest level of `getSupportedThinkingLevels(model)`. A model without a `thinkingLevelMap` SHALL have no default. A model with one supported level SHALL default to that level.

#### Scenario: Multi-level map yields the second-highest supported level
- GIVEN a model whose map supports `low`, `high`, and `max` (the GLM-5.3 shape)
- WHEN the default is computed
- THEN the result is `high` and never a level the model does not support

#### Scenario: Single-level and absent maps
- GIVEN a model whose map supports exactly one level, and a model with no `thinkingLevelMap`
- WHEN defaults are computed
- THEN the first yields its only level and the second yields no default

#### Scenario: Every managed-catalog map shape computes a supported default
- GIVEN the rendered managed model catalog
- WHEN the default is computed for every model with a `thinkingLevelMap`
- THEN each default is a member of that model's `getSupportedThinkingLevels()`

### Requirement: The picker shows on every lifecycle invocation
The system SHALL show the picker, titled `<phase>: model selection`, on every matching idle interactive invocation, with no auto-skip and no notify-only path.

#### Scenario: Current settings already fit the pool
- GIVEN the active model and thinking level exactly match a pool candidate's model and computed default
- WHEN a lifecycle command is invoked interactively
- THEN the picker still appears

### Requirement: Keep-current contract
When the active model is in the pool, the first option SHALL be "Keep current model" and selecting it SHALL change nothing. When the active model is not in the pool, "Keep current model" SHALL NOT appear and "Keep current settings" SHALL be the last option. Cancellation SHALL equal keep current.

#### Scenario: Active model in the pool
- GIVEN the active model resolves to a pool candidate
- WHEN the picker is shown and "Keep current model" is selected
- THEN it is the first option and neither `setModel` nor `setThinkingLevel` is called

#### Scenario: Active model outside the pool
- GIVEN an active model that is not in the phase pool, or no active model
- WHEN the picker is shown
- THEN "Keep current settings" is the last option and selecting it or canceling mutates nothing

### Requirement: Candidate labels and ordering
Pool candidates SHALL follow the keep options in `enabledModels` order. Labels SHALL be `Model name | thinking level`, or `Model name` when the model has no thinking default. The candidate matching the active model SHALL carry a ` (current model)` marker. All option strings in one dialog SHALL be unique.

#### Scenario: Current-model candidate is marked
- GIVEN the active model is in the pool
- WHEN the picker is shown
- THEN its candidate label ends with ` (current model)`, distinct from "Keep current model"

#### Scenario: Duplicate names are disambiguated
- GIVEN two pool candidates from different providers with the same catalog name
- WHEN the picker is shown
- THEN both labels carry a ` [provider]` suffix and every option string is unique

#### Scenario: Same-provider duplicate names are disambiguated
- GIVEN two pool candidates from the same provider with the same catalog name
- WHEN the picker is shown
- THEN both labels carry a ` [provider/model]` suffix and every option string is unique

### Requirement: Selection application order
A candidate selection SHALL apply the resolved model through `pi.setModel()` first, then call `pi.setThinkingLevel()` only when the candidate has a default thinking level. A candidate without a default SHALL change only the model. A difference between requested and effective thinking level SHALL produce a warning.

#### Scenario: Candidate with a thinking default
- GIVEN a candidate whose computed default is `high`
- WHEN it is selected
- THEN `setModel` completes before `setThinkingLevel("high")` runs, and the lifecycle command continues

#### Scenario: Mapless candidate
- GIVEN a candidate with no `thinkingLevelMap`
- WHEN it is selected
- THEN only `setModel` runs and thinking stays at its clamped carry-over value

#### Scenario: Model selection fails or thinking clamps
- GIVEN `pi.setModel()` returns false, or the effective level differs from the request
- WHEN a candidate is selected
- THEN a warning names the outcome, thinking is not set after a failed model selection, and the command continues

### Requirement: Fail-open degradation
The extension SHALL fail open on every settings or pool error: it warns and continues the lifecycle command with current settings.

#### Scenario: Unreadable or malformed settings
- GIVEN `settings.json` is missing, unparseable, or its `enabledModels` is not an array
- WHEN a lifecycle command is invoked interactively
- THEN one warning is shown, no picker appears, and nothing is mutated

#### Scenario: Unresolvable entries
- GIVEN two enabled entries that the registry cannot resolve
- WHEN the pool is derived
- THEN one warning names both entries and the picker offers the remaining pool

#### Scenario: Empty pool
- GIVEN no enabled entry survives resolution and the phase filter
- WHEN a lifecycle command is invoked
- THEN a warning states the phase has no candidate models and the command continues unchanged

### Requirement: Input guardrails are preserved
Extension-sourced input, non-interactive modes, and queued delivery SHALL pass through without mutation or picker. Queued lifecycle input SHALL produce a warning when a UI exists. RPC-mode pickers SHALL use a 30-second timeout, and timeout SHALL equal cancellation.

#### Scenario: Pass-through modes
- GIVEN input sourced from an extension, `print` or `json` mode without UI, queued `steer` or `followUp` delivery, or a lookalike command such as `/planning`
- WHEN the handler runs
- THEN it returns `continue` with no picker and no mutation

#### Scenario: RPC timeout
- GIVEN an RPC-mode invocation
- WHEN the picker is shown and the client does not answer
- THEN the select call carries `{ timeout: 30000 }` and the timeout resolves as cancellation with no mutation

### Requirement: Settings are re-read per invocation
The adapter SHALL read and parse the settings file on every matching invocation, with no caching, so `/scoped-models` edits take effect at the next lifecycle command.

#### Scenario: Scoped set changes between invocations
- GIVEN a lifecycle command ran with a fixture scoped set
- WHEN a model is removed from the fixture and a second lifecycle command runs
- THEN the second pool excludes the removed model

## Implementation Tasks
### Task 1: Amend the design with the confirmed thinking-level rule
**Delivers:** `design.md` records the supported-levels rule, the corrected worked examples, the resolved open questions, and the selection-time registry reuse, so `/execute` implements against an accurate spec.
**Blocked by:** None
**Traces to:** Goal; planning alignment brief confirmations
**Files:** `plans/pi-lifecycle-model-recommender-pool/design.md`

- [x] Rewrite the "Default thinking level" section: the default is the second-highest level of `getSupportedThinkingLevels(model)`; no `thinkingLevelMap` means no default; one supported level means that level. Update the worked values to GLM-5.3 and GLM-5.3-Flash `high`, Kimi K3 `high`, GPT-5.6 Sol and Terra `xhigh`, DeepSeek V4 Flash `high`, Gemini 3.8 Flash `medium`.
- [x] Update the assumption-ledger row for the second-highest rule, the interaction-design examples, and the pool table note (the scoped set now includes GPT-5.6 Terra in the framing phases).
- [x] Replace the Gemini "thinking `off` only / weak-reasoning verifier" downside with the `medium` outcome; the different-model-family rationale is unchanged.
- [x] Adjust picker-flow step 4 and the failure section: selection reuses the model resolved during pool derivation; the "selected model missing from the registry" path is subsumed by the pool-build skip warning.
- [x] Resolve the three open questions in place: `PI_LIFECYCLE_SETTINGS_PATH`; the ` [provider]` suffix only on duplicate names; one warning line naming skipped entries.
- [x] Amend the default-thinking decision record with the clamp-avoidance rationale.
- [x] Commit with `docs: amend lifecycle-model-recommender-pool design thinking-level rule`.

### Task 2: Rewrite the extension and its tests
**Delivers:** the dynamic pool picker end to end — pool derivation, computed thinking defaults, the keep-current contract, and fail-open behavior — verified by focused tests.
**Blocked by:** 1
**Traces to:** All nine requirements
**Files:** `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts`, `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts`, `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.test.ts`, `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_adapter.test.ts`

- [x] Confirm `npm ci --ignore-scripts` has run in `dot_pi/agent` (completed during planning).
- [x] Rewrite `_policy.test.ts` and `_adapter.test.ts` against the new behavior, including the catalog map-shape test and the per-invocation fixture-change test. Run the focused command; expect failures because the new policy exports do not exist and the adapter still runs the first-version flow.
- [x] Rewrite `_policy.ts`: keep `parseLifecyclePhase`; remove the policy table, positions, cost classes, rationales, and per-model helpers; add the pure functions pinned below with `deliberate:` comments on the tier matchers.
- [x] Rewrite `index.ts`: per-invocation settings read through `process.env.PI_LIFECYCLE_SETTINGS_PATH ?? join(getAgentDir(), "settings.json")`, registry resolution with one skipped-entries warning, pool derivation, option construction per the label rules, the picker with RPC-only `{ timeout: 30000 }`, model-then-thinking application with the clamp warning, and fail-open `continue` on every path.
- [x] Run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/lifecycle-model-recommender/_policy.test.ts exact_extensions/lifecycle-model-recommender/_adapter.test.ts`; expect every test to pass.
- [x] Refactor only after green, then rerun the focused command. (No refactor needed; the green implementation was already minimal.)
- [x] Commit with `feat(lifecycle-model-recommender): derive recommendation pool from scoped models`.

Deviation (2026-09-16, user-approved): the plan's worked values and the first adapter test expected a DeepSeek V4 Flash default of `high`, but the pinned second-highest rule yields `low` — DeepSeek's map leaves `off` mapped to an alias (`"none"`), so its supported list is `[off, low, high]`. Test expectations corrected to `low`; `design.md` corrected in commit `c71e0af`. Red run before implementation: 15 fail / 4 pass, as planned.

Amendment (2026-09-16, review feedback): the option-construction contract now appends the full ` [provider/model]` scoped entry when two pool candidates share the name and the provider. The provider suffix alone leaves both labels identical, and the label-index mapping then applies the first model regardless of the selected row, violating the "every option string is unique" requirement. `design.md` resolved questions and the Key Decisions bullet amended in the same commit.

Policy interface to implement (pinned, not prescriptive beyond these signatures):
```ts
export function parseEnabledModels(raw: unknown): {
  entries: Array<{ provider: string; modelId: string; entry: string }>;
  skipped: string[];
};
export function poolForPhase(phase: LifecyclePhase, models: readonly Model<Api>[]): Model<Api>[];
export function defaultThinkingLevel(model: Model<Api>): ModelThinkingLevel | undefined;
```
Option construction contract: "Keep current model" first if and only if the active model is in the pool; candidates in `enabledModels` order labeled `name | level` or `name`, with ` [provider]` appended to both colliding names on a duplicate — the full ` [provider/model]` scoped entry when the provider also collides — and ` (current model)` on the matching candidate; "Keep current settings" last if and only if the active model is not in the pool.

### Task 3: Validate the repository and record documentation impact
**Delivers:** full suites green, language-server diagnostics clean, the chezmoi target diff inspected, future-agent guidance impact recorded, and disposable dependencies removed.
**Blocked by:** 2
**Traces to:** Goal validation; repository guidance
**Files:** none expected beyond Task 2 outputs (commands run in `dot_pi/agent` and the worktree root)

- [x] Run `cd dot_pi/agent && npm test`; expect all suites, including the recommender tests through `test:unit`, to pass.
- [x] Run `npm run test:all`; expect the smoke test to pass with no `[Extension issues]` output.
- [x] Run language-server diagnostics on the four changed files; expect no errors.
- [x] From the worktree root, run `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/lifecycle-model-recommender`; expect the diff to contain only the rewrite. (Equivalent command: this chezmoi version prints nothing for a targeted `diff` with an absolute path and rejects the home-relative form with "not managed"; `chezmoi --source "$PWD" status ~/.pi/agent/extensions/lifecycle-model-recommender` shows exactly the four files as ` M`, and the full `chezmoi --source "$PWD" diff` contains exactly the four extension-file diffs — the rewrite only.)
- [x] Record the `AGENTS.md` decision when reporting execution results: no change, because the extension follows the existing Pi Agent Development guidance and its behavior is documented in `design.md`; no durable command, trap, or source-of-truth rule is added. User-facing documentation impact: none beyond the Task 1 design amendment (plus the user-approved DeepSeek correction, commit `c71e0af`); the extension has no README and the lifecycle prompts are unchanged by design.
- [ ] Remove `dot_pi/agent/node_modules` after the suites complete, per repository guidance. (Blocked for the agent by the local `compute-guardrails` extension, which blocks recursive `rm`; requires a manual terminal command: `rm -rf dot_pi/agent/node_modules`. Harmless until then — the directory is excluded from Git and chezmoi rendering.)
- [x] Commit only if validation forces a fix, with a conventional message. (No fix needed.)

## Requirement Traceability
| Requirement | Tasks | Primary validation |
|---|---|---|
| Phase pools derive from the scoped-models set | 2 | Policy tests |
| Computed default thinking levels | 2 | Policy tests plus catalog map-shape test |
| Picker shows on every invocation | 2 | Adapter test |
| Keep-current contract | 2 | Adapter tests |
| Candidate labels and ordering | 2 | Adapter tests |
| Selection application order | 2 | Adapter tests |
| Fail-open degradation | 2 | Adapter tests |
| Input guardrails preserved | 2 | Adapter tests |
| Settings re-read per invocation | 2 | Adapter fixture-change test |
| Accurate approved design | 1 | Amendment diff review |
| Repository health and apply readiness | 3 | `npm test`, `npm run test:all`, diagnostics, chezmoi diff |

## Learning candidates
- 2026-09-16: The approved design read `thinkingLevelMap` key presence as support, but pi-ai treats a `null` value as unsupported and an absent key as default-supported for base levels; `getSupportedThinkingLevels()` is the only safe source for thinking defaults — deriving from raw keys produces levels Pi clamps on every selection. Evidence: `node_modules/@earendil-works/pi-ai/dist/models.js` `getSupportedThinkingLevels` (line 207 in 0.80.6) and `dist/core/agent-session.js` `setThinkingLevel`, recorded in this plan's Key Decisions.
- 2026-09-16: Planning miscomputed DeepSeek V4 Flash's default thinking level as `high`; a map entry like `off: "none"` makes `off` a supported level, so its supported list is `[off, low, high]` and the second-highest default is `low`. Worked-value examples must be recomputed from `getSupportedThinkingLevels`, not from a mental list of non-null keys. Evidence: `node_modules/@earendil-works/pi-ai/dist/models.js` `getSupportedThinkingLevels`; corrected worked values in commit `c71e0af`.

## Documentation and Operational Impact
- Task 1 amends `design.md`; no other user or developer documentation changes. The extension has no README, and lifecycle prompts are unchanged by design.
- `AGENTS.md` is unchanged; Task 3 records the reasoning.
- Operability is unchanged from the first version: a local advisory extension whose signals are the picker, one-line warnings, and the status line. No metrics, alerts, or runbooks apply.
- The maintenance surface shrinks: the policy table is gone. Remaining maintenance is the tier matcher on catalog renames and the default-thinking rule on level-map changes; `/scoped-models` edits apply at the next invocation.
