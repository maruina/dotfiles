# /ship Conductor Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/ship <plan.md>` extension that runs `execute` then `verify` as separate `pi` subprocesses under distinct models, surfacing the final `VERIFIED`/`BLOCKED` verdict while preserving every hard gate.
**Out of Scope:** the `simplify` stage, auto-repair on `BLOCKED`, interactive model selection, smarter-than-first-available pool selection, per-stage timeouts, overriding any hard gate, changing the `/execute` or `/verify` prompts, and a new model-config source of truth.
**Architecture:** A directory extension `dot_pi/agent/exact_extensions/ship-conductor/` registers `/ship`. It resolves the plan to its owning worktree, expands the rendered `execute.md`/`verify.md` prompt templates, and spawns one `pi --mode json -p --no-session` subprocess per stage with `cwd` set to the worktree root. Pure helper modules hold all parsing and selection logic; a thin orchestrator wires them to `child_process.spawn` and `ctx.ui`.
**Tech Stack:** TypeScript on Node.js 25 (`--experimental-strip-types`), `node:test`, Pi 0.80.6 extension API, `node:child_process`, chezmoi `exact_extensions`.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` mandates loading before implementation recommendations | Selected the four skills below from the affected files (TS extension, chezmoi source, new command, plan prose). |
| `codebase-research` | `skill-loader` | Planning in an unfamiliar area (pi extension internals) where correctness depends on existing patterns | Ran staged discovery against the pi package and this repository; verified every design claim and found four corrections (D4-D7 in Key Decisions). |
| `chezmoi` | `skill-loader` | Files under the chezmoi source tree are created and modified | Applied `exact_extensions` entrypoint contract (directory with `index.ts` default export), the diff → apply → commit → push completion workflow, and the `dot_pi/agent` npm validation commands. |
| `cli-best-practices` | `skill-loader` | New `/ship` command with arguments, output, and errors | Single explicit required argument with a usage error, structured hard-stop messages naming stage and reason, no mid-run interactivity. |
| `write` | `skill-loader` | Drafting this plan | Clarity, concision, US English. |

### Advisory learning lookup
`Datadog/Learnings.md` (9 H2 sections, read via `obsidian-cli read` piped to `learn-evidence.mjs learning-sections`) returned **0 matching sections** for `pi extension`, `subprocess`, `child_process`, `node test runner`, `prompt template`, `model pool`, `JSON event stream`. Obsidian was available; the store had no relevant content. No advisory guidance applies to this plan.

## Goal and Scope
Implement the behavior approved in `plans/pi-ship-conductor/design.md` and the confirmed planning alignment brief:

- `/ship <plan.md>` resolves the plan to its owning worktree and refuses `main`/`master`, missing, or uncommitted plans before spawning anything.
- Each stage runs in a fresh `pi --mode json -p --no-session` subprocess under a distinct model with `--thinking max`.
- The conductor expands the rendered prompt templates deterministically and passes the expanded text as the subprocess task.
- The conductor proceeds to verify only when execute reaches its `Implementation model` handoff marker with a consistent model id, and passes that id as `--implemented-by`.
- The conductor surfaces exactly one terminal state: the verify verdict, or a hard stop naming the failing stage and reason.
- The conductor never edits, commits, pushes, opens PRs, switches branches, retries, or repairs.

## Feasibility Gate
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Spawn stage subprocesses | `node:child_process.spawn` of the `pi` binary via a `getPiInvocation` copy; line-buffered JSON parsing of `message_end` events | `examples/extensions/subagent/index.ts` lines 249-265 (`getPiInvocation`), 300-307 (args), 345-380 (spawn + parse) | `_spawn.test.ts` covers invocation resolution and event parsing; manual end-to-end run | Not applicable — mechanism is present and proven in the same pi version |
| Deterministic prompt delivery | Read rendered `~/.pi/agent/prompts/{execute,verify}.md`, strip YAML frontmatter, substitute only `$ARGUMENTS` | Rendered files confirmed present; source frontmatter confirmed in `dot_pi/agent/exact_prompts/execute.md` and `verify.md`; both contain exactly one `$ARGUMENTS` | `_prompts.test.ts` fixtures: frontmatter stripped, `$ARGUMENTS` replaced, `$GLOB` untouched | Hard stop before spawning when a prompt file is unreadable |
| Execute completion marker | Last line in the final assistant message matching `` ^Implementation model: `(.+) \(([^()`]+)\)`$ `` | `dot_pi/agent/exact_prompts/execute.md:180` emits the marker; model names contain parentheses (e.g. `GLM-5.3 (Baseten)`), so the greedy-name/last-group form is required | `_markers.test.ts`: positive with parenthesized name, absent, malformed, id-mismatch | Hard stop by design (marker absent or inconsistent) |
| Verify terminal verdict | Last line of the final assistant message matching `^(VERIFIED\|BLOCKED)$` after trimming | `dot_pi/agent/exact_prompts/verify.md:74-75` mandates exactly one top-level verdict ending a 7-section report | `_markers.test.ts`: `VERIFIED`, `BLOCKED`, absent, lowercase, mid-message false positive | Hard stop by design (verdict absent) |
| Model pools resolve and are authenticated | `ctx.modelRegistry.find(provider, modelId)` plus `ctx.modelRegistry.getProviderAuthStatus(provider).configured` | `dist/core/model-registry.d.ts`: `find(provider, modelId)` (two arguments), `getProviderAuthStatus` returning `{ configured: boolean, ... }`; all five unique catalog ids confirmed in `dot_pi/agent/models.json.tmpl` under `ai-gw-baseten`, `ai-gw-databricks`, `ai-gw-google` | `_pools.test.ts` with an injected registry; pre-flight in the manual run | Fail fast naming the unavailable model/provider; never spawn with an unauthenticated pooled model |
| Verifier differs from implementer | Pool construction: verifier = first verify-pool entry available and not equal to the implementer; verify's own `--implemented-by` check is the backstop | `verify.md:50-51` BLOCKs when the two ids match | `_pools.test.ts`: exclusion, pool exhaustion | Hard stop before spawning when no distinct verifier is available |
| Working directory per stage | `spawn` `cwd` option (pi has no `--cwd` flag) | `pi --help` lists no `--cwd`; subagent uses the spawn option | Manual run observes stage operating in the target worktree | Not applicable |
| Abort propagation | Conductor-owned `AbortController` + `SIGINT` handler killing the active child; `ctx.signal` used only when defined | `dist/core/extensions/types.d.ts`: `signal: AbortSignal \| undefined`, undefined when the agent is not streaming (command handlers run idle) | `_conductor.test.ts` abort path kills the injected child and yields a cancelled outcome | Not applicable |

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Model pools | `dot_pi/agent/exact_extensions/ship-conductor/_pools.ts`, `_pools.test.ts` | Declare impl/verify pools as `{ provider, id }` data; first-available implementer; first distinct verifier; availability via injected registry | `node --experimental-strip-types --test "exact_extensions/ship-conductor/*.test.ts"` from `dot_pi/agent` |
| Prompt expansion | `_prompts.ts`, `_prompts.test.ts` | Strip frontmatter; substitute only `$ARGUMENTS`; build per-stage arguments (plan path; plan path + `--implemented-by <id>`) | Same focused test command |
| Completion markers | `_markers.ts`, `_markers.test.ts` | Parse execute `Implementation model` marker (last matching line, greedy name, paren-free id) and verify verdict (last trimmed `VERIFIED`/`BLOCKED` line) | Same focused test command |
| Worktree resolution | `_worktree.ts`, `_worktree.test.ts` | Resolve plan path (cwd-relative, absolute, worktree-relative) via `git worktree list --porcelain`; refuse `main`/`master`, missing, uncommitted, or ambiguous targets | Same focused test command with an injected git runner |
| Subprocess plumbing | `_spawn.ts`, `_spawn.test.ts` | `getPiInvocation` copy; stage argv builder (`--mode json -p --no-session --model <id> --thinking max <prompt>`); `message_end` accumulator capturing final assistant text, `stopReason`, `errorMessage`, exit code | Same focused test command |
| Orchestrator | `_conductor.ts`, `_conductor.test.ts` | Pre-flight → execute → verify state machine with injected spawner/registry/ui; every hard stop; abort path | Same focused test command |
| Command entrypoint | `index.ts` | `pi.registerCommand("ship", …)`; build real dependencies; guard `ctx.hasUI`; wire `SIGINT` to the abort controller | `npm run test:smoke` (extension loads); manual `/ship` run |
| Test registration | `dot_pi/agent/package.json` | Add `"$ext"/ship-conductor/*.test.ts` to `test:unit` | `npm run test:unit` after `npm ci --ignore-scripts` |
| Agent guidance | `dot_pi/agent/AGENTS.md` | Record the prompt-marker coupling trap | Diff inspection |

**Key Decisions**
- **D1 — First-available selection.** The implementer is the first impl-pool entry that resolves and is authenticated; the verifier is the first verify-pool entry that resolves, is authenticated, and differs from the implementer. Annotate with `deliberate:` naming round-robin/cost-aware selection as the upgrade path.
- **D2 — No per-stage timeout.** Stages rely on their own behavior plus user interrupt. Annotate `deliberate:`; a configurable timeout is a follow-up.
- **D3 — Uniform `--thinking max`.** pi clamps per model (`clampThinkingLevel`); `gemini-3.8-flash` clamps to `high`. The `--thinking` flag accepts `max` per `pi --help`.
- **D4 — Corrected execute-marker regex.** The design's lazy `(.+?) \((.+?)\)` misparses names containing parentheses (yields id `Baseten) (baseten/zai-org/GLM-5.3`). Use `` ^Implementation model: `(.+) \(([^()`]+)\)`$ `` on the last matching line; the parsed id must equal the catalog id passed to `--model`.
- **D5 — Conductor-owned abort.** `ctx.signal` is `undefined` when the agent is idle, so the command handler cannot rely on it. The conductor owns an `AbortController` wired to `SIGINT`; it kills the active child and stops.
- **D6 — Spawn `cwd`, not a flag.** pi has no `--cwd` flag; each subprocess gets `cwd: <worktree-root>` via spawn options, matching the subagent example.
- **D7 — Frontmatter stripped, only `$ARGUMENTS` substituted.** `$GLOB` and other literals in prompt bodies pass through untouched.
- **D8 — Helpers avoid runtime package imports.** Type-only imports from `@earendil-works/pi-coding-agent` are stripped; helper modules import only `node:*` and relative `.ts` files so focused tests run without `node_modules`.
- **Pools are declared data** (provider + catalog id): impl = `ai-gw-baseten/baseten/zai-org/GLM-5.3`, `ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash`, `ai-gw-baseten/baseten/deepseek-ai/DeepSeek-V4-Flash-0731`, `ai-gw-databricks/databricks/system.ai.kimi-k3`; verify = `ai-gw-baseten/baseten/zai-org/GLM-5.3-Flash`, `ai-gw-baseten/baseten/deepseek-ai/DeepSeek-V4-Flash-0731`, `ai-gw-google/gemini-3.8-flash`. The subprocess `--model` receives the bare catalog id (unique in the catalog); distinctness is enforced on catalog id. Annotate the `getPiInvocation` copy with `deliberate:` (revisit if pi exports it).

**Implementation Constraints**
- Do not modify `execute.md` or `verify.md`; the conductor consumes their existing contracts.
- Follow the `lifecycle-model-recommender` directory layout: `index.ts` default-export factory, `_`-prefixed helpers, colocated `*.test.ts`.
- Repository rule (`AGENTS.md`): before verification of `dot_pi/agent` changes run `npm ci --ignore-scripts` in `dot_pi/agent`, keep dependencies until `npm test` and `npm run test:all` complete, then remove `node_modules`.
- The conductor never calls `pi.setModel`, never edits repository state, and never retries a stage.
- Stop conditions: a pooled model missing from the registry, ambiguous worktree matches, or a marker/verdict contract that no longer parses — hard stop, do not loosen parsers to make a run pass.

**Security Requirements**
- Subprocesses inherit the user's environment and existing gateway auth; the conductor handles no credentials and prints none. `--implemented-by` carries only a catalog model id.
- Stage output surfaced via `setEditorText` may contain repository content; that is the user's own session and matches interactive `/execute` behavior. No new network calls originate from the conductor itself.

**Observability Requirements**
- Dev tool, not paged: `ctx.ui.notify` announces each stage spawn (stage, model id, worktree), the parsed marker/verdict, and every hard stop with stage and reason; the failing stage's final assistant message goes to `setEditorText`. No metrics, traces, or runbooks apply.

**Failure Modes to Handle**
| Failure | Expected behavior | Verification |
|---|---|---|
| Target on `main`/`master`, plan missing/uncommitted, ambiguous match | Hard stop before any spawn; notify names the reason | `_conductor.test.ts` + `_worktree.test.ts` |
| Pool exhausted or no distinct verifier | Hard stop before any spawn | `_pools.test.ts`, `_conductor.test.ts` |
| Prompt file unreadable | Hard stop naming the path | `_conductor.test.ts` |
| Execute marker absent or id-inconsistent | Hard stop; verify is never spawned | `_markers.test.ts`, `_conductor.test.ts` |
| Verify verdict absent | Hard stop with verify's final message | `_markers.test.ts`, `_conductor.test.ts` |
| Verdict `BLOCKED` | Surface verdict + verify's final message; no auto-repair, no retry | `_conductor.test.ts` |
| Stage exit non-zero, `stopReason` `error`/`aborted` | Hard stop with stderr tail and final message | `_spawn.test.ts`, `_conductor.test.ts` |
| User interrupt | Active child killed; conductor reports cancellation; no orphan processes | `_conductor.test.ts` abort path |

**Rollout and Rollback**
- Rollout: add the extension directory and the `test:unit` entry; `chezmoi apply` the new targets; `/reload` in the interactive session. Smallest safe step is the whole extension — it is inert until `/ship` is invoked. Owner: Matteo.
- Rollback: delete `dot_pi/agent/exact_extensions/ship-conductor/`, revert the `package.json` line, `chezmoi apply`, `/reload`. No state to clean up (subprocesses run `--no-session`).

**Test Strategy**
- All parsing, selection, resolution, and orchestration logic is unit-tested through injected system boundaries: git runner, process spawner, prompt-file reader, model-registry subset (`find`, `getProviderAuthStatus`), and ui sinks. Internal collaborators are not mocked.
- Narrow command expected to fail before implementation: `cd dot_pi/agent && node --experimental-strip-types --test "exact_extensions/ship-conductor/*.test.ts"` (no matching files).
- Full gates after `npm ci --ignore-scripts`: `npm test` then `npm run test:all` from `dot_pi/agent`.
- End-to-end validation is manual (Task 4): spawning real models in CI is impractical and gateway credentials are user-scoped.

## Acceptance Requirements
### Requirement R1: Safe target resolution and pre-flight
The system SHALL resolve the `/ship` argument to an owning worktree and refuse unsafe or ambiguous targets before spawning any stage.

#### Scenario: Plan relative to the current worktree resolves
- GIVEN a committed `plans/<feature>/plan.md` in a feature worktree
- WHEN `/ship` receives the relative path
- THEN the conductor resolves the owning worktree root and uses it as every stage's spawn `cwd`

#### Scenario: Default-branch target refused
- GIVEN a plan path that resolves to a worktree whose branch is `main`
- WHEN `/ship` runs
- THEN it stops before spawning, naming the refusal reason, and no subprocess starts

#### Scenario: Missing or uncommitted plan refused
- GIVEN a plan path that does not exist or has uncommitted changes
- WHEN `/ship` runs
- THEN it stops before spawning, naming the refusal reason

#### Scenario: Ambiguous worktree match refused
- GIVEN a plan path matching more than one worktree
- WHEN `/ship` runs
- THEN it stops and lists the candidate worktrees without spawning

### Requirement R2: Deterministic prompt delivery
The system SHALL build each stage prompt from the rendered template with frontmatter stripped and exactly `$ARGUMENTS` substituted.

#### Scenario: Execute prompt expansion
- GIVEN the rendered `~/.pi/agent/prompts/execute.md`
- WHEN the conductor builds the execute task
- THEN the result contains no frontmatter, substitutes the absolute plan path for `$ARGUMENTS`, and leaves `$GLOB` literals untouched

#### Scenario: Verify prompt expansion carries the implementer id
- GIVEN execute completed under catalog id `<impl-id>`
- WHEN the conductor builds the verify task
- THEN `$ARGUMENTS` is `<absolute-plan-path> --implemented-by <impl-id>`

#### Scenario: Unreadable prompt file
- GIVEN a missing rendered prompt file
- WHEN the conductor pre-flights
- THEN it stops before spawning, naming the missing path

### Requirement R3: Distinct-model stage execution
The system SHALL run execute under the first available impl-pool model and verify under the first available verify-pool model distinct from the implementer, both with `--thinking max`.

#### Scenario: Distinct pair selected
- GIVEN all pooled models resolve and are authenticated
- WHEN `/ship` starts
- THEN execute spawns with the first impl-pool catalog id and verify spawns with the first verify-pool id different from it

#### Scenario: No distinct verifier
- GIVEN only one catalog id is available across both pools
- WHEN `/ship` pre-flights
- THEN it stops before spawning, reporting that no distinct verifier is available

#### Scenario: Unavailable pooled model skipped, exhausted pool refused
- GIVEN the first impl-pool entry is absent from the registry or unauthenticated
- WHEN `/ship` pre-flights
- THEN it tries the next entry; when the pool is exhausted it stops, naming the unavailable providers

### Requirement R4: Execute completion gating
The system SHALL spawn verify only when execute's final assistant message contains an `Implementation model` marker whose id equals the catalog id passed to `--model`.

#### Scenario: Consistent marker proceeds with parenthesized name parsed
- GIVEN execute's final message contains `` Implementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)` `` followed by the numbered handoff steps
- WHEN the conductor parses it
- THEN it extracts id `baseten/zai-org/GLM-5.3`, matches it against the spawned `--model` id, and spawns verify with `--implemented-by baseten/zai-org/GLM-5.3`

#### Scenario: Absent marker hard-stops
- GIVEN execute's final message contains no marker
- WHEN the stage ends
- THEN the conductor stops with execute's final message and never spawns verify

#### Scenario: Id mismatch hard-stops
- GIVEN a marker whose id differs from the spawned `--model` id
- WHEN the conductor parses it
- THEN it stops, reporting the inconsistency

### Requirement R5: Terminal verdict surfacing
The system SHALL report exactly the verify stage's terminal verdict and SHALL NOT continue past any hard stop.

#### Scenario: VERIFIED
- GIVEN verify's final message ends with a lone `VERIFIED` line after the seven report sections
- WHEN the conductor parses it
- THEN it notifies `VERIFIED` with the verifier model id

#### Scenario: BLOCKED surfaces without repair
- GIVEN verify's final message ends with a lone `BLOCKED` line
- WHEN the conductor parses it
- THEN it notifies `BLOCKED`, places verify's final message in the editor, and takes no further action

#### Scenario: Verdict absent or malformed
- GIVEN verify's final message has no trimmed `VERIFIED`/`BLOCKED` line (lowercase or embedded verdicts do not count)
- WHEN the conductor parses it
- THEN it hard-stops with verify's final message

### Requirement R6: Failure and abort handling
The system SHALL stop and surface stage failures, SHALL kill the active child on user interrupt, and SHALL NOT retry, edit, commit, or repair.

#### Scenario: Stage failure stops the pipeline
- GIVEN a stage subprocess exits non-zero or ends with `stopReason` `error`/`aborted`
- WHEN the conductor observes it
- THEN it hard-stops with the stderr tail and the stage's final message; the remaining stage never starts

#### Scenario: Interrupt kills the active child
- GIVEN a stage is running
- WHEN the user interrupts
- THEN the active child receives a kill signal, the conductor reports cancellation, and no stage process survives

## Implementation Tasks
### Task 1: Add conductor helper modules with unit tests
**Delivers:** pools, prompt expansion, marker parsing, worktree resolution, and subprocess plumbing as pure modules, all unit-tested and enumerated in `test:unit`.
**Blocked by:** None
**Traces to:** R1 (resolution logic), R2, R3 (selection logic), R4, R5 (parsers), R6 (spawn result classification)
**Files:**
- `dot_pi/agent/exact_extensions/ship-conductor/_pools.ts` and `_pools.test.ts`
- `dot_pi/agent/exact_extensions/ship-conductor/_prompts.ts` and `_prompts.test.ts`
- `dot_pi/agent/exact_extensions/ship-conductor/_markers.ts` and `_markers.test.ts`
- `dot_pi/agent/exact_extensions/ship-conductor/_worktree.ts` and `_worktree.test.ts`
- `dot_pi/agent/exact_extensions/ship-conductor/_spawn.ts` and `_spawn.test.ts`
- `dot_pi/agent/package.json` (`test:unit` enumeration)

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts` (required once for full gate runs; keep `node_modules` until Task 3 cleanup).
- [ ] Run `node --experimental-strip-types --test "exact_extensions/ship-conductor/*.test.ts"` from `dot_pi/agent`; expect failure (no matching test files).
- [ ] Implement the five helper modules per the Implementation Contract, including the D1/D2/D8 `deliberate:` comments, and their tests covering every Failure Modes row owned by helpers.
- [ ] Add `"$ext"/ship-conductor/*.test.ts` to `test:unit` in `dot_pi/agent/package.json`.
- [ ] Run `node --experimental-strip-types --test "exact_extensions/ship-conductor/*.test.ts"` from `dot_pi/agent`; expect all tests passing.
- [ ] Run `npm run test:unit` from `dot_pi/agent`; expect green with the new files enumerated.
- [ ] Refactor only after green, then rerun both commands.
- [ ] Commit with `feat(pi): add /ship conductor helper modules`.

### Task 2: Add the `/ship` command orchestrator
**Delivers:** a working `/ship <plan.md>` command running pre-flight → execute → verify with every hard stop and the abort path.
**Blocked by:** 1
**Traces to:** R1, R2, R3, R4, R5, R6 (wiring)
**Files:**
- `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts` and `_conductor.test.ts`
- `dot_pi/agent/exact_extensions/ship-conductor/index.ts`

- [ ] Write `_conductor.test.ts` first: refusal paths (R1 scenarios), prompt-file failure, marker gating (verify never spawned on absent/inconsistent marker), verdict surfacing (`VERIFIED`, `BLOCKED`, absent), stage-failure stop, abort kills the injected child. Use injected spawner, registry, prompt reader, and ui sinks.
- [ ] Run the focused test command; expect failures (module missing).
- [ ] Implement `_conductor.ts` (state machine over injected dependencies) and `index.ts` (`pi.registerCommand("ship", …)` building real dependencies, `ctx.hasUI` guards, `SIGINT` wiring, usage error when the argument is missing).
- [ ] Run `node --experimental-strip-types --test "exact_extensions/ship-conductor/*.test.ts"` from `dot_pi/agent`; expect all tests passing.
- [ ] Run `npm run test:unit` from `dot_pi/agent`; expect green.
- [ ] Refactor only after green, then rerun both commands.
- [ ] Commit with `feat(pi): add /ship conductor command`.

### Task 3: Complete documentation review and full gate validation
**Delivers:** the marker-coupling trap recorded for future agents, full npm gates green, and dependencies cleaned up.
**Blocked by:** 2
**Traces to:** R1-R6 (gate evidence); documentation requirement
**Files:**
- `dot_pi/agent/AGENTS.md` (one durable trap line, if absent)

- [ ] Inspect `dot_pi/agent/AGENTS.md` and the repository-root `AGENTS.md`; add or record why not. Expected addition under Pi Agent Development: `exact_prompts/execute.md` and `verify.md` terminal markers are parsed by `exact_extensions/ship-conductor/`; update its fixtures when changing those contracts. No READMEs, runbooks, or generated references exist for extensions — record that.
- [ ] Run `npm test` from `dot_pi/agent`; expect green.
- [ ] Run `npm run test:all` from `dot_pi/agent`; expect green including smoke.
- [ ] Remove `dot_pi/agent/node_modules` per repository rule.
- [ ] Run `chezmoi diff ~/.pi/agent/extensions ~/.pi/agent/package.json` from the worktree; confirm the preview shows only the new extension directory and the `test:unit` change.
- [ ] Commit any `AGENTS.md` change with `docs: note ship conductor prompt-marker coupling`.

### Task 4: Apply and run manual end-to-end validation
**Delivers:** the rendered extension applied, loading cleanly, and `/ship` observed end-to-end against a disposable plan.
**Blocked by:** 3
**Traces to:** R1-R6 (end-to-end evidence)
**Files:** none (rendered targets only)

- [ ] Run `chezmoi apply ~/.pi/agent/extensions ~/.pi/agent/package.json`.
- [ ] Run `cd ~/.pi/agent && npm run test:smoke`; expect no `[Extension issues]`.
- [ ] Run `/reload` in the interactive session; confirm `/ship` appears.
- [ ] Negative pre-flight checks (spawn no models): `/ship` against a plan on `main` and against an uncommitted plan; expect the R1 refusals.
- [ ] Positive run: create a disposable worktree off `main` (branch `maruina/ship-smoke`) with a trivial committed `plans/ship-smoke/plan.md` (one small file change with an exact verification command); run `/ship <path>`; expect execute under the first impl-pool model, verify under a distinct model, and a terminal verdict. Redact credentials from any captured output.
- [ ] Delete the disposable worktree and branch.
- [ ] Record the validation outcome in this plan's Execution section; no source commit results from this task. Automation is impractical here because stages spawn real gateway models with user-scoped credentials.

## Requirement Traceability
| Requirement | Tasks | Primary validation |
|---|---|---|
| R1 Safe target resolution | 1, 2, 4 | `_worktree.test.ts`, `_conductor.test.ts`, manual negative checks |
| R2 Deterministic prompt delivery | 1, 2 | `_prompts.test.ts`, `_conductor.test.ts` |
| R3 Distinct-model execution | 1, 2, 4 | `_pools.test.ts`, manual positive run |
| R4 Execute completion gating | 1, 2, 4 | `_markers.test.ts`, `_conductor.test.ts`, manual positive run |
| R5 Terminal verdict surfacing | 1, 2, 4 | `_markers.test.ts`, `_conductor.test.ts`, manual positive run |
| R6 Failure and abort handling | 1, 2 | `_spawn.test.ts`, `_conductor.test.ts` |

## Execution Notes
- Run all npm gates from the worktree's `dot_pi/agent`; helper tests import only `node:*` and relative `.ts` files, so the focused command works even before `npm ci`.
- The plan ledger starts committed; update checkboxes and the `### Execution` skills subsection as work progresses.
- Open the draft PR per the `/execute` workflow after Task 4; stack-split signals are not expected (one subsystem, well under the line/file thresholds).
- If a pooled model is unavailable during the manual run, record which and continue with the next available pair; do not edit pools to force a pass.

## Documentation and Operational Impact
- `dot_pi/agent/AGENTS.md`: one durable trap line (Task 3); no other docs exist for extensions.
- No user-facing docs, runbooks, dashboards, or alerts: solo dev tool whose only surface is `/ship` output via `notify`/`setEditorText`.
- Rollout/rollback per the Implementation Contract; owner: Matteo.
