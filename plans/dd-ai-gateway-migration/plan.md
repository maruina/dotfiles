# dd-ai-gateway Migration Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `refresh-models` Pi package with the stock `dd-ai-gateway` package and preserve LLM Obs attribution through a local chezmoi overlay. Set the governed `ml_app_id` with Gateway's allowlisted `ml-app-id` header; use custom `x-dd-tag-*` headers for `ml_app`, `dd.user_email`, `dd.team`, and `client_session_id`.
**Smallest user-feedback slice:** A local session-id extension and `models.json` header overlay run beside the current `ai-gw-*` providers, and a probe request through stock `dd-ai-gateway` for each provider shows the attribution headers.
**Out of Scope:** Upstream PR to `ddoghq/datadog-pi-packages` (optional FYI to the owner later); the JWT `grep` filter on the ddtool token (accepted risk, see Key Decisions); anthropic-cyber gated models, Ollama discovery and pull, presets and picker, per-user availability filtering; the 200K early-compaction Claude variant; Gateway-only models absent from Pi's builtin catalogs (`ai-gw-databricks`, `ai-gw-logical` aliases); moving the package path from `~/go/src/github.com/DataDog/datadog-pi-packages` to `~/dd`; changing the `ai-gw-*` fixture names in the lifecycle-model-recommender tests.
**Architecture:** Stock `dd-ai-gateway` re-registers the builtin `anthropic`, `baseten`, `google`, `openai`, and `typesafe` providers against `https://ai-gateway.us1.ddbuild.io`. Pi merges `models.json` provider `headers` under extension headers and applies `models.json` provider `compat` to builtin models, so a chezmoi-managed `models.json` overlay adds the attribution headers and the Claude compat override. A small chezmoi extension sets `PI_CLIENT_SESSION_ID` on `session_start` so the `$PI_CLIENT_SESSION_ID` header resolves.
**Tech Stack:** Pi 1.0.0 extensions (TypeScript, `node --experimental-strip-types --test`), chezmoi Go templates and `modify_` jq script, `pup ddsql` against `dd.llm_observability`.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires skill selection before recommendations | Selected `chezmoi` and `codebase-research`; no TypeScript-specific skill exists |
| `learning-lookup` | `prompt-required` | Advisory lookup before planning decisions | Applied "Render piped chezmoi templates against an initialized config, not `--init`" to the template-render test |
| `codebase-research` | `skill-loader` | Unfamiliar area: Pi provider composition and refresh-models internals | Traced header, `apiKey`, and `compat` layering in `provider-composer.js` before choosing the overlay design |
| `chezmoi` | `skill-loader` | Changes to `models.json.tmpl`, `modify_private_settings.json.tmpl`, and `exact_extensions/` | Edit source, not targets; verify with `chezmoi diff` on explicit target files; `--source` for the worktree |
| `slack-mcp` | `agent-selected` | The brief cited Slack thread `C0AU45Z1FFC/p1790675568.891449` | Read the thread for the owner's attribution stance and the session-id finding |
| `feature-worktree` | `prompt-required` | `/plan` writes `plan.md` in a feature worktree | Created `maruina/dd-ai-gateway-migration` at `~/src/.worktrees/dotfiles/maruina-dd-ai-gateway-migration` |

Advisory learning lookup: ran `Datadog/Learnings.md` through `learn-evidence.mjs learning-sections` with terms `models.json`, `refresh-models`, `provider`, `chezmoi`, `AI Gateway`, `pi package`. Two sections matched; one applies (chezmoi `execute-template` without `--init`). The other (platform-injected env vars) does not apply.

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | Resolve the plan path across worktrees | Located this plan in the dedicated migration worktree and switched all repository commands there |
| `feature-worktree` | `prompt-required` | Execute plan changes in the owning feature worktree | Confirmed the existing migration worktree is the target |
| `skill-loader` | `prompt-required` | Select execution skills before editing | Loaded the chezmoi, codebase research, Slack, and writing guidance needed for this slice |
| `chezmoi` | `skill-loader` | Edit chezmoi-managed source and verify targets | Followed source-only editing, explicit target checks, and `--source` commands |
| `codebase-research` | `skill-loader` | Trace unfamiliar Pi extension, test, and model-template patterns | Mapped session-start handlers, test wiring, and template-render test patterns before editing |
| `slack-mcp` | `prompt-required` | Inspect the discussion referenced by the plan | Read the referenced thread and confirmed the session-id finding and Gateway attribution context |
| `write` | `skill-loader` | Update the plan progress and evidence ledger | Kept execution notes concise and tied to observed results |
| `learning-candidates` | `prompt-required` | Record an execution finding that disproved a plan assumption | Added the header-versus-span attribution mismatch to the learning ledger |

## Source of truth and confirmed decisions
- **User planning brief** and the alignment brief confirmed in chat on 2026-10-05.
- **`/session-cost` dependency:** `packages/session-cost/extensions/session-cost/query.ts:55` filters `service:ai_gateway ml_app:pi client_session_id:<id>`. Without `client_session_id`, `/session-cost` reports $0.
- **Slack thread** `C0AU45Z1FFC/p1790675568.891449`: the `dd-ai-gateway` owner states `x-dd-tag-*` headers are not needed for attribution because the Gateway reads the user from auth when `claude-code: true` is set; Lucas confirmed that adding only the session-id header fixed `session-cost`.
- **Pi 1.0.0 mechanisms** (`~/.asdf/installs/nodejs/25.2.1/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/`):
  - `provider-composer.js:212` `configuredHeaders` returns `{ ...config?.headers, ...extension?.headers }`: `models.json` headers merge under extension headers.
  - `provider-composer.js:157` applies `models.json` provider `compat` to base models via `mergeCompat` (`{ ...base, ...override }`), so `false` overrides a builtin `true`.
  - `provider-composer.js:209` `extension?.apiKey ?? config?.apiKey`: the extension `apiKey` wins; `models.json` cannot change it.
  - `resolve-config-value.js` `resolveHeadersOrThrow`: an unset `$PI_CLIENT_SESSION_ID` throws and fails the request.
- **Token output:** `ddtool auth token rapid-ai-platform --datacenter us1.ddbuild.io 2>/dev/null` printed one 1648-character line on 2026-10-05 (user-run). Pi runs `!command` values with stderr ignored, so the stock `apiKey` resolves cleanly.
- **Team value:** DDSQL over 14 days of `service:ai_gateway` spans shows teammates `peter.rifel@` and `mateo.lelong@` on `dd.team:compute`; the user's spans carry `dd.team:unknown`. User chose `compute`.
- **Builtin catalog coverage:** Pi's builtin catalogs contain every currently used model: `anthropic/claude-opus-5-5`, `openai/gpt-6-sol`, `openai/gpt-6-luna`, `google/gemini-3.8-flash`, `baseten/zai-org/GLM-5.3`, `baseten/zai-org/GLM-5.3-Flash`, `baseten/deepseek-ai/DeepSeek-V4.1-Flash`.
- **No credential shadowing:** `~/.pi/agent/auth.json` has no entries and no `*_API_KEY` env vars are set for these providers.

## Requirements and acceptance scenarios

### Requirement: Session id is available to Gateway headers
The `pi-client-session-id` extension SHALL set `process.env.PI_CLIENT_SESSION_ID` to the current Pi session id on every `session_start`.

#### Scenario: session start sets the env var
- GIVEN the extension factory is registered with a fake `ExtensionAPI`
- WHEN the captured `session_start` handler runs with `ctx.sessionManager.getSessionId()` returning `019f0000-0000-7000-8000-000000000001`
- THEN `process.env.PI_CLIENT_SESSION_ID` equals that id

#### Scenario: a new session replaces the previous id
- GIVEN `PI_CLIENT_SESSION_ID` holds an earlier session id
- WHEN `session_start` runs for a different session id
- THEN `PI_CLIENT_SESSION_ID` equals the new id

### Requirement: Gateway providers carry the attribution overlay
The work-profile `models.json` SHALL define `anthropic`, `openai`, `google`, `baseten`, and `typesafe` provider entries with `ml-app-id: ai-devx.pi` and the four custom attribution headers `x-dd-tag-ml_app: pi`, `x-dd-tag-dd.user_email: <chezmoi .email>`, `x-dd-tag-dd.team: compute`, and `x-dd-tag-client_session_id: $PI_CLIENT_SESSION_ID`. These entries SHALL NOT set `x-dd-tag-ml_app_id`; Gateway derives the governed `ml_app_id` from the allowlisted `ml-app-id` header. The four new entries (`anthropic`, `openai`, `google`, `baseten`) SHALL carry only these five attribution headers, except `anthropic` which additionally carries `anthropic-beta: context-1m-2025-08-07` for 1M-context parity with today's `ai-gw-anthropic-1m`. The existing `typesafe` entry keeps its other headers (`source`, `org-id`, `x-llmo-force-redaction`, `provider: typesafe`). After cutover, these entries SHALL NOT set `baseUrl` or `apiKey`.

#### Scenario: rendered template has the overlay
- GIVEN the work-profile chezmoi config
- WHEN `models.json.tmpl` is rendered
- THEN each of the five providers has `ml-app-id: ai-devx.pi` and the four custom attribution headers

#### Scenario: overlay entries are headers-only after cutover
- GIVEN the cutover template (Task 4)
- WHEN `models.json.tmpl` is rendered
- THEN no provider key starts with `ai-gw-`, and none of the five overlay entries sets `baseUrl` or `apiKey`

#### Scenario: header coupling is guarded
- GIVEN the rendered `models.json` references `$PI_CLIENT_SESSION_ID`
- WHEN the unit tests run
- THEN they fail unless `dot_pi/agent/exact_extensions/pi-client-session-id/index.ts` exists

### Requirement: Claude requests avoid flags that trigger Gateway fallback
The work-profile `anthropic` entry SHALL set `compat` to `{ "supportsStrictTools": false, "supportsMidConvoSystemMessages": false, "supportsMidConvoToolChanges": false, "supportsMidConvoEffort": false }`.

#### Scenario: Claude model compat is overridden at runtime
- GIVEN stock `dd-ai-gateway` and the overlay are loaded
- WHEN the header probe runs a request with `anthropic/claude-opus-5-5`
- THEN the probe logs `compat` with all four flags `false`

### Requirement: Requests through stock dd-ai-gateway succeed with attribution
Probe requests through each Gateway chat provider SHALL succeed, and the resulting LLM Obs spans SHALL carry `ml_app:pi`, `dd.user_email:matteo.ruina@datadoghq.com`, `dd.team:compute`, and the probe's `client_session_id`. The current approved `ml-app-id: ai-devx.pi` resolves to `ml_app_id:unregistered` in production; retain and report that result.

#### Scenario: probe per provider (Slice 1, before cutover)
- GIVEN the overlay and extension are applied while `refresh-models` is still installed
- WHEN `pi --no-extensions -e <dd-ai-gateway> -e <pi-client-session-id> -e /tmp/header-probe.ts --session-id <uuid> -p "Reply with ok"` runs for each probe model
- THEN each command exits 0 with a reply, and the probe log shows `ml-app-id: ai-devx.pi` plus the four custom attribution headers, with `client_session_id` equal to `<uuid>`

#### Scenario: spans carry the tags
- GIVEN the probe requests completed
- WHEN `pup ddsql` queries `dd.llm_observability` for `service:ai_gateway client_session_id:<uuid>`
- THEN at least one span per probe model returns `ml_app=pi`, `ml_app_id=unregistered` (the current approved live result), `dd.team=compute`, and `dd.user_email=matteo.ruina@datadoghq.com`

#### Scenario: missing session id fails visibly (failure path)
- GIVEN the overlay is loaded but the `pi-client-session-id` extension is not
- WHEN a probe request runs with `pi --no-extensions -e <dd-ai-gateway> -p ...`
- THEN the request fails with `Failed to resolve provider "<id>" header "x-dd-tag-client_session_id" from environment variable: PI_CLIENT_SESSION_ID`, confirming the documented trap

### Requirement: refresh-models is retired
After cutover, the work-profile `models.json` SHALL contain no `ai-gw-*` providers, `.packages` SHALL list `dd-ai-gateway` instead of `refresh-models`, and Pi's default and scoped models SHALL use the new provider refs.

#### Scenario: catalog after cutover
- GIVEN `chezmoi apply` ran and Pi restarted
- WHEN `pi --list-models ai-gw` and `pi --list-models GLM-5.3` run
- THEN the first lists no models and the second lists `baseten` / `baseten/zai-org/GLM-5.3`

#### Scenario: /session-cost works after cutover
- GIVEN an interactive session on `baseten/baseten/zai-org/GLM-5.3` with at least one completed turn
- WHEN `/session-cost` runs after LLM Obs ingestion (up to 10 minutes)
- THEN the underlying estimated cost is greater than zero. The `/session-cost` formatter uses two decimal places, so a sub-cent total can display as `$0.00`.

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Session-id extension | `dot_pi/agent/exact_extensions/pi-client-session-id/index.ts`, `dot_pi/agent/exact_extensions/pi-client-session-id/index.test.ts` | Set `PI_CLIENT_SESSION_ID` on `session_start`; guard the header coupling | `npm run test:unit` in `dot_pi/agent` |
| Unit test wiring | `dot_pi/agent/package.json` | Add the new test glob to `test:unit` | `npm run test:unit` lists the new tests |
| Attribution overlay | `dot_pi/agent/models.json.tmpl` (work branch) | Headers for five providers and Claude compat; later remove `ai-gw-*` and the old `typesafe` entry | Template-render test; `chezmoi diff ~/.pi/agent/models.json` |
| Package install | `dot_pi/agent/modify_private_settings.json.tmpl` (work branch) | Swap `refresh-models` for `dd-ai-gateway` in `.packages` | `chezmoi diff ~/.pi/agent/settings.json`; `jq .packages ~/.pi/agent/settings.json` |
| Pi-owned selection | `~/.pi/agent/settings.json` fields `defaultProvider`, `defaultModel`, `enabledModels` (Pi-owned, not chezmoi) | New default and scoped models | `jq` on the target; recommender emits no `could not select` warning |
| Docs and guidance | legacy model-sync guidance, `dot_pi/agent/exact_skills/chezmoi/SKILL.md`, `AGENTS.md` | Remove refresh-models workflow; document the overlay and the coupling trap | `npm run test:prompts`, `npm run test:skills`; `rg refresh-models` sweep |

### Key Decisions
- **Stock `dd-ai-gateway`, everything else local.** Every needed attribution change can be added through `models.json` and a local extension (`provider-composer.js:212`, `:157`). No upstream dependency or fork.
- **Session id via `session_start` + env var.** Matches the proven refresh-models mechanism. Rejected `before_provider_headers`: its event lacks the request model, so the tag could leak to non-Gateway providers.
- **Keep `claude-code: true`** (set by `dd-ai-gateway`): the Gateway derives user identity from auth when it is set.
- **Claude compat override in `models.json`:** parity with refresh-models, which omits strict-tool and mid-conversation flags to avoid Gateway fallback from Bedrock and the cost increase.
- **No JWT filter.** `deliberate:` accepted risk: if a future ddtool writes an upgrade notice to stdout, Gateway auth fails visibly; the fix is a local fork or upstream one-line `grep` filter.
- **`dd.team: compute`** to group with teammates.
- **`typesafe` keeps `baseUrl`/`apiKey` until cutover.** `typesafe` is a builtin Pi classifier provider; while refresh-models is installed, nothing else routes Jev through the Gateway. Task 4 strips both fields when `dd-ai-gateway` takes over registration.
- **Governed `ml_app_id` uses `ml-app-id`.** Gateway ignores caller-supplied `x-dd-tag-ml_app_id` for this field, resolves the distinct `ml-app-id` header against its allowlist, and overwrites the custom tag. Use the seeded `ai-devx.pi` value. Matteo approved all five probes and the cutover despite the live spans resolving it as `unregistered`.
- **Session-id extension as a directory** (`pi-client-session-id/index.ts`) so its test file is not auto-discovered as an extension, per the repository `AGENTS.md` rule.

### Implementation Constraints
- Run every `chezmoi` command with `--source ~/src/.worktrees/dotfiles/maruina-dd-ai-gateway-migration` (repository `AGENTS.md`); run `chezmoi diff`/`verify` against explicit target files, not directories.
- Render templates with `chezmoi --source <worktree> execute-template`, never `--init`.
- `enabledModels`, `defaultProvider`, and `defaultModel` are Pi-owned (`modify_private_settings.json.tmpl` header comment), not chezmoi-managed. Prefer Pi's `/model` and `/scoped-models` selectors; in a non-interactive environment, update only these keys in `~/.pi/agent/settings.json` and verify them with `jq`.
- Do not run `/refresh-models` between Task 2 and Task 4: refresh-models manages the `typesafe` entry and can rewrite it during a save.
- The throwaway probe extension lives in `/tmp` and is never committed. It MUST NOT print `Authorization` or any header value outside the allowlist: `source`, `org-id`, `provider`, `claude-code`, `anthropic-beta`, `ml-app-id`, `x-llmo-force-redaction`, `x-dd-tag-*`.
- **Stop conditions:** stop and report if (a) the probe log does not include provider-configured headers (then use the DDSQL span check as the Slice 1 evidence instead, and record the gap); (b) any probe model returns a Gateway error that does not occur on the corresponding `ai-gw-*` model; (c) DDSQL shows no spans for the probe session after 10 minutes; (d) `session_start` does not fire before the first request in `-p` mode.
- Safety and performance: the extension does one env assignment per session start; no processes, timers, or network. Header resolution is per request inside Pi; no new fan-out.

### Security Requirements
- No secrets enter the repository: `dd-ai-gateway` keeps the `!ddtool auth token` command; the overlay carries only the email (already in `models.json.tmpl`) and static tags.
- The probe redacts `Authorization` and logs only allowlisted header names and values.
- `client_session_id` is sent only to Gateway providers because it is defined only on the Gateway provider entries in `models.json`.

### Observability Requirements
- Success signal: LLM Obs spans for `service:ai_gateway` carry `ml_app:pi`, `dd.team:compute`, `dd.user_email`, and `client_session_id`; with the currently approved candidate id, Gateway records `ml_app_id:unregistered`. `/session-cost` should show a non-zero cost once Matteo runs it in an interactive session.
- Failure signals: Pi reports `Failed to resolve ... PI_CLIENT_SESSION_ID` (missing extension), `Failed to resolve API key` or HTTP 401 (token output changed), or Gateway HTTP errors on a model.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Extension missing or `--no-extensions` while overlay present | Gateway requests fail with the env-var resolution error | Failure-path probe in Task 3; coupling test in Task 1 |
| `session_start` fires after the first request | Request fails with the env-var error | Probe in `-p` mode (Task 3); stop condition (d) |
| ddtool prints extra stdout | Auth fails with a visible error | Accepted risk; documented in `AGENTS.md` (Task 6) |
| Claude compat overlay ignored | Probe shows `true` flags | Probe compat log (Task 3) |
| Model not served through Gateway under the builtin id | Probe request fails | Probe per model before cutover (Task 3) |
| Scoped model ref typo | Pi or recommender warns `could not select` | Task 5 check |

### Rollout and Rollback
- **Rollout:** Slice 1 adds the overlay beside the existing `ai-gw-*` providers, so daily use stays on refresh-models while the probe validates the new path. Slice 2 cuts over in one chezmoi commit.
- **Rollback:** `git revert` the cutover commit, then `chezmoi --source <checkout> apply ~/.pi/agent/models.json ~/.pi/agent/settings.json`; this restores `refresh-models` and the `ai-gw-*` providers. Then reselect `ai-gw-logical/glm-5-3` with `/model` and restore the previous scoped models (listed in Task 5). The overlay and extension are harmless with refresh-models installed.
- **Owner:** Matteo Ruina (personal dotfiles).

### Test Strategy
| Requirement | Highest deterministic interface | Seam |
|---|---|---|
| Session id set on `session_start` | Extension factory with fake `ExtensionAPI` | New `pi-client-session-id/index.test.ts`, matching the `session-tags.test.mjs` style |
| Overlay headers and compat in template | Rendered `models.json.tmpl` | Same test file; renders via `chezmoi --source <repo> execute-template`, falls back to `~/.pi/agent/models.json` when no source tree exists (pattern from `lifecycle-model-recommender/_policy.test.ts`) |
| Header coupling guard | Same rendered catalog + `existsSync` on the extension | Same test file |
| Runtime headers and compat | `pi --no-extensions -e ... -p` with `/tmp/header-probe.ts` (`before_provider_headers` + `ctx.model.compat`) | Throwaway probe; automation impractical because it needs live Gateway auth |
| Span tags | `pup ddsql table` on `dd.llm_observability` | Existing tool used by `session-cost` |
| `/session-cost` | Interactive `/session-cost` | Existing command |
| Extension load health | `npm run test:smoke` (`pi --list-models` offline, no `[Extension issues]`) | Existing |

Narrow command expected to fail before implementation: `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/pi-client-session-id/index.test.ts` (file does not exist; after Task 1's test-first step it fails on the missing extension and overlay).

## Tasks

### Slice 1: Local attribution overlay beside refresh-models
Delivers: stock `dd-ai-gateway` plus the local overlay sends the full attribution header set, verified by probe and LLM Obs spans, while daily use stays on refresh-models.

### Task 1: Session-id extension with overlay tests
**Status:** Complete.
**Delivers:** `pi-client-session-id` extension, its unit tests, and failing overlay tests that Task 2 makes pass.
**Blocked by:** None
**Traces to:** Requirement "Session id is available to Gateway headers"; Requirement "Gateway providers carry the attribution overlay"
**Files:** `dot_pi/agent/exact_extensions/pi-client-session-id/index.ts`, `dot_pi/agent/exact_extensions/pi-client-session-id/index.test.ts`, `dot_pi/agent/package.json`

- [x] Run `npm ci --ignore-scripts` in `dot_pi/agent` (repository `AGENTS.md`).
- [x] Write `index.test.ts` with: the two session-id scenarios (fake `pi.on` capturing the `session_start` handler); a rendered-catalog test asserting the five providers each have `ml-app-id: ai-devx.pi` and the four custom attribution headers (`typesafe` also `provider: typesafe`), with no `x-dd-tag-ml_app_id` header, the `anthropic` entry also carries `anthropic-beta: context-1m-2025-08-07`, and the `anthropic` `compat` has four `false` flags; and the coupling guard (if any rendered header value contains `$PI_CLIENT_SESSION_ID`, the extension `index.ts` exists).
- [x] Add `"$ext"/pi-client-session-id/*.test.ts` to `test:unit` in `dot_pi/agent/package.json`.
- [x] Run `node --experimental-strip-types --test exact_extensions/pi-client-session-id/index.test.ts` from `dot_pi/agent`; expect failures for the missing extension and missing overlay.
- [x] Implement `index.ts`: default factory registering `pi.on("session_start", (_event, ctx) => { process.env.PI_CLIENT_SESSION_ID = ctx.sessionManager.getSessionId(); })`, with a short header comment naming the `models.json` coupling.
- [x] Rerun the test; expect the session-id tests to pass and the overlay tests to still fail (fixed in Task 2).
- [ ] Do not commit yet; Task 2 lands in the same commit so the coupling guard is green.

### Task 2: models.json overlay for Gateway providers
**Status:** Complete.
**Delivers:** The work branch of `models.json.tmpl` adds the five overlay entries beside the existing providers; Task 1 tests pass.
**Blocked by:** Task 1
**Traces to:** Requirement "Gateway providers carry the attribution overlay"; Requirement "Claude requests avoid flags that trigger Gateway fallback"
**Files:** `dot_pi/agent/models.json.tmpl`, plus Task 1 files

- [x] In the work branch, add `anthropic`, `openai`, `google`, `baseten` entries with only `headers` (`ml-app-id: ai-devx.pi` plus four custom attribution headers, email as `{{ .email }}`, team `compute`; the `anthropic` entry also carries `anthropic-beta: context-1m-2025-08-07` for 1M-context parity with `ai-gw-anthropic-1m`), and `compat` on `anthropic` only.
- [x] In the existing `typesafe` entry, change only `x-dd-tag-dd.team` to `compute`; keep its `baseUrl` and `apiKey` until Task 4.
- [x] Leave all `ai-gw-*` providers unchanged.
- [x] Run `node --experimental-strip-types --test exact_extensions/pi-client-session-id/index.test.ts`; expect all tests pass.
- [x] Run `npm run test:unit`; expect pass, including `lifecycle-model-recommender/_policy.test.ts`.
- [x] Run `chezmoi --source <worktree> diff ~/.pi/agent/models.json ~/.pi/agent/extensions/pi-client-session-id/index.ts`; expect only the planned additions and the `typesafe` team change.
- [x] Commit with `feat(pi): add AI Gateway attribution overlay and session-id extension`.

### Task 3: Probe stock dd-ai-gateway with the overlay
**Status:** Complete by user direction — Matteo approved retaining `ml-app-id: ai-devx.pi` and proceeding despite the production allowlist returning `unregistered`. All five provider requests succeeded; all five spans carried the other expected tags.
**Delivers:** Evidence that each provider succeeds through stock `dd-ai-gateway` with attribution headers, Claude compat override, and span tags.
**Blocked by:** Task 2
**Traces to:** Requirement "Requests through stock dd-ai-gateway succeed with attribution"; Requirement "Claude requests avoid flags that trigger Gateway fallback"
**Files:** none committed (`/tmp/header-probe.ts`, `/tmp/dd-ai-gateway-probe.log`)

- [x] Run `git -C ~/go/src/github.com/DataDog/datadog-pi-packages pull --ff-only` so the installed `dd-ai-gateway` is current `main`.
- [x] Apply the Slice 1 targets: `chezmoi --source <worktree> apply ~/.pi/agent/models.json ~/.pi/agent/extensions/pi-client-session-id/index.ts`. The combined command failed because the new target directory did not exist; applying `models.json` and then the new extension directory separately succeeded, and the explicit-target diff is empty.
- [x] Write `/tmp/header-probe.ts`: a `before_provider_headers` handler that appends to `/tmp/dd-ai-gateway-probe.log` the `ctx.model` provider and id, `ctx.model.compat`, and allowlisted headers only (see Implementation Constraints).
- [x] Generate a lowercase UUID per run. For each model `anthropic/claude-opus-5-5`, `openai/openai/gpt-6-luna`, `google/gemini-3.8-flash`, `baseten/baseten/zai-org/GLM-5.3-Flash`, `baseten/baseten/zai-org/GLM-5.3`, run `pi --no-extensions -e ~/go/src/github.com/DataDog/datadog-pi-packages/packages/dd-ai-gateway/extensions/dd-ai-gateway/index.ts -e ~/.pi/agent/extensions/pi-client-session-id/index.ts -e /tmp/header-probe.ts --session-id <uuid> --model <model> -p "Reply with ok"`; expect exit 0 and a reply.
- [x] Check the original probe log: each request has `x-dd-tag-ml_app: pi`, `x-dd-tag-ml_app_id: aidevx.pi`, `x-dd-tag-dd.user_email: matteo.ruina@datadoghq.com`, `x-dd-tag-dd.team: compute`, `x-dd-tag-client_session_id: <uuid>`, `claude-code: true`; the Claude request shows the four compat flags `false` and `anthropic-beta: context-1m-2025-08-07`. This log predates the approved header correction.
- [x] Failure path: run once with `-e` for `dd-ai-gateway` only (omit `pi-client-session-id`); expect the `PI_CLIENT_SESSION_ID` resolution error.
- [x] Follow-up validation: the one-provider request succeeded, but LLM Obs resolved `ml-app-id: ai-devx.pi` to `unregistered`. On 2026-10-05, Matteo approved retaining this id and proceeding; record the span result without treating it as a migration blocker.
- [x] Rerun the five provider probes with `ml-app-id: ai-devx.pi`; all five requests exited 0 and returned `ok`. See the follow-up five-provider evidence below.
- [x] Query `dd.llm_observability` for the five-provider session after ingestion. All five spans had `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, the expected email, and the probe session id. Matteo accepted keeping the header and moving forward.
- [x] Record the commands and results under `## Execution evidence` in this plan. Commit with the completed migration after final owner validation.

### Slice 2: Cutover from refresh-models to dd-ai-gateway
Delivers: refresh-models is uninstalled, Pi uses the builtin providers through stock `dd-ai-gateway`, and `/session-cost` works.

### Task 4: Remove ai-gw providers and swap the package
**Status:** Cutover applied and verified; `npm run test:all` passes.
**Delivers:** `models.json` contains only the overlay entries in the work branch; `.packages` lists `dd-ai-gateway`.
**Blocked by:** Task 3
**Traces to:** Requirement "refresh-models is retired"
**Files:** `dot_pi/agent/models.json.tmpl`, `dot_pi/agent/modify_private_settings.json.tmpl`, `dot_pi/agent/exact_extensions/pi-client-session-id/index.test.ts`

- [x] Add and pass the "overlay entries are headers-only after cutover" test in `index.test.ts`.
- [x] Remove `baseUrl` and `apiKey` from the `typesafe` entry (stock `dd-ai-gateway` registers both).
- [x] Delete the six `ai-gw-*` entries from the work branch; keep the personal branch unchanged.
- [x] In the work `.packages` list, replace `refresh-models` with `dd-ai-gateway`.
- [x] Add `enabledModels` to the Pi-owned fields comment at the top of `modify_private_settings.json.tmpl`.
- [x] Run `npm test` and `npm run test:all` in `dot_pi/agent`; both pass, including the cutover test and smoke test.
- [x] Apply both targets with `chezmoi --source <worktree> apply`; a fresh `pi --list-models` process sees the stock catalog.
- [x] Run `pi --list-models ai-gw`; it returned no models. `pi --list-models GLM-5.3` lists stock `baseten` models including `baseten/zai-org/GLM-5.3`.
- [x] Commit cutover as `e1177d0` (`feat(pi): migrate to stock dd-ai-gateway`) after owner validation.

### Task 5: Reselect default and scoped models
**Status:** Runtime settings and model refs verified; lifecycle-recommender unit tests pass.
**Delivers:** Pi starts on `baseten/baseten/zai-org/GLM-5.3` and cycles the new refs.
**Blocked by:** Task 4
**Traces to:** Requirement "refresh-models is retired"
**Files:** `~/.pi/agent/settings.json` (Pi-owned fields, no repository change)

- [x] Record the old values for rollback: `defaultProvider: ai-gw-logical`, `defaultModel: glm-5-3`, and the seven legacy `enabledModels` refs listed in the previous plan version.
- [x] Set the default to `baseten/baseten/zai-org/GLM-5.3` and `enabledModels` to `baseten/baseten/zai-org/GLM-5.3`, `openai/openai/gpt-6-sol`, `anthropic/claude-opus-5-5`, `openai/openai/gpt-6-luna`, `baseten/baseten/zai-org/GLM-5.3-Flash`, `baseten/baseten/deepseek-ai/DeepSeek-V4.1-Flash`, and `google/gemini-3.8-flash`. Since this session has no usable interactive TUI, a targeted `jq` update changed only the Pi-owned settings keys.
- [x] Run `jq '{defaultProvider, defaultModel, enabledModels}' ~/.pi/agent/settings.json`; it returns the new values.
- [x] Search the catalog for each selected model; all seven refs are present under the expected stock providers.
- [x] Verify all selected refs are present in the stock catalog and run the lifecycle-model-recommender unit tests. Interactive slash-command smoke tests were not run in this headless session.

### Task 6: Live verification and documentation
**Delivers:** Post-cutover evidence and updated guidance with no stale refresh-models workflow.
**Blocked by:** Task 5
**Traces to:** Requirement "Requests through stock dd-ai-gateway succeed with attribution"; Requirement "refresh-models is retired"; explicit instruction to update dotfiles and docs
**Files:** obsolete model-sync prompt (removed), `dot_pi/agent/exact_skills/chezmoi/SKILL.md`, `AGENTS.md`, this plan

- [x] Owner validation: Matteo ran `/session-cost` in session `01a10dde-a437-71e5-b221-3c109319c706`. The UI first reported pending ingestion, then displayed `$0.00`; DDSQL found two priced spans totaling `$0.00211526`, which rounds to `$0.00` at the formatter's two-decimal precision. The spans had `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, and the expected email.
- [x] Delete the obsolete model-sync prompt and replace the stale Pi models guidance with instructions to keep stock catalogs out of the overlay template.
- [x] Add the `PI_CLIENT_SESSION_ID` coupling trap to `AGENTS.md`.
- [x] Run `rg -n "refresh-models|ai-gw-" -g '!plans/**' -g '!**/*.test.ts' .`; it returns no matches.
- [x] Run `npm test` and `npm run test:all` in `dot_pi/agent`; both pass. Remove `dot_pi/agent/node_modules` after the tests.
- [x] Apply the changed documentation targets with `chezmoi --source <worktree> apply`; the skill diff is empty and the obsolete prompt target is absent.
- [x] Record final implementation and test evidence under `## Execution evidence`.
- [x] Commit documentation as `b47983d` and push the migration branch after owner validation.

## Execution evidence
### Slice 1 / Task 3
- Updated `~/go/src/github.com/DataDog/datadog-pi-packages` with `git pull --ff-only`; `main` fast-forwarded from `d436611` to `27ced6a`.
- Applied `models.json` and `pi-client-session-id/index.ts` through the worktree's chezmoi source. The combined apply failed because the target extension directory was absent; applying `models.json` and then `~/.pi/agent/extensions/pi-client-session-id` separately succeeded. The explicit-target `chezmoi diff` was empty afterward.
- Ran stock `dd-ai-gateway` probes for `anthropic/claude-opus-5-5`, `openai/openai/gpt-6-luna`, `google/gemini-3.8-flash`, `baseten/baseten/zai-org/GLM-5.3-Flash`, and `baseten/baseten/zai-org/GLM-5.3`, using session id `1bd7383d-7516-4bf1-bcb7-b68d3845357c`. All five commands exited 0 and returned `ok`.
- `/tmp/dd-ai-gateway-probe.log` contains the five configured attribution headers with the expected values for every provider. The Claude probe logged all four planned compatibility flags as `false` and `anthropic-beta: context-1m-2025-08-07`. The session-id header contained the probe UUID, confirming `session_start` ran before the first request in print mode.
- Ran the failure-path probe without `pi-client-session-id`; it exited 1 with `Failed to resolve provider "openai" header "x-dd-tag-client_session_id" from environment variable: PI_CLIENT_SESSION_ID`, as expected.
- Queried `dd.llm_observability` after the 10-minute ingestion window with `columns => ARRAY['@meta.model_name','ml_app','ml_app_id','dd.team','dd.user_email','client_session_id']` and filter `service:ai_gateway client_session_id:1bd7383d-7516-4bf1-bcb7-b68d3845357c`. It returned one row for each of the five model names, with `ml_app=pi`, `dd.team=compute`, `dd.user_email=matteo.ruina@datadoghq.com`, and the expected `client_session_id`. However, `ml_app_id` was `unknown` for all five rows, although the outgoing-header log showed `x-dd-tag-ml_app_id: aidevx.pi`.
- After the user-approved correction, ran one `openai/openai/gpt-6-luna` probe with session id `e54e6b8a-4df0-4395-a8f1-d64968d587f3`. It exited 0 and returned `ok`; the allowlisted probe log showed `ml-app-id: ai-devx.pi` and no `x-dd-tag-ml_app_id`.
- Queried `dd.llm_observability` for that session after 10 minutes. It returned one `gpt-6-luna` span with `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, `dd.user_email=matteo.ruina@datadoghq.com`, and the expected `client_session_id`. On 2026-10-05, Matteo accepted retaining the tag and proceeding despite the unresolved registry result.
- Reran all five provider probes with session id `23f3bb3e-41ba-4879-a740-4fb541ae467f`. All requests exited 0 and returned `ok`. The allowlisted log shows `ml-app-id: ai-devx.pi`, the four custom attribution headers, and the session id for all providers; the Anthropic request also shows the expected beta header and four compat flags set to `false`.
- Queried `dd.llm_observability` for `service:ai_gateway client_session_id:23f3bb3e-41ba-4879-a740-4fb541ae467f`. It returned one span for each of the five model names. Every span had `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, `dd.user_email=matteo.ruina@datadoghq.com`, and the expected session id. Matteo accepted proceeding with the candidate id despite this runtime resolution.
- Follow-up code research against `dd-source` main at `8197d8b7def1b` explains the mismatch: Gateway reads the separate `ml-app-id` header, resolves it through the governed app allowlist, and writes the result to server-side request state. The provider then merges `x-dd-tag-*` values and deliberately overwrites `ml_app_id` from that state; the tests assert callers cannot spoof it with `x-dd-tag-ml_app_id`. With no `ml-app-id` header, the server writes `unknown`. The checked-in seed snapshot contains `ai-devx.pi`, not `aidevx.pi`; production allowlist state was not queried.
- On 2026-10-05, Matteo approved retaining `ml-app-id: ai-devx.pi` and proceeding despite the `unregistered` result. The five-provider rerun succeeded and the cutover proceeded; see Slice 2 evidence below.

### Slice 2 / Tasks 4–5
- Removed the six `ai-gw-*` provider definitions from the work-profile `models.json.tmpl`, removed `baseUrl` and `apiKey` from the `typesafe` overlay, and changed the work package list from `refresh-models` to `dd-ai-gateway`. Applied the source to Pi's configuration; `chezmoi diff` for the explicit `models.json` and `settings.json` targets was empty.
- `pi --list-models ai-gw` returned no models. `pi --list-models GLM-5.3` returned stock `baseten` models, including `baseten/zai-org/GLM-5.3` and `baseten/zai-org/GLM-5.3-Flash`.
- Updated the Pi-owned settings in `~/.pi/agent/settings.json` to default to `baseten/baseten/zai-org/GLM-5.3` and enable the seven refs listed in Task 5. The old values were recorded before the change; catalog searches found each selected model.
- A fresh Pi process started without a model override selected `baseten/baseten/zai-org/GLM-5.3` and returned `ok`. Its span (`client_session_id=91ece1f6-5f5b-4a53-afac-6189c6f22235`) had `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, the expected email and session id, and a positive estimated cost of `$0.013419151`. The allowlisted probe log confirmed `ml-app-id: ai-devx.pi` and no `x-dd-tag-ml_app_id`.
- A post-cutover probe using stock `dd-ai-gateway`, the local session-id extension, and the `models.json` overlay returned `ok` for `baseten/baseten/zai-org/GLM-5.3`. Its span (`client_session_id=9d6d280f-7954-4aa3-9f0b-1288b4160f4a`) had `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, `dd.user_email=matteo.ruina@datadoghq.com`, and the expected session id.
- `npm run test:unit` passed 203/203 tests; LSP reported no diagnostics for the changed TypeScript test. After the documentation changes, `npm run test:all` passed: 203 unit tests, 53 prompt tests, skills/dependency validation, and the Pi smoke test. `dot_pi/agent/node_modules` was removed afterward.
- Removed the obsolete model-sync prompt, updated the chezmoi skill and `AGENTS.md`, and applied the changed skill target. The explicit chezmoi diffs for `models.json`, `settings.json`, and the skill are empty; the prompt target is absent. The `refresh-models|ai-gw-` sweep returned no matches outside plans and test fixtures.
- Matteo ran `/session-cost` for session `01a10dde-a437-71e5-b221-3c109319c706`. Its two spans were priced, with a combined estimated cost of `$0.00211526`; the UI rounds this to `$0.00`. The span tags were `ml_app=pi`, `ml_app_id=unregistered`, `dd.team=compute`, the expected email, and the session id. The initial pending message was an ingestion delay.

- Pushed branch `maruina/dd-ai-gateway-migration` to `origin` with the cutover and documentation commits.

## Learning candidates
- 2026-10-05: Gateway intentionally ignores caller-supplied `x-dd-tag-ml_app_id` for the governed `ml_app_id` span tag; it resolves the distinct `ml-app-id` header against an allowlist and overwrites the custom tag. Evidence: `domains/ai_platform/apps/apis/ai_gateway/internal/providers/http_providers/base.py:3213-3268` and `internal/tests/test_http_base_provider.py:1292-1305` in `dd-source` main; the Task 3 DDSQL query returned `unknown` despite the client log showing the x-dd header.
- 2026-10-05: A local allowlist seed entry does not prove the id is registered in the live Gateway environment; the focused probe sent `ml-app-id: ai-devx.pi`, but its span carried `ml_app_id=unregistered`. Evidence: Task 3 follow-up probe with session id `e54e6b8a-4df0-4395-a8f1-d64968d587f3`.

## Final verification
Implementation verification is complete. The user session used the stock `openai` provider, not an `ai-gw-*` provider. Its two priced spans total `$0.00211526`; the `/session-cost` display rounds this sub-cent amount to `$0.00`. A separate fresh Pi process without a model override selected the configured default, `baseten/baseten/zai-org/GLM-5.3`, and its span carried the expected custom tags. Production still resolves `ml_app_id` as `unregistered`, as approved.
- `pi --list-models ai-gw` lists nothing, `npm run test:all` passes, and the `rg` sweep finds no stale references.

## Follow-ups (not plan scope)
- Optional FYI to the `dd-ai-gateway` owner about the session-id header so other users' `/session-cost` works.
- Upstream the Claude compat override if Gateway fallback issues appear for other users.
- Move the package path from `~/go/src/github.com/DataDog/datadog-pi-packages` to `~/dd/datadog-pi-packages` (two clones exist today).
