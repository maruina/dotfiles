# Pi Lifecycle Model Recommender: Dynamic Pool
## Status
Approved on 2026-09-16. Supersedes the policy sections of `plans/pi-lifecycle-model-recommender/design.md` (2026-07-14), which remains the record of the first version.

## Problem
The lifecycle-model-recommender extension uses a static, hand-maintained policy table. Each lifecycle phase maps to three fixed positions: lower cost, recommended, and increase quality. The table has gone stale: it recommends `baseten/zai-org/GLM-5.2`, which is no longer in the scoped-models set that `/scoped-models` manages. Every catalog refresh can make the table stale again.

The recommendation pool must derive dynamically from the scoped-models set, with phase-tier filters, a computed default thinking level, and a picker that always appears so the user can deliberately use different models for adjacent phases such as `/brainstorm` and `/plan`.

## User and audience
Matteo, using Pi with models routed through the Datadog AI Gateway. Future maintainers of these dotfiles read this design to understand the pool rules without this conversation.

## Goals
- Derive the candidate pool from the scoped-models set: the `enabledModels` array in `~/.pi/agent/settings.json`, resolved through Pi's runtime model registry.
- Apply phase-tier filters:
  - `/brainstorm`, `/plan`, `/systematic-review`: scoped models whose ID does not contain `flash`.
  - `/execute`: scoped models whose ID contains `flash` and not `gemini`.
  - `/verify`: scoped models whose ID contains `flash`.
- Compute each candidate's default thinking level as the second-highest level of `getSupportedThinkingLevels(model)`; a model without a `thinkingLevelMap` has no default.
- Show the picker on every lifecycle start, with no auto-skip.
- When the current model is in the phase pool, make "Keep current model" the first option; selecting it changes nothing.
- Preserve the existing adapter contracts: fail-open behavior, model selection before thinking changes, no mutation in non-interactive or queued input, and the RPC selection timeout.

## Non-goals
- No cost classes, per-position rationales, or lower-cost and increase-quality shortcuts. The model catalog carries no cost data, so these cannot be derived, and a hand-maintained order would reintroduce the staleness this change removes.
- No auto-apply or auto-skip of the picker.
- No cross-phase state. The extension does not remember which model served the previous phase.
- No changes to the lifecycle prompt files.
- No complexity inference from prompts, plans, or repository state.

## Context reviewed
- `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts`, `_policy.ts`, `_policy.test.ts`, and `_adapter.test.ts`: current adapter flow, policy table, and test harness.
- `plans/pi-lifecycle-model-recommender/design.md` and `plan.md`: the approved first-version design and its decision records.
- Pi SDK type declarations: `dist/core/model-registry.d.ts` (`getAll`, `getAvailable`, `find`, `hasConfiguredAuth`), `dist/core/extensions/types.d.ts` (extension context and UI), and `dist/core/sdk.d.ts` (session `scopedModels` parameter, which is input-only and not readable by extensions).
- `docs/usage.md`: `/scoped-models` enables and disables models for Ctrl+P cycling.
- `dist/core/settings-manager.d.ts`: `enabledModels?: string[]` is the persisted scoped-models state.
- `~/.pi/agent/settings.json`: the live `enabledModels` array.
- `~/.pi/agent/models.json`: provider names, model IDs, and `thinkingLevelMap` values for the current catalog.
- `@earendil-works/pi-ai` type declarations: `ModelThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`.
- `dot_pi/agent/exact_extensions/context-kit/index.ts`: the precedent for reading a file under the agent directory through `getAgentDir()` with an environment-variable override for tests.

### Advisory learning lookup
The brainstorm ran `Datadog/Learnings.md` through `learn-evidence.mjs learning-sections` with terms for pi extensions, scoped models, and thinking levels. The file contains one section; zero matched. No learning guidance was available to apply.

## Current behavior
The extension intercepts raw lifecycle commands. On a matching idle interactive invocation it compares the active provider, model ID, and thinking level with the static policy's recommended entry. On an exact match it notifies and continues. Otherwise it offers Apply recommendation, Lower cost, Increase quality, and Keep current settings, then applies the selected model and thinking level after confirmation. Non-interactive and queued input pass through without mutation.

The scoped set on 2026-09-16 contains seven models. The resulting pools are:

| Phase | Pool |
|---|---|
| `/brainstorm`, `/plan`, `/systematic-review` | GLM-5.3, Kimi K3, GPT-5.6 Sol, GPT-5.6 Terra |
| `/execute` | GLM-5.3-Flash, DeepSeek V4 Flash |
| `/verify` | GLM-5.3-Flash, DeepSeek V4 Flash, Gemini 3.8 Flash |

The tier logic: framing, planning, and review phases use the non-flash reasoning models; execution and verification use the fast flash tier; Gemini Flash joins only verification, where a reviewer from a different model family adds independence.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| `enabledModels` in `~/.pi/agent/settings.json` is the state `/scoped-models` edits | `docs/usage.md` describes `/scoped-models`; `settings-manager.d.ts` declares `enabledModels`; the live array matches the models the user cycles | The pool draws from the wrong set | Unit-test the parser against the documented entry shape; exercise `/scoped-models` and re-run a lifecycle command |
| No extension API exposes the scoped set | Reviewed `extensions/types.d.ts` and `sdk.d.ts`; `scopedModels` appears only as session-creation input | A future Pi release could offer a supported accessor, making the file read redundant | Re-check at upgrade time; the read is isolated in one function |
| Model IDs containing `flash` or `gemini` identify the tiers | The current catalog: GLM-5.3-Flash, DeepSeek-V4-Flash-0731, gemini-3.8-flash match; GLM-5.3, gpt-5.6-sol, system.ai.kimi-k3 do not | A renamed model changes tier membership; `/execute` or `/verify` can end up with an empty pool | Fail open with a warning; `deliberate:` comment on the matcher |
| The second-highest level of `getSupportedThinkingLevels(model)` is the intended default | User decision "one below the max"; supported levels: GLM gives `high`, Sol and Terra give `xhigh`, Kimi gives `high`, DeepSeek gives `high`, Gemini Flash gives `medium`; raw `thinkingLevelMap` keys would give levels Pi clamps (`xhigh` for GLM, `off` for Gemini) | A model with an unusual map gets an unintended default | Unit-test the computation against every map shape in the catalog |
| Reading `settings.json` per invocation is acceptable | The file is small; `/scoped-models` changes are rare | None material; the read is one `readFileSync` per lifecycle command | Observe behavior after toggling a model in `/scoped-models` |

## Design overview
Replace the static policy table with pool derivation. Keep the policy module pure and testable; keep all Pi interaction in the adapter.

### Pool derivation
1. Read `~/.pi/agent/settings.json` from `join(getAgentDir(), "settings.json")` and parse `enabledModels`.
2. Split each entry at the first `/` into provider and model ID. Skip malformed entries.
3. Resolve each pair through `ctx.modelRegistry.find(provider, modelId)`. Skip pairs that do not resolve and show one compact warning naming the skipped entries.
4. Apply the phase filter to the resolved models.
5. Compute each candidate's default thinking level.
6. Keep the `enabledModels` order for candidates.

The tier matchers are substring tests on the model ID: `flash` matched case-insensitively, and `gemini` matched case-insensitively. Both carry a `deliberate:` comment: the matchers break when catalog IDs rotate; the upgrade path is per-model tier metadata in the catalog when Pi supports it.

### Default thinking level
The default is the second-highest level of `getSupportedThinkingLevels(model)` from `@earendil-works/pi-ai`, the same capability function Pi uses to clamp requested levels. A model without a `thinkingLevelMap`, such as the Claude routes, has no default thinking level; selecting it changes only the model. A model whose supported list holds one level defaults to that level; an empty supported list means no default.

Worked values: GLM-5.3 and GLM-5.3-Flash `high`, Kimi K3 `high`, GPT-5.6 Sol and Terra `xhigh`, DeepSeek V4 Flash `high`, Gemini 3.8 Flash `medium`.

Reading raw `thinkingLevelMap` keys instead produces levels Pi clamps on every selection: `xhigh` for the GLM models, whose maps mark `xhigh` as `null`, and `off` for Gemini 3.8 Flash, whose only mapped level is unsupported. The supported-levels rule preserves the "one below the max" intent and can never request a clamped level.

### Picker flow
For a matching idle interactive invocation:
1. Derive the phase pool.
2. Build the options:
   - If the current model is in the pool, the first option is "Keep current model". Selecting it changes nothing.
   - All pool candidates follow in `enabledModels` order, labeled `Model name | thinking level`, or `Model name` alone when the model has no thinking map. The candidate matching the current model carries an `(current model)` marker. This marker lets the user reset the current model's thinking to the computed default while "Keep current model" preserves the active level.
   - If the current model is not in the pool, "Keep current settings" is the last option.
3. Cancel equals keep current. The lifecycle command continues either way.
4. On a candidate selection, reuse the `Model` resolved during pool derivation, call `pi.setModel()`, then call `pi.setThinkingLevel()` only when the candidate has a default thinking level, and warn if the effective level differs from the request. A second registry lookup at selection time is redundant: an entry that cannot resolve never reaches the picker.

Unchanged from the first version: the extension-source skip, the phase parser and its five commands, the queued-input warning, the non-interactive pass-through, the RPC selection timeout, and returning `continue` so prompt expansion proceeds with the confirmed settings.

## Interaction design
The picker title names the phase, for example `/plan: model selection`. Option text carries the model name and thinking level only. No cost class or rationale text appears.

Example for `/verify` while running GLM-5.3:
1. GLM 5.3 Flash (Baseten) | high
2. DeepSeek V4 Flash 0731 (Baseten) | high
3. Gemini 3.8 Flash (Google) | medium
4. Keep current settings

Example for `/plan` while running GLM-5.3:
1. Keep current model
2. GLM 5.3 (Baseten) | high (current model)
3. Kimi K3 (Databricks) | high
4. GPT-5.6 Sol (OpenAI) | xhigh
5. GPT-5.6 Terra (OpenAI) | xhigh

## Failure behavior
The extension fails open because it is advisory.
- `settings.json` is unreadable or malformed: warn and continue with the current settings.
- Every enabled entry fails the phase filter, or the pool is empty: warn that the phase has no candidate models and continue.
- An enabled entry does not resolve through the registry: skip it and warn with the entry name.
- `pi.setModel()` fails, or the thinking level clamps: warn and continue, using the existing first-version paths. The first-version "selected model missing from the registry" path is subsumed by the pool-build skip warning: an entry that cannot resolve never reaches the picker.

## Components and boundaries
| Component | Source location | Responsibility |
|---|---|---|
| Extension adapter | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts` | Read the scoped-models settings, resolve models through the registry, show the picker, apply confirmed settings, fail open |
| Pure policy module | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts` | Parse the lifecycle command, parse `enabledModels`, apply phase filters, compute default thinking levels |
| Focused tests | `_policy.test.ts` and `_adapter.test.ts` in the same directory | Verify pool filters, thinking defaults, picker ordering, application ordering, and failure paths |

The settings read lives behind one function whose path is overridable through the `PI_LIFECYCLE_SETTINGS_PATH` environment variable for tests, following the `PI_CONTEXT_KIT_USAGE_DIR` precedent (see Resolved questions).

Deleted with this change: the `LIFECYCLE_POLICY` table, the three recommendation positions, the cost classes, the per-model helper functions, and the match-and-notify early exit. `parseLifecyclePhase` and its command set are unchanged.

## State and data handling
The extension reads the raw lifecycle command text, the active model and thinking level, `enabledModels` from the agent settings file, and model metadata from the runtime registry. It stores nothing. The settings file holds preferences; it contains no credentials, and the extension logs only skipped entry names, never file contents. No network calls or extra model calls are added.

## Alternatives considered
### Update the static table's model IDs
The smallest possible change: swap GLM-5.2 for GLM-5.3 and adjust the thinking levels. It is deterministic and touches almost no logic. It was rejected because the table re-stales on every catalog refresh; the current recommendation pointing at a disabled model is direct evidence of that failure mode.
### Auto-skip when the current settings match the pool default
Skipping the picker when the current model and thinking equal the computed default removes one keystroke per lifecycle command and keeps the first version's friction-free path. It was rejected because the user wants to switch models between adjacent phases, such as using one model for `/brainstorm` and another for `/plan`; a hidden picker cannot offer that choice.
### Derive the pool from `modelRegistry.getAvailable()`
This uses only supported APIs and needs no file read. It was rejected because it returns every model with configured authentication, which is twelve models against the six the user deliberately scoped; the scoped set is the curated pool the user asked for.
### Keep lower-cost and increase-quality positions with a hand-maintained cost order
This preserves the one-keystroke cost escalation and the rationale text. It was rejected because the catalog carries no cost data, so the order would be hand-maintained and would go stale like the model IDs it replaces.
### Wait for an upstream scoped-models extension API
A supported accessor would remove the file read and its drift risk. It was rejected because no such API exists in the installed release and the need is current. The file read is isolated in one function so the migration is small when the API arrives.

## Explicit downsides
- The picker appears on every lifecycle command, including invocations where the current settings are exactly what the user wants. Dismissing it costs one selection.
- The tier matchers depend on model-ID substrings. When a catalog refresh renames the flash models, `/execute` and `/verify` can end up with empty pools, which fail open with a warning.
- Reading `settings.json` directly bypasses Pi's settings manager. If the schema or path changes, the pool derivation degrades to a fail-open warning until the read is fixed.
- The picker no longer communicates cost differences; the user weighs cost from model knowledge.
- Gemini 3.8 Flash verifies with thinking `medium`, its second-highest supported level rather than its maximum. The different-model-family rationale for including it is unchanged.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| A catalog rotation renames the flash models out of the `flash` substring | Fail open with a warning; `deliberate:` comment naming per-model tier metadata as the upgrade path |
| `settings.json` schema or location changes in a Pi release | The read is isolated in one function; failure warns and continues |
| An enabled entry references a removed model | Skip the entry, warn with its name, and continue with the remaining pool |
| A selected model clamps the requested thinking level | Existing post-set comparison warns with the effective level |
| Picker friction grows with the scoped set | The pool is bounded by the scoped set; "Keep current model" is first when it qualifies, and cancel is one key |
| The current model appears both as "Keep current model" and as a candidate | The `(current model)` marker makes the two effects distinct: keep preserves the active thinking level; the candidate resets it to the computed default |

## Operability and maintenance
This extension is a local interactive workflow aid. Its observable behavior is the picker, one-line warnings, and the active model and thinking level in the status line. No metrics, alerts, or runbook apply.

The maintenance surface shrinks: the policy table is gone. The remaining maintenance is the tier matcher when model naming changes and the default-thinking rule when the catalog's level maps change. `/scoped-models` edits apply at the next lifecycle command because the settings are read per invocation.

## Rollout
1. Write the failing policy and adapter tests for pool derivation, ordering, thinking defaults, and the new picker flow.
2. Rewrite `_policy.ts` and `index.ts` to pass them.
3. Run `npm ci --ignore-scripts`, then `npm test` and `npm run test:all` from `dot_pi/agent`, and language-server diagnostics on the changed files.
4. Preview the managed target with `chezmoi --source <worktree> diff`.
5. Apply the extension directory target.
6. Exercise each lifecycle command once: with the current model in the pool, with it outside the pool, and with the picker canceled.

## Rollback
Revert the commits and re-apply the managed extension directory. The extension has no persistent state, so no cleanup is required. `/scoped-models` and the model catalog are not part of the rollback.

## Security and privacy
- The extension reads `settings.json`, which holds preferences, not credentials, and uses only the `enabledModels` array.
- It logs skipped entry names only, never settings file contents.
- It resolves models through the registry and `pi.setModel()`; it does not call provider APIs.
- It sends no extra prompt or repository context to any model.
- Gateway authentication and redaction headers remain owned by `models.json`.

## Testing strategy
### Policy tests
- Each phase returns the correct tier from a fixture scoped set: non-flash for framing phases, flash without gemini for `/execute`, flash with gemini for `/verify`.
- Candidates keep `enabledModels` order.
- The default-thinking computation returns the second-highest supported level for every map shape in the catalog, the only supported level for a single-level map, and no level for an absent map or an empty supported list.
- Malformed entries, entries without `/`, and unresolvable pairs are skipped.
- The phase parser keeps its first-version behavior: exact commands, arguments after the command, and non-matching input.

### Adapter tests
- The picker appears on every matching idle interactive invocation, including when the current model and thinking already match a candidate.
- "Keep current model" is the first option if and only if the current model is in the pool; selecting it calls neither `setModel` nor `setThinkingLevel`.
- A candidate selection reuses the model resolved during pool derivation, sets it, then sets the computed thinking level; a mapless candidate sets no thinking level.
- The current model's candidate carries the `(current model)` marker.
- Unreadable settings, an empty pool, and skipped entries warn and continue without mutation.
- Print and JSON modes, queued input, and extension-sourced input pass through unchanged.

### Repository validation
- `npm ci --ignore-scripts` in `dot_pi/agent` before final verification, per repository guidance.
- `npm test` and `npm run test:all` from `dot_pi/agent`.
- Language-server diagnostics on the changed files.
- `chezmoi --source <worktree> diff` scoped to the extension target, then apply.

## Success criteria
- Every lifecycle command shows the picker with the correct phase pool derived from the live scoped-models set.
- "Keep current model" is first exactly when the current model is in the pool, and it changes nothing.
- Candidate selection applies the model and its computed default thinking level; mapless models change only the model.
- Disabling a model in `/scoped-models` removes it from the pool at the next lifecycle command.
- Unavailable settings, unresolvable entries, and empty pools warn and continue without blocking the command.
- Non-interactive and queued invocations mutate nothing.
- The focused tests and the existing Pi-agent suites pass.

## Self-review notes
The design was reviewed against simplicity, feasibility, failure behavior, and maintenance cost.
- **Accepted concern:** the always-shown picker adds one selection to every lifecycle command. The user chose this to enable deliberate model switching between phases; "Keep current model" first and cancel keep the cost at one key.
- **Accepted concern:** the duplicate current-model entries ("Keep current model" and the marked candidate) can confuse at first sight. The design keeps the uniform list instead of dedupe logic; the marker states the difference in effect.
- **Accepted concern:** the `flash` and `gemini` substring matchers are brittle. They are marked `deliberate:` and fail open; the catalog naming has been stable across the GLM-5.2 to GLM-5.3 rotation for the flash tier names.
- **Rejected finding:** filter on the provider name instead of the model ID. The provider `ai-gw-google` identifies gemini today, but the flash tier spans three providers, so a provider-based flash test cannot work without a name test anyway; one mechanism is simpler.
- **Rejected finding:** dedupe the current-model candidate when its thinking already equals the computed default. The dedupe adds a branch for a cosmetic gain; the marker already makes the identical effect visible.

## Decision records
- Decision: derive the pool from `enabledModels` in `~/.pi/agent/settings.json`. Rationale: the scoped set is the user's curated pool, and deriving from live state removes the staleness failure mode of the static table.
- Decision: read the settings file directly through `getAgentDir()`. Rationale: no extension API exposes the scoped set; the context-kit extension sets the precedent, and the read is isolated for a future supported accessor.
- Decision: phase tiers are non-flash for framing, planning, and review; flash without gemini for execution; flash with gemini for verification. Rationale: premium reasoning for thinking-heavy phases, the fast tier for execution, and a different model family for verification independence.
- Decision: the default thinking level is the second-highest level of `getSupportedThinkingLevels(model)`, Pi's own capability function. Rationale: the user's "one below the max" preference, computed from model capability so no table needs maintenance. Deriving from raw `thinkingLevelMap` keys yields levels Pi clamps (`xhigh` for the GLM models, `off` for Gemini 3.8 Flash) and fires the clamp warning on every selection; the supported-levels rule can never request a clamped level.
- Decision: no auto-skip; the picker always shows. Rationale: the user switches models between adjacent phases, so the choice must be visible even when the current settings already fit.
- Decision: "Keep current model" is first when the current model is in the pool and performs zero mutation. Rationale: an explicit no-change contract that preserves the active thinking level.
- Decision: drop cost classes, rationales, and the three-position policy. Rationale: the catalog carries no cost data, so the positions cannot be derived, and a hand-maintained order would reintroduce the staleness this change removes.

## Skills loaded and used

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `write` | agent-selected | The design spec is a prose artifact | Applied clarity rules: short literal sentences, active voice, alternatives state their benefit first, risks as specific failures, imperative requirements |

No skill was loaded during brainstorming; discovery used direct source inspection. The advisory learning lookup returned no matched sections.

## Resolved questions
Resolved during implementation planning on 2026-09-16:
- Settings-path override variable: `PI_LIFECYCLE_SETTINGS_PATH`, consulted on every invocation so tests point at a fixture and `/scoped-models` edits apply at the next lifecycle command.
- Duplicate catalog names: two pool candidates sharing a name both carry a ` [provider]` suffix, because `ctx.ui.select()` returns strings only and the selection maps back to a candidate by option index.
- Skipped-entry warning: one warning line naming all skipped entries, covering both malformed entries and entries the registry cannot resolve.
