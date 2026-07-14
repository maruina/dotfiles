# Pi Lifecycle Model Recommender Design
## Status
Approved on 2026-07-14.

## Problem
Pi's `brainstorm → plan → systematic-review → execute → verify` workflow uses whichever model and thinking level happen to be active when each command starts. This can spend premium tokens on predictable work, use insufficient capability for high-leverage decisions, and miss deliberate cross-provider review boundaries.

Changing models manually is possible, but the user must remember the preferred model and effort for every phase. The workflow needs a small advisory mechanism that presents a cost-conscious recommendation before a lifecycle prompt runs, explains the choice, and changes settings only after confirmation.

## User and audience
The primary user is Matteo, using Pi with models routed through the Datadog AI Gateway. Future Pi sessions and maintainers of these dotfiles are also an audience because the policy must remain understandable without this conversation.

## Goals
- Recommend a model and thinking level when `/brainstorm`, `/plan`, `/systematic-review`, `/execute`, or `/verify` starts.
- Spend the strongest capability on early framing and planning, independent plan review, and final verification while using a balanced model for predictable execution.
- Introduce cross-provider diversity at the two review gates.
- Keep cost visible through relative labels and explicit lower-cost choices.
- Require interactive confirmation before changing the active model or thinking level.
- Keep lifecycle commands usable when a recommended model is missing or unauthenticated.
- Resolve model availability and capabilities from Pi's runtime model registry, whose configured source is `~/.pi/agent/models.json`.
- Keep the first version deterministic, local, testable, and free of additional model calls.

## Non-goals
- Infer task complexity from prompt keywords, repository state, design documents, or plans in the first version.
- Estimate or report exact dollar costs without trustworthy pricing metadata.
- Rank every model available to Pi or compare OpenAI and Anthropic globally.
- Replace Pi's `/model` selector or general model presets.
- Automatically select `max` reasoning.
- Block lifecycle commands when a model cannot be selected.
- Change the behavioral contracts of the lifecycle prompt templates.
- Persist a task profile across sessions or worktrees.
- Automatically choose between 200K and 1M context routes from estimated context usage.

## Context reviewed
- Anthropic effort documentation: effort controls the quality, latency, and token tradeoff across output, tool calls, and thinking; model support and recommended levels vary.
- OpenAI reasoning-effort documentation: effort is model-dependent and independent from model mode; lower levels favor latency and token efficiency, while higher levels favor difficult reasoning.
- User-supplied GPT-5.6 tier guidance: Sol is the flagship reasoning tier, Terra is the balanced tier, and Luna is the fast, cost-efficient tier. This policy input could not be verified in indexed public OpenAI API documentation.
- Pi `README.md`, `docs/models.md`, and the complete `docs/extensions.md`: input interception, user interface dialogs, model registry access, `pi.setModel()`, `pi.getThinkingLevel()`, and `pi.setThinkingLevel()`.
- Pi's `examples/extensions/input-transform.ts` and `preset.ts`: raw input handling and confirmed model/thinking changes.
- The complete lifecycle prompts under `dot_pi/agent/exact_prompts/`: command names, phase responsibilities, and the existing execution-to-verification model-separation handoff.
- `dot_pi/agent/AGENTS.md`: top-level extension entrypoint rules and the requirement to keep lifecycle behavior in prompt files.
- `dot_pi/agent/package.json`: explicit Pi extension unit-test and smoke-test commands.
- Runtime model catalog at `/Users/matteo.ruina/.pi/agent/models.json`, refreshed on 2026-07-14: exact gateway provider names, model IDs, context windows, and thinking-level maps.
- Managed model source at `dot_pi/agent/models.json.tmpl`: refreshed on `main` by commit `7abe12b` and aligned with the runtime GPT-5.6 capability mappings before this design branch.

### Unavailable or deferred evidence
- The runtime gateway definitions contain no trustworthy pricing metadata, so the design uses relative cost classes rather than dollar estimates.
- No benchmark compares these exact gateway-routed models on Matteo's lifecycle tasks. The policy is an explicit starting hypothesis that should be revised from usage evidence.
- No reliable public source was found for a global OpenAI-versus-Anthropic quality ranking. Cross-provider choices are role assignments, not claims of universal superiority.

## Current behavior
Prompt templates are expanded after Pi's `input` event. An extension can therefore recognize a raw lifecycle command, prompt the user, apply a model and thinking level, and then return `continue` so normal template expansion proceeds with the confirmed settings.

Pi already provides the necessary mutation and capability interfaces. `ctx.modelRegistry.find(provider, model)` resolves configured models, `pi.setModel(model)` reports authentication failure, and `pi.setThinkingLevel(level)` clamps to the selected model's supported levels. The extension does not need to parse provider payloads or call provider APIs directly.

The existing `/execute` handoff tells the user to choose a verifier different from the implementation model. A fixed Terra-to-Sonnet default strengthens that boundary by changing both model and provider while preserving manual control.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| Stronger capability has greater leverage during framing and planning than during plan-driven execution | The lifecycle commits design and plan decisions before execution; user preference confirmed during brainstorming | Premium cost may be allocated to phases that do not improve outcomes | Observe accepted recommendations, correction loops, and downstream plan changes; revise only the policy table |
| Terra at `high` can execute a reviewed plan reliably | User-supplied tier guidance identifies Terra as balanced; `/execute` is constrained by committed artifacts and tests | Execution may require frequent escalation to Sol | Keep Sol/`high` as the explicit quality option and record repeated manual escalation as follow-up evidence |
| Opus 4.8 is valuable for adversarial plan review | Anthropic guidance positions higher Opus effort for difficult coding and agentic work | Systematic review may cost more without producing better findings | Keep Sonnet 5/`medium` as the lower-cost option and evaluate actionable finding rates |
| Sonnet 5 1M at `medium` is sufficient for evidence-driven verification | Verification combines deterministic checks, traceability, and semantic review; runtime catalog exposes a 1M route | Medium effort may miss subtle semantic defects | Keep Sonnet 5/`high` as the quality option; `/verify` already blocks on material uncertainty |
| Relative labels are useful without exact prices | Model tiers and effort levels provide directional cost signals | Labels may imply unsupported precision | Label choices as policy classes, state that they are not price estimates, and avoid dollar amounts |
| Input interception can change settings before prompt expansion | Pi extension lifecycle documentation and input-transform example | The lifecycle prompt could run under stale settings | Test event ordering through the extension handler and a smoke scenario |
| Runtime models remain available under the approved provider/model IDs | Refreshed `~/.pi/agent/models.json` | A renamed or removed model makes a recommendation inapplicable | Resolve every choice through the registry at invocation time; warn and continue unchanged on failure |

## Policy
The first version uses an explicit three-position policy for each phase: lower cost, recommended, and increase quality.

| Phase | Lower cost | Recommended | Increase quality |
|---|---|---|---|
| `/brainstorm` | GPT-5.6 Terra / `medium` | GPT-5.6 Sol / `medium` | GPT-5.6 Sol / `high` |
| `/plan` | GPT-5.6 Terra / `high` | GPT-5.6 Sol / `high` | GPT-5.6 Sol / `xhigh` |
| `/systematic-review` | Claude Sonnet 5 200K / `medium` | Claude Opus 4.8 200K / `high` | Claude Opus 4.8 200K / `xhigh` |
| `/execute` | GPT-5.6 Terra / `medium` | GPT-5.6 Terra / `high` | GPT-5.6 Sol / `high` |
| `/verify` | Claude Sonnet 5 200K / `medium` | Claude Sonnet 5 1M / `medium` | Claude Sonnet 5 1M / `high` |

### Runtime model identities
| Label | Provider | Model ID |
|---|---|---|
| GPT-5.6 Luna | `ai-gw-openai` | `openai/gpt-5.6-luna` |
| GPT-5.6 Terra | `ai-gw-openai` | `openai/gpt-5.6-terra` |
| GPT-5.6 Sol | `ai-gw-openai` | `openai/gpt-5.6-sol` |
| Claude Opus 4.8 200K | `ai-gw-anthropic-200k` | `anthropic/claude-opus-4-8` |
| Claude Sonnet 5 200K | `ai-gw-anthropic-200k` | `anthropic/claude-sonnet-5` |
| Claude Sonnet 5 1M | `ai-gw-anthropic-1m` | `anthropic/claude-sonnet-5` |

Luna remains outside the lifecycle matrix. The five commands govern durable engineering decisions or behavior-bearing work, so the lowest tier does not provide enough expected savings to justify a weaker default path. Luna remains available through Pi's ordinary `/model` selector.

The refreshed runtime catalog explicitly maps GPT-5.6 `xhigh` and `max`, making the `/plan` quality option valid. The managed source already preserves those mappings on the branch base. The recommender must not add or infer model capabilities beyond the runtime source of truth.

## Design overview
Add one global Pi extension dedicated to lifecycle model recommendations. Keep the policy data and command parsing separate from the Pi adapter so deterministic behavior can be unit-tested without a terminal or live model registry.

The extension listens to Pi's `input` event and handles only exact raw invocations of:
- `/brainstorm`
- `/plan`
- `/systematic-review`
- `/execute`
- `/verify`

Arguments after the command do not affect the phase policy. Similar prefixes such as `/planning` or ordinary text containing a lifecycle command do not match.

For a matching idle interactive invocation, the extension:
1. Loads the phase's approved recommendation.
2. Compares the active provider, model ID, and thinking level with that recommendation.
3. If all settings match, shows a brief informational notification and continues without a dialog.
4. If settings differ, shows the recommended model, effort, relative cost class, and concise rationale.
5. Offers Apply recommendation, Lower cost, Increase quality, and Keep current settings.
6. Resolves the selected model through `ctx.modelRegistry`.
7. Calls `pi.setModel()` and changes thinking only after model selection succeeds.
8. Verifies the resulting thinking level and warns if Pi clamped it unexpectedly.
9. Returns `continue` so Pi performs normal prompt-template expansion.

The extension never handles the lifecycle prompt itself and never rewrites its arguments. Prompt files remain the source of truth for phase behavior.

## Interaction design
### Matching recommendation
When the current model and thinking level already match, show a compact notification such as:

> `/plan`: already using recommended GPT-5.6 Sol / high

No confirmation dialog appears.

### Mismatched recommendation
The selection dialog identifies the phase and shows each option with:
- model label;
- thinking level;
- relative cost class;
- short rationale; and
- an indication when the option already matches current settings.

The dialog provides these choices in stable order:
1. Apply recommendation
2. Lower cost
3. Increase quality
4. Keep current settings

Canceling the dialog is equivalent to Keep current settings. The lifecycle command continues.

The relative classes are qualitative policy labels, not price calculations:
- **Economy:** the phase's lower-cost option.
- **Balanced:** the approved recommendation.
- **Premium:** the phase's increase-quality option.

### Non-interactive and queued input
The extension must not change model or effort when confirmation is unavailable. In print and JSON modes, it continues unchanged. In RPC mode, Pi can expose dialogs, so the same confirmation contract may run through the RPC user-interface protocol.

A lifecycle command submitted while another agent run is active must not switch the model underneath that run. When `input` reports steering or follow-up delivery, the extension warns when a user interface is available and continues unchanged. Automatic delayed routing is deferred because it would require additional queue state and lifecycle coordination.

## Failure behavior
The recommender fails open because it is advisory.

### Model not found
If the selected provider/model pair is absent from the runtime registry, warn that the recommendation is unavailable and continue with the current settings.

### Authentication unavailable
If `pi.setModel()` returns false, warn that the model could not be selected and leave the thinking level unchanged. Continue the lifecycle command.

### Thinking level clamped
After a successful model change, set the selected thinking level and compare `pi.getThinkingLevel()` with the requested value. If they differ, warn with the effective level and continue. This guards against model-catalog drift without blocking work.

### User cancellation
Keep current settings and continue without warning.

### Extension error
Follow Pi's normal extension error handling. The lifecycle command must not be marked handled, transformed, or blocked by recommender failures.

## Components and boundaries
| Component | Proposed source location | Responsibility |
|---|---|---|
| Extension adapter | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/index.ts` | Register the input hook, interact with Pi's model registry and UI, apply confirmed settings, and fail open |
| Pure policy module | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.ts` | Define exact commands, runtime model identities, recommendation variants, labels, and rationales |
| Focused tests | `dot_pi/agent/exact_extensions/lifecycle-model-recommender/_policy.test.ts` and an adapter-focused test if needed | Verify all policy rows, exact matching, dialog decisions, application ordering, and failures |
| Test registration | `dot_pi/agent/package.json` | Include the extension tests in the existing unit-test suite |

The directory entrypoint follows Pi's auto-discovery contract. Helpers and tests remain under the extension directory so Pi does not load them as standalone extensions.

No lifecycle prompt needs modification. The prompts continue to own phase behavior; the extension owns only pre-expansion recommendation and confirmed routing.

## State and data handling
The first version has no persistent state, configuration file, network call, or model call. The policy is versioned with the extension.

The extension reads only:
- raw user input needed to identify the lifecycle command;
- the active model and thinking level;
- model metadata exposed by Pi's runtime registry; and
- interaction responses from Pi's user interface.

It stores no prompts, repository content, credentials, token usage, or selection history. Pi's existing provider authentication remains unchanged.

## Alternatives considered
### Use Pi presets manually
Presets already demonstrate model and thinking changes and have the genuine merit of being explicit, reusable, and independent of prompt parsing. They were rejected for this slice because the user would still need to remember which preset belongs to each phase, and presets do not provide phase-specific recommendations with lower-cost and higher-quality choices.

### Encode model guidance in lifecycle prompts
Prompt-only guidance is simple and keeps all lifecycle text together. It was rejected because a model cannot reliably change Pi's active model before its own invocation, so the recommendation would arrive too late.

### Automatically infer task complexity
Inference from plans, changed files, or repository metadata could eventually make recommendations more precise and has the merit of reducing manual decisions. It was rejected because `/brainstorm` starts before trustworthy evidence exists, keyword rules would be brittle, and a classifier model call would add cost before useful work.

### Use a fixed model per provider rather than per phase
A single OpenAI worker and Anthropic reviewer would be easy to explain and maintain. It was rejected because it ignores the materially different leverage of framing, planning, execution, and review, and it would not expose useful cost controls.

### Use Opus for both review gates
Opus at both gates offers consistently high review capability and simpler policy. It was rejected because it repeats one model's review perspective and incurs premium cost where `/verify` already has strong deterministic evidence. Sonnet 5 provides provider independence from execution while diversifying the Anthropic reviewer.

### Automatically apply recommendations
Automatic routing removes friction and guarantees policy compliance. It was rejected because model changes affect cost and latency, model availability can drift, and the user explicitly chose an advisory confirmation model for the first version.

### Read and parse `~/.pi/agent/models.json` directly
Direct parsing would make the named file visibly authoritative and could inspect fields unavailable through a smaller interface. It was rejected because Pi's model registry already resolves loaded configuration, provider registration, authentication behavior, and capability normalization. Reimplementing model loading would create drift and bypass Pi's supported extension boundary.

## Explicit downsides
The chosen design is not cost-free:
- Every mismatched lifecycle invocation adds an interaction before useful work begins.
- Static policy cannot distinguish a typo fix from a risky migration within the same phase.
- Relative cost labels may become stale as provider pricing and gateway policy change.
- The extension depends on stable provider and model IDs from the runtime catalog.
- Fail-open behavior preserves usability but allows a lifecycle phase to run under a non-recommended model.
- The 1M verification route may enable expensive long-context requests when verification exceeds ordinary context size.
- The policy is personal workflow logic that requires maintenance as models evolve.

These downsides are acceptable for the first slice because the extension remains transparent, advisory, easy to disable, and isolated from lifecycle prompt behavior.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Recommendation changes the current run unexpectedly | Act only on idle input and require explicit confirmation |
| Model catalog drifts | Resolve at invocation time, compare effective thinking level, warn, and continue unchanged where possible |
| Runtime and managed model catalogs drift later | Resolve through the runtime registry on every invocation and validate the managed work-profile rendering during rollout |
| Dialog fatigue | Skip the dialog when settings already match and keep notifications compact |
| Static policy overspends on trivial work | Offer a one-step lower-cost choice on every phase |
| Static policy underspends on difficult work | Offer an increase-quality choice without using `max` automatically |
| Cross-provider review is lost | Keep Opus as the systematic reviewer and Sonnet as the verifier while Terra remains the default executor |
| Partial application leaves surprising settings | Set thinking only after model selection succeeds and report any clamping |
| Extension breaks non-interactive workflows | Never require confirmation or mutate settings when confirmation is unavailable |
| Policy claims unsupported pricing precision | Use qualitative classes and document the lack of exact pricing metadata |

## Operability and maintenance
This extension is a local interactive workflow aid, not a production service. It requires no metrics, alerts, dashboard, or on-call runbook.

Its observable behavior is:
- a recommendation dialog when current settings differ;
- a compact notification when they match;
- a warning when routing cannot be applied; and
- the active model and thinking level already visible in Pi's status line.

The policy table is the single maintenance surface. Model catalog changes should update the managed runtime configuration first, then update policy identities only when necessary. Repeated use of Lower cost or Increase quality is the evidence for revising defaults; v1 does not add telemetry to collect that behavior.

## Rollout
1. Add the extension and focused tests in one feature worktree.
2. Run the Pi-agent unit suite, full test suite, language diagnostics, and smoke test.
3. Confirm the managed work-profile model rendering still matches the runtime catalog.
4. Preview the exact managed extension target with `chezmoi --source <feature-worktree> diff`.
5. Apply only the affected extension target after independent verification.
6. Exercise each lifecycle command once with matching settings and once with mismatched settings.
7. Observe dialog friction, unavailable-model warnings, manual adjustment frequency, and lifecycle outcomes before adding adaptive inference.

## Rollback
Disable or remove the extension and apply the managed extension directory. Revert the policy commit if needed. No session migration, persistent state cleanup, remote service rollback, or credential change is required.

The pre-existing GPT-5.6 capability maps are not part of recommender rollback.

## Security and privacy
- The extension does not read or log provider credentials.
- It uses Pi's model registry and `pi.setModel()` rather than invoking provider APIs directly.
- It does not send an extra prompt or repository context to any model.
- It must not display API-key resolution commands or sensitive model configuration fields in warnings.
- It sees raw lifecycle command text only to identify an exact command prefix and does not persist arguments.
- Existing Datadog AI Gateway redaction and attribution headers remain owned by `models.json`.

## Testing strategy
### Pure policy tests
- Every lifecycle command maps to the exact approved lower-cost, recommended, and increase-quality choices.
- Commands with arguments match the same phase.
- Similar command names, escaped text, and ordinary prose do not match.
- Every policy model identity matches an entry in the rendered work-profile model catalog.
- Every requested thinking level is exposed by the selected model according to Pi's mapping rules.

### Extension behavior tests
- Matching model and thinking settings produce a notification, no dialog, and no mutation.
- A confirmed recommendation selects the model before setting thinking and then continues input processing.
- Lower cost and Increase quality apply their exact policy variants.
- Keep current and dialog cancellation perform no mutation.
- A missing registry model warns and continues unchanged.
- Failed authentication warns, leaves thinking unchanged, and continues.
- Unexpected thinking clamping warns with the effective level.
- Print and JSON modes do not prompt or mutate.
- Queued steering and follow-up lifecycle commands do not mutate the active run.
- Non-lifecycle input passes through without user-interface or model interactions.

### Repository validation
- Run `npm ci --ignore-scripts` in `dot_pi/agent` before final verification, per repository guidance.
- Run `npm test` and `npm run test:all` from `dot_pi/agent`.
- Run TypeScript language-server diagnostics for changed extension files.
- Render the work profile and confirm the managed model catalog matches the approved runtime identities and thinking levels.
- Run targeted `chezmoi --source <feature-worktree> diff` for the new extension target; separately confirm `~/.pi/agent/models.json` has no model-catalog drift.
- Confirm no unrelated target would be changed by the scoped apply.

## Success criteria
- Each lifecycle command presents the approved recommendation when current settings differ.
- No model or thinking change occurs without interactive confirmation.
- Confirmed settings take effect before lifecycle prompt expansion and agent startup.
- Matching settings proceed without a dialog.
- Missing or unauthenticated models do not block lifecycle commands.
- Non-interactive and queued invocations do not mutate active settings.
- Other commands and ordinary prompts remain unaffected.
- The policy requests only thinking levels exposed by the runtime model catalog.
- Focused tests and the existing Pi-agent suites pass.

## Self-review notes
The design was reviewed skeptically against simplicity, feasibility, cost control, provider diversity, failure behavior, and chezmoi ownership.

- **Accepted concern:** static phase policy cannot be optimal for every task. The first slice makes the limitation visible and provides explicit lower-cost and higher-quality choices instead of pretending to infer complexity.
- **Accepted concern:** the 1M Sonnet route can permit higher long-context cost. The policy uses medium effort, exposes a 200K lower-cost option, and does not claim exact savings.
- **Accepted concern:** fail-open behavior weakens policy enforcement. Advisory routing was an explicit decision; warnings and the visible status line preserve transparency without making gateway availability a workflow blocker.
- **Accepted concern:** changing a model during a queued command could affect the active run. The design restricts changes to idle input and defers delayed routing.
- **Accepted concern:** model capability metadata can drift after implementation. Runtime resolution fails open, and rollout validates the managed rendering against the runtime catalog.
- **Rejected finding:** parse `models.json` directly to make it the source of truth. Pi's runtime registry is the supported loaded representation and avoids duplicating provider-loading semantics.
- **Rejected finding:** add adaptive complexity scoring now. The available signals are inconsistent across phases, and an unvalidated classifier would add complexity and potentially cost without reliable evidence.
- **Rejected finding:** use Luna for the lower-cost lifecycle path. These commands produce durable engineering decisions or behavior; Terra/`medium` is the safer floor for v1.

## Decision records
- Decision: use an advisory extension rather than prompt text or automatic routing. Rationale: the extension can act before prompt expansion while preserving explicit user control over cost and latency.
- Decision: use Sol for framing and planning, Opus for systematic review, Terra for execution, and Sonnet for verification. Rationale: allocate premium capability to high-leverage decisions and independent gates while using a balanced model for reviewed, predictable implementation.
- Decision: use Sonnet 5 1M at `medium` for the default verifier. Rationale: fresh deterministic evidence reduces the need for maximum reasoning, while the larger context avoids making verification capacity the common constraint.
- Decision: use deterministic phase defaults with one-step adjustments. Rationale: static policy is transparent and testable; v1 lacks trustworthy complexity signals.
- Decision: fail open on unavailable routing. Rationale: the recommender is advisory and should not turn transient model or authentication problems into lifecycle outages.
- Decision: act only on idle interactive input. Rationale: model changes must not alter an already-running agent turn.
- Decision: resolve models through Pi's registry rather than reading JSON directly. Rationale: the registry is Pi's supported runtime representation of `~/.pi/agent/models.json` and registered providers.
- Decision: keep lifecycle prompts unchanged. Rationale: prompt files own phase behavior; the extension owns only pre-expansion model recommendation and confirmed selection.
