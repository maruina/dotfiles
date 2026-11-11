# Pi Lifecycle Coordinator Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/ship` with `/implement <plan-path>` to run each remaining plan slice, in order, through fresh execute, simplify, and independent verify sessions with user approvals in the coordinator.
**Smallest user-feedback slice:** Complete one real three-stage run, including an approval round-trip, committed or no-change simplification, and a fresh verification verdict.
**Out of Scope:** Automatic repair, lifecycle retries, skipping a blocked slice, `/systematic-review` or a final whole-feature simplify inside `/implement`, parallel stages, restart recovery, planless orchestration, saved presets, command aliases, a fourth model, an agent framework, and security-sandbox claims. Direct planless lifecycle commands remain supported.
**Architecture:** The extension owns model selection, RPC transport, approval routing, local records, and transition checks. Existing templates own lifecycle policy and are dispatched through native Pi expansion. Fresh children share the selected candidate worktree, not conversation history; the verifier receives pinned requirements and candidate references, not predecessor narratives.
**Tech Stack:** TypeScript, Node.js built-ins, existing Pi extension interfaces, Pi 1.5.0 RPC, Git, Markdown templates, node:test, and chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Planning workflow | Selected domain and workflow guidance |
| `resolve-worktree` | prompt-required | Explicit design path | Resolved and used the owning feature worktree |
| `feature-worktree` | prompt-required | Durable plan | Reused the feature branch and kept main unchanged |
| `codebase-research` | skill-loader | Cross-component replacement | Inspected coordinator, hooks, templates, tests, and installed interfaces |
| `chezmoi` | skill-loader | Managed source | Required source-only edits and explicit target application |
| `cli-best-practices` | skill-loader | Command and protocol | Required explicit inputs, structured outcomes, and bounded diagnostics |
| `learning-lookup` | prompt-required | Advisory lookup | Queried Pi, RPC, lifecycle, and provenance; no matching sections |
| `obsidian-cli` | agent-selected | Advisory source access | Read learning content without vault changes |
| `write` | skill-loader | Plan prose | Kept contracts, uncertainty, and stop conditions explicit |
| `diataxis` | skill-loader | Documentation | Separated usage/recovery guidance from protocol reference |

### Execution
Current task: Tasks 1-4 are complete. The user approved the slice loop amendment (design `### Slice loop`), which adds Task 5; the live acceptance task is now Task 6 and documentation is Task 7. Task 5 is complete. The Task 6 model-preflight blocker has a confirmed cause and fix (see the Task 6 blocker evidence); Task 6 needs a real TUI run by the user.

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Execution workflow | Selected execution-stage guidance before repository work |
| `resolve-worktree` | prompt-required | Explicit plan path | Resolved the plan and switched to its owning worktree |
| `feature-worktree` | prompt-required | Plan-based code changes | Confirmed the existing feature worktree is the correct target |
| `codebase-research` | skill-loader | Cross-component coordinator replacement | Mapped the coordinator, lifecycle templates, native/static tests, and Task 2 handoff contracts |
| `chezmoi` | skill-loader | Managed dotfiles source | Kept edits in the source tree and deferred target application |
| `cli-best-practices` | skill-loader | Command and protocol changes | Reviewed explicit input, structured outcome, and failure contracts |
| `write` | skill-loader | Plan and README prose | Applied concise, evidence-based wording guidance |
| `diataxis` | skill-loader | Extension usage and recovery docs | Checked the planned README split between usage/recovery guidance and protocol reference |
| `reviewable-pr-workflow` | agent-selected | Existing PR history and planned PR handoff | Checked review state, rebase safety, and the stack-split gate |
| `learning-candidates` | skill-loader | Execution surprise triage | Checked Task 1 path and fixture-signing surprises against the filter; none met its trigger |

Execution PR-history check: closed PR #69 has six CodeRabbit bot comments. Comments on default-branch and Git-status failures are covered by Task 3; process-close, escalation, and listener cleanup are covered by Task 4. The two marker-parser comments do not apply to the approved structured-RPC replacement. This corrects the planning note below that no PR feedback was identified; no scope change is needed.

Rebase note: the branch was first rebased onto `b346344`, resolving the expected `dot_pi/agent/package.json` and `AGENTS.md` conflicts, then onto `a00fb7c23d6ca0aa6ac10175082f8528c037c61d`. After the user directed using updated main, the plan was aligned to `fc796d77749b1876fdc1518b8a8a06918fef6a2c` and the feature branch was rebased onto that commit. A later rebase moved the branch onto `a8527549d27be90d02fa629c5ddbe9353d2d060e`, which is the verified merge base for Tasks 1-4. The rebase completed cleanly, preserved the Pi 1.5.0 / TypeScript 7.0.2 manifest and lockfile plus the native TypeScript 7 LSP changes, and did not move `main`.

Baseline review: changes from `b346344` through `fc796d7` affect the agent dependency manifest/lockfile and the TypeScript LSP extension. They do not change lifecycle templates or the coordinator implementation, so the approved behavior requirements remain applicable.

Pi runtime review: read the installed Pi 1.5.0 SDK, extension, CLI, RPC, JSON event, prompt-template, message-type, custom-provider, and RPC UI documentation, plus the provider, subagent, RPC client/UI, demo, and structured-output examples. `npm ci --ignore-scripts` succeeded; Pi dependencies remain installed for the required gates.

LSP resolution: after rebasing onto `fc796d7`, `lsp_context` succeeded for `shipConductor` in `dot_pi/agent/exact_extensions/ship-conductor/index.ts:15`. It returned the definition, one reference, and zero diagnostics. The previous TypeScript 7 language-server blocker is resolved; semantic navigation is available.

Task 1 verification: the focused `_protocol`, `_rpc`, and `_spawn` tests passed 28/28; the existing coordinator and prompt tests passed 17/17. The Pi 1.5.0 RPC tests used the in-memory provider and the new adapter, verified approval UI request/response, structured tool outcomes, settled-without-outcome handling, and native expansion/source provenance for all three templates. All changed TypeScript files had zero LSP diagnostics. The temporary Git fixture disables commit signing to avoid inherited host configuration.

Task 2 verification: `node --test exact_scripts/lifecycle-prompts.test.mjs` passed 52/52; `node --experimental-strip-types --test exact_extensions/ship-conductor/_prompts.test.ts exact_extensions/ship-conductor/_rpc.test.ts` passed 11/11. Real Pi 1.5.0 RPC tests expanded all three candidate templates across six plan/task inputs, preserving `--base`, both writer IDs, whitespace, single and double quotes, flag-looking task text, and literal `$ARGUMENTS`. LSP reported zero diagnostics for `_rpc.test.ts`; `git diff --check` passed and changed sources contain no unexpected control bytes. The initial handoff assertions failed for the missing dual-writer and conditional bridge contracts, then passed after the template changes. Native expansion lives in `_rpc.test.ts`, where the real Pi command parser is exercised; `lifecycle-prompts.test.mjs` checks prompt contracts. `_prompts.ts` and `_prompts.test.ts` remain unchanged because they serve the legacy `/ship` path scheduled for replacement in Task 3; the focused helper tests still pass. No independent `/verify`, target application, or live TUI acceptance has occurred.

Task 3 implementation verification: `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'` passed 85/85, `npm run test:unit` passed 304/304, `npm run test:prompts` passed 81/81, and `npm run test:pi-deps` passed. LSP diagnostics showed no issues in changed TypeScript files, and `git diff --check` passed. Pi 1.5.0 tests cover approval/outcome RPC events, invalid child configuration before prompt dispatch, ordinary marker-free RPC startup, and a no-op bridge in an ordinary extension context. The `test:unit` glob already includes `ship-conductor/*.test.ts`, so `package.json` needed no change. Root `AGENTS.md` now documents the structured bridge contract; `dot_pi/agent/AGENTS.md` had no matching stale guidance. This resumed worktree already contained the coordinator implementation, so no pre-change failing run was recorded for the new public-command and child-marker tests; they passed after addition. No live TUI acceptance or independent `/verify` has occurred. Task 3 is committed as `4831700` (`feat(pi): replace ship with single-round implement coordinator`).

Task 4 verification: the ship-conductor extension suite passed 104/104, `npm run test:unit` passed 323/323, `npm run test:prompts` passed 81/81, and `npm run test:pi-deps` passed. LSP diagnostics showed no issues in changed TypeScript files; `git diff --check` passed. Focused tests exposed a multibyte stderr byte-limit bug, stale parent waiting status after approval cancellation, and model-selection UI that did not stop on session shutdown. The fixes bound stderr by UTF-8 bytes, clear waiting status on cancellation, and race model dialogs against the coordinator abort signal. Tests also cover bounded progress, malformed and oversized records, backpressure, competing processes, tracked/untracked mutation, blocked/failed stages, duplicate outcomes, model drift, cancellation at stage boundaries, and retained ownership when termination is unconfirmed. Production behavior changed, so Task 4 uses `fix(pi): contain lifecycle failures and cancellation` instead of the planned test-only commit message. Task 4 is committed; its Conventional Commit is in Git history. No live TUI acceptance or independent `/verify` has occurred.

PR preparation constraint: the user directed that this worktree be rebased onto the latest `main` before raising a PR. Recheck branch, status, latest `main`, and upstream immediately before that rebase; do not move `main`. The most recent reference check found `main` and `origin/main` at `70fa273`, and no rebase for PR preparation has occurred.

## Approval and source ledger
- Source of truth: `plans/pi-ship-conductor/design.md`, approved design at `07716f7`.
- The user confirmed the planning alignment brief, single-slice boundary, proposed limits, and `/systematic-review` resolutions: initially rebase `maruina/pi-ship-conductor` onto `main` (`b346344`) at the start of execution (which drops `lifecycle-model-recommender`, already removed on `main` in `b3a3c35`, and brings in `pi-client-session-id` and current lifecycle skills/templates), and require `--implemented-by` with optional `--simplified-by` on `/verify`.
- Execution alignment update: the user directed using updated `main`. The branch was rebased to `a00fb7c23d6ca0aa6ac10175082f8528c037c61d`, then `main` advanced to `fc796d77749b1876fdc1518b8a8a06918fef6a2c`; use this current tip as the baseline. It includes Pi 1.5.0, TypeScript 7.0.2, lockfile updates, and the native TypeScript 7 LSP path. The feature must not add further dependency or lockfile changes without approval.
- Scope classification: Large/Risky because transport, shared templates, approvals, provenance, and local state change together.
- This replaces the historical two-stage plan. Completed historical tasks and evidence remain in Git at `07716f7:plans/pi-ship-conductor/plan.md`; do not treat those checkboxes as completion of this replacement.
- Original research baseline: feature branch `maruina/pi-ship-conductor` and `main` at `b346344d8e50b40dfa056e2bbddf9262bf010a60`. Execution uses the user-approved updated baseline recorded above.
- Existing coordinator focused tests passed 56/56 during planning. This is old-behavior evidence only.
- Installed Pi 1.5.0 docs reviewed: RPC lifecycle, commands, UI protocol, native prompt expansion, command provenance, custom tools, structured output example, and RPC UI example. Installed source confirms `parseCommandArgs` and `substituteArgs` behavior.
- Advisory lookup returned zero matching sections. No learning guidance changed this plan.
- LSP initialization failed because the worktree has no TypeScript installation. Install repository development dependencies before semantic implementation inspection. No semantic-reference completeness is claimed from planning.
- No external issue, PR feedback, or applicable ADR was identified. The explicit design and repository guidance constrain implementation.

## Implementation Contract
### Components Affected
Paths below are repo-relative. Retain `ship-conductor/` as the implementation directory; rename the command, not the directory.

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Command and state machine | `dot_pi/agent/exact_extensions/ship-conductor/index.ts`, `_conductor.ts`, `_conductor.test.ts` | `/implement`, three model selections, one round, progress and final report | Orchestration tests and live TUI run |
| RPC transport | Same directory: `_spawn.ts`, `_spawn.test.ts` | Native RPC startup, framing, correlation, events, shutdown | Fake processes plus real Pi contract test |
| Child bridge and schema | Same directory: `_bridge.ts`, `_protocol.ts`, `_protocol.test.ts` | Child-only decision/result tools and validated envelopes | Tool-result and approval contract tests |
| Runtime integration tests | Same directory: `_rpc.test.ts`, `_fixtures/rpc-driver.ts` | Drive the real child bridge deterministically without provider calls | Real Pi 1.5.0 RPC invocation |
| Target and selected unit | Same directory: `_worktree.ts`, `_worktree.test.ts`, `_unit.ts`, `_unit.test.ts` | Canonical path, Git preflight, eligible execution unit | Temporary real repositories and plan fixtures |
| Model and invocation helpers | Same directory: replace `_pools.ts`/`_pools.test.ts` with `_models.ts`/`_models.test.ts`; replace `_prompts.ts`/`_prompts.test.ts` behavior | Interactive choices, identities, native invocation argument encoding and command provenance | Selection and native-expansion tests |
| Local state | Same directory: `_state.ts`, `_state.test.ts` | Atomic records, reports, worktree ownership, retention | Real filesystem and competing-process tests |
| Obsolete parser | Same directory: remove `_markers.ts`, `_markers.test.ts` | Remove prose control protocol | Consumer search and negative protocol tests |
| Lifecycle templates | `dot_pi/agent/exact_prompts/execute.md`, `simplify.md`, `verify.md` | Conditional bridge use, fixed unit, manual provenance, fresh verification | Prompt contracts and native-expansion tests |
| Test wiring and guidance | `dot_pi/agent/package.json`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `AGENTS.md`, `dot_pi/agent/exact_extensions/ship-conductor/README.md` | Enumerate tests; document runtime, protocol coupling and recovery | Full test gates, explicit target diff |

Inspect `dot_pi/agent/AGENTS.md` too; change it only if required durable guidance is not correctly owned by root `AGENTS.md` or the extension README. No generated code or external API consumers were found. Before exported-symbol changes, use LSP references and repeat `rg` for `ship-conductor`, `/ship`, model/provenance flags, and template names. Map additional consumers before editing; stop if their behavior would expand approved scope.

### Key Decisions
1. Replace `/ship`; no alias. Reuse worktree and injected-boundary patterns, not marker parsing, automatic pools, or one-shot transport.
2. Use a narrow adapter over documented native RPC. Exported `RpcClient` offers less code but lacks a public UI-response operation. Do not access its private internals.
3. Rebase `maruina/pi-ship-conductor` onto the user-approved current `main` baseline (`fc796d77749b1876fdc1518b8a8a06918fef6a2c`) before editing code. This baseline includes `pi-client-session-id`, current skills and lifecycle templates, the removal of `lifecycle-model-recommender` (`b3a3c35`), Pi 1.5.0 / TypeScript 7.0.2 dependencies, and the native TypeScript 7 LSP path. Templates remain policy owners; layer the `/implement` bridge and dual-writer provenance directly onto `main`'s templates.
4. `lifecycle-model-recommender` was removed on `main` (`b3a3c35`), so no recommender file remains after rebase. Child sessions still isolate orchestration config via `PI_LIFECYCLE_CHILD_CONFIG` and validate `get_state` model/thinking before and after each stage so any unexpected model mutation stops the run.
5. Use `PI_LIFECYCLE_CHILD_CONFIG` as a child-only environment pointer to a private immutable stage configuration. The bridge validates its file, run/stage IDs, expected worktree, and protocol version before registration. The parent does not set this marker in its own environment. Invalid child configuration fails preflight, not ordinary manual behavior. The marker is coordination metadata, not an authentication boundary.
6. Keep the dependency versions from the user-approved updated main baseline; do not add feature-specific dependency or lockfile changes. Installed runtime and declared Pi package APIs are 1.5.0, but type declarations are not proof of runtime behavior. Use compatible existing registration APIs and schema facilities; require real-runtime tests. Do not add newer APIs such as terminating tool results merely for convenience. If compatible registration is impossible, stop for an approved enabling dependency change.
7. Execute and simplify may share a model; verify differs from both selections, including no-change simplify. Use provider-qualified IDs, plus conservative known alias normalization. Unknown cross-provider equivalence requires clarification before claiming independence; provider labels alone do not prove different underlying models.
8. Select a thinking level per stage after its model (user direction after Task 5). Offer only levels from `getSupportedThinkingLevels`, default to a scope-pinned level for that model or else the coordinator level, and skip the picker when one level is supported. Display/record the per-stage settings and stop on observed drift. Never silently substitute a model or level.
9. One complete shippable slice is required. Protocol and manual handoff work can have green commits but are not sufficient to declare the feature delivered.
10. Loop over slices inside one run (user-approved amendment). After a `VERIFIED` round, reselect the next unit with `selectExecutionUnit`; continue only when `validatePlanProgress`-style checks show unchanged plan structure, checkbox changes limited to the finished unit, and the next slice in plan order. Each `StageConfig` carries `unitBase` (round start HEAD) beside `baseline.commit` (run start); the bridge injects `Unit base commit`. Stage configs are written per round. Rejected: a confirmation dialog between slices (benefit: a human checkpoint per slice; rejected because the user asked for an unattended loop and Ctrl-C cancels), and a final `/systematic-review` or whole-feature simplify (benefit: cross-slice cleanup; rejected because it adds a writer after the final verification).

### Requirement mechanisms and feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Native dispatch and shadow detection | RPC `get_commands`, `sourceInfo`, `prompt` | Installed RPC and extensions docs | Real child template expansion and shadowing tests | Block; no copied prompt implementation |
| Approvals in coordinator | Bridge tool uses RPC UI dialog; parent returns matching `extension_ui_response` | Installed RPC UI docs and shipped example | Actual bridge dialog in real RPC, then live TUI | Block; no prose approval fallback |
| Structured final outcome | `registerTool` result `details`; `tool_execution_end` | Custom-tool docs and structured-output example | Real tool event plus malformed-result cases | Block; no marker/verdict text parser |
| Settled completion | `agent_settled`, error events, `get_state` | RPC lifecycle and command docs | Fast completion, recovery, abort and absent-result cases | Stop without advancing |
| Model selection/authentication | Registry lookup/availability and provider auth status; child observed state | Installed model registry declarations | Selection fixtures and runtime state | Stop without fallback or credential refresh |
| Exclusive worktree ownership | Atomic lock directory keyed by canonical worktree | Node filesystem primitives | Competing processes and stale ownership tests | Refuse writers |
| Candidate integrity | Git revision/status/content snapshots at bridge result and transitions | Git CLI and existing helper | Real temporary repos, tracked/untracked mutation cases | Stop and retain state |
| Local persistence | Private directory, atomic rename, bounded records | Node filesystem primitives | Write failure and retention tests | Stop; do not dispatch an unrecorded writer |

### Protocol and handoff interfaces
- `_bridge.ts` exports an extension factory but is not auto-discovered as an entrypoint. Load it explicitly in children with `-e`; keep ordinary configured extensions (including `pi-client-session-id`), skills, context, and MCP capabilities enabled. `_bridge.ts` injects the validated stage contract (run ID, stage, pinned baseline commit/blob IDs, selected slice/unit, and required tool-call instructions) into the child session via `before_agent_start` and tool `promptGuidelines` so native `/execute <plan-path>`, `/simplify <plan-path>`, and `/verify <plan-path>` invocations keep clean arguments.
- Before stage 1 starts, `_models.ts` prompts the user in the coordinator via `ctx.ui.select` for `execute`, `simplify`, and `verify` models in order from available authenticated chat models. Default `execute` and `simplify` (by ordering/labeling the current session model first when available); for `verify`, filter out choices equivalent to either selected writer after provider-qualified ID and known-alias normalization.
- Launch fresh RPC processes with the resolved Pi executable, `--mode rpc`, `--no-session`, `--provider <provider>`, `--model <id>`, `--thinking <level>`, correct `cwd`, and explicit `-e <bridge-path>`. Never resume or fork predecessor history. Before sending `prompt`, call `get_state` and `get_commands` to record the runtime `sessionId`, confirm the observed `model` and effective clamped `thinkingLevel`, and verify the target template command (`source: "prompt"`, unshadowed). Require the `prompt` response to return `data.disposition === "started"`; any `"handled"` or `"queued"` disposition fails closed immediately.
- `lifecycle_request_decision` accepts a question and complete evidence/proposal/context. Run and stage identity come from validated child configuration. Use a non-expiring RPC dialog carrying full context and an explicit approve/reject or free-text response. Dismissal cancels; rejection is recorded as rejection, never approval. Resolve only the matching active request. Template-owned decisions that require `/plan` remain blockers regardless of an inline answer.
- `lifecycle_submit_outcome` accepts protocol version 1, lifecycle outcome, change classification, bounded report text, and optional PR/commit references. Execute/simplify outcomes are `success` or `blocked`; verify outcomes are `VERIFIED` or `BLOCKED`. Stage/outcome combinations are validated. Bridge adds runtime-derived run/stage/session/model identity and Git candidate snapshot; the model cannot supply authoritative identity fields.
- Outcome envelope fields: `schemaVersion`, `runId`, `stage`, `sessionId`, `model` (provider and ID), `outcome`, `change` (`changed`, `unchanged`, or not applicable), `candidate` (branch, HEAD and state digest), `reportRef`, and optional `prUrl`/`commitRefs`. Validate commit references against Git and PR URLs as untrusted references. An agent assertion is not verification proof.
- Submit the result only after stage-owned work is complete. Exactly one successful final submission is permitted. Duplicate, conflicting, wrong-run, wrong-stage, invalid, or stale results fail closed. A tool error does not count as submission. Wait for `agent_settled` and recheck Git and model state before progression. No pending decision or queued work may remain.
- Child result writes a private report through the bridge; verification does not write candidate files. The parent records the structured result, not session logs or prose. A normal assistant report can remain readable but cannot drive transitions.
- Direct handoffs use `--implemented-by <provider-qualified-id>` (required by `/verify`) and optional `--simplified-by <provider-qualified-id>`:
  - `/execute` emits the direct `/verify <absolute-plan-path> --implemented-by <exec-id>` handoff (or `--implemented-by <exec-id> --task <quoted-original-request>`) and an optional `/simplify <absolute-plan-path> --implemented-by <exec-id>` handoff (or `--implemented-by <exec-id> --task <quoted-original-request>`).
  - `/simplify` accepts `--implemented-by <exec-id>` (and `--task <quoted-original-request>`); if invoked manually without `--implemented-by`, `/simplify` asks the user for the implementation model ID before emitting its `/verify` handoff rather than inventing one or overwriting `--implemented-by` with the simplifier model. Its handoff emits `/verify <absolute-plan-path> --implemented-by <exec-id> --simplified-by <simp-id>` (or with `--task <quoted-original-request>` last).
  - `/verify` requires `--implemented-by <exec-id>` and accepts optional `--simplified-by <simp-id>`. It compares its own model ID against `--implemented-by` and, when present, `--simplified-by`, returning `BLOCKED` if either writer matches the verifier or if `--implemented-by` is missing.
- Preserve optional direct execute-to-verify and execute-to-simplify paths. Preserve PR/file/directory/no-positional simplify targets and `--base`. Strip handoff flags (`--implemented-by`, `--simplified-by`, `--task`) and `--base` before positional target resolution. A plan path selects plan scope, not the plan file alone. Missing original task or required model history blocks a complete independent handoff.
- For planless manual handoffs put `--task <quoted-original-task>` last; preserve the exact original string, including whitespace and literal quotes. Use native argument rules, not shell escaping assumptions. Installed `parseCommandArgs` removes quote delimiters and does not interpret backslash escapes; `substituteArgs` joins arguments for `$ARGUMENTS`. Test paths via a separate `$1` target field and preserve the final task value without reparsing it as flags. Test both quote characters, embedded flag-looking text, newlines, and substitution-looking literals. If native expansion cannot retain the required data with this interface, stop for alignment; do not add a hidden shared input-rewrite mechanism.

### Execution unit and requirements baseline
- Preflight resolves exactly one plan argument with strict quoting validation; reject extra positionals, missing files, symlink ambiguity, detached/default branches, unreadable Git state, and uncommitted lifecycle documents. Discover the repository default branch rather than assuming only `main`/`master`.
- Canonicalize the owning worktree with `realpath`; ensure the plan is a tracked regular file in it. Git command failures are errors, not clean-state results (the existing helper must be corrected).
- For grouped plans use the first slice containing incomplete task checkboxes, or the explicitly approved current unit if the plan defines it. Validate numbered blocking edges against completed prerequisites. Reject malformed/ambiguous headings, unresolved blockers, no remaining work, and conflicting scope. For ungrouped plans the execution unit is all remaining approved tasks.
- Pin starting HEAD, original plan/design Git blob IDs and paths, selected slice heading/task numbers, and baseline comparison reference in immutable run metadata before writers. Templates independently read the baseline and validate unit interpretation before acting. A disagreement is blocked, not resolved by the coordinator choosing more scope.
- Plan progress may change checkboxes and append stage ledger/provenance notes. It does not replace the pinned requirements. Scope or acceptance changes require planning, not approval inside this run.
- Execute must finish the fixed unit and leave clean committed candidate state. Record its candidate commit as the simplification start. Simplify inspects the broader diff only as context and edits only the selected unit and immediate context; use the selected unit's starting reference, not a convenient whole-branch base, for authorization.
- Changed simplify must pass its required tests, commit successfully, and satisfy its existing conditional push policy. Unchanged simplify preserves HEAD, creates no empty or ledger-only commit, and still enters fresh verify. Required push/commit failure blocks even when a local commit exists.
- Verification reads original requirements from pinned Git objects plus candidate references and writer provenance. Do not pass predecessor reports or narrative as evidence. Verify gathers fresh tests/review and compares complete tracked/untracked state before and after.

### Implementation Constraints
- The coordinator never edits candidate files, commits, pushes, opens PRs, repairs, retries a lifecycle stage, or executes the next slice. Stage agents can perform only template-authorized work.
- Parent session must remain available for decisions. Guard its model-driven work and nested coordinator dispatch while a run is active; reject new lifecycle orchestration from children. This is cooperative ownership, not shell/editor isolation.
- Explicit run states: preflight, running, waiting-for-user, lifecycle blocked, process/protocol failure, cancelled, verified. Separate transport state from lifecycle verdict.
- Cooperative lock uses exclusive directory creation under Pi local state, keyed by a hash of canonical worktree path. Owner record contains run ID and coordinator identity. Release only the owned lock and only after confirmed child termination. Never automatically steal a stale lock after a crash.
- Stop on unsupported protocol/version, missing required capability/authentication, unavailable tool, model drift, unexplained candidate changes, storage failure, or scope ambiguity. Do not refresh credentials, install production tools, or weaken tests automatically.
- Use LSP references before public-symbol behavior/signature changes, diagnostics after nontrivial TypeScript changes, and focused failing tests before implementation. Add `deliberate:` comments only for non-obvious intentional limits, such as no crash recovery and the version-bound RPC adapter.

### Bounds, Security Requirements, and Observability Requirements
- At most 20 rounds per run. The run record keeps progress entries only for the active round; completed rounds keep stage status, models, session IDs, outcomes, report references, and commits.
- One active child and one outstanding lifecycle decision. Control/startup calls have a 30-second deadline; model work and human response time have no coordinator deadline.
- RPC records are at most 1 MiB. Decode UTF-8 incrementally and frame only on LF, accepting CRLF. Reject malformed/oversized protocol records, honor stdin backpressure, continuously drain stdout/stderr, and bound pending requests/listeners.
- Retain at most 16 KiB stderr and 100 progress entries. Decision context is at most 16 KiB; reject oversize context instead of hiding part. Bound displayed progress strings too, so entry count alone cannot bypass memory limits.
- Run state lives under `getAgentDir()/lifecycle-coordinator/`: private directories (0700), files (0600), immutable child config, `runs/<run-id>/record.json`, stage reports, and separate worktree locks. Atomic rename updates records. Maximum record size is 256 KiB; stage reports are at most 64 KiB each. Bound cumulative decisions by the record limit and stop visibly before overflow.
- Retain at most 100 completed run bundles, pruning oldest completed records/reports only. Never prune active, unresolved, or locked state. Refuse new runs if safe retention cannot maintain capacity; do not delete evidence for a potentially active writer. Existing Pi session retention is not extended by this feature (`--no-session`).
- Abort cancellation immediately stops dispatch. Send RPC abort, wait up to 5 seconds, then SIGTERM; after another 5 seconds send SIGKILL. Confirm process exit/close, clean timers/listeners, then release ownership. If termination cannot be confirmed, retain the lock and report manual recovery. Close stdin for orderly successful shutdown too. `proc.killed` is not evidence of exit.
- Launch without a shell. Task data travels over stdin, not argv. Inherit existing credentials without reading, logging, or persisting them. Store references rather than transcript copies; decisions may contain private repository information, so keep records local and private. Do not claim automatic secret redaction can make arbitrary output safe.
- Treat child output and references as untrusted. No child-supplied command is executed by the coordinator. No sandbox or hard read-only guarantee is introduced; verification detects mutations and reports them.
- Show stage, model, effective thinking, selected unit, waiting state, outcomes, report references, bounded errors, and manual next action. Final summary includes candidate/simplification commits, decisions, PR link or explicit absence, verification attempts (0/1), and blocked verdicts (0/1). A process failure before verdict is not a blocked verification verdict.
- Owner is Matteo. This is a local development tool, not a production service; no new telemetry, dashboard, alert, or pager is required. Reports and local run state supply diagnosis.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Missing/ambiguous plan, dirty docs/tree, unsafe branch, failed Git command | Stop before writer dispatch, name reason | Worktree/unit tests with real Git |
| Unavailable model/auth or uncertain independence | Stop without fallback | Model and conductor tests |
| Template absent/shadowed or bridge unavailable | Stop before writer action | Real runtime preflight tests |
| Missing/malformed/duplicate/stale result or early exit | Protocol failure; no next stage | Fake process and bridge tests |
| Approval rejected, dismissed, disconnected, timed out by another extension, or incorrectly correlated | No implicit approval; stop/cancel as applicable | UI protocol tests and live dismissal |
| Model changes or external candidate changes | Stop, preserve evidence | Runtime and transition tests |
| Dirty execute/simplify, failed commit or required push | Stop before next stage; report retained commits | Conductor plus real repository fixtures |
| No-change simplify | No empty commit; fresh verify still runs | No-change transition test and smoke |
| Verify mutates tracked/untracked files | BLOCKED, identify delta; no repair | Real Git snapshots |
| Storage failure, record cap, stale lock | Stop safely; never take over or prune active evidence | Filesystem/process tests |
| Cancellation/parent shutdown in any state | Stop active child before unlock; no subsequent stage | Graceful/forced termination tests |

### Rollout and Rollback
- Before Task 1 edits code, rebase `maruina/pi-ship-conductor` onto the user-approved current `main` baseline (`fc796d77749b1876fdc1518b8a8a06918fef6a2c`) in this feature worktree. Resolve conflicts so main's current skills, prompts, `pi-client-session-id` extension, dependency manifest, lockfile, and TypeScript 7 LSP support are preserved with `ship-conductor/*.test.ts`, without moving the `main` branch ref.
- First exercise the candidate extension and prompts through explicit temporary Pi resource paths in a disposable worktree. For test-only prompt isolation, enumerate effective prompt sources, use documented `--no-prompt-templates`, and re-add them with repeated `--prompt-template` paths, replacing only execute/simplify/verify with candidate paths. Retain every other required template and normal configured extensions/MCP capabilities. Validate `get_commands` provenance before dispatch. This avoids duplicate-name precedence assumptions without changing rendered targets. The old installed `/ship` can remain inert during this test; its removal is checked in candidate registration tests and after the reviewed target rollout. No live target application is needed to prove candidate behavior.
- After `/verify` returns VERIFIED, preview and apply only reviewed explicit targets with `chezmoi --source "$PWD"`. Targets: changed files under `~/.pi/agent/extensions/ship-conductor/`, the three prompt files, changed test scripts, `~/.pi/agent/package.json`, and applicable rendered guidance. Include explicit deletion targets for obsolete helpers. Do not trust directory-only diff/verify.
- Reload Pi and confirm `/implement` exists and `/ship` does not. Owner: Matteo. Commit/push implementation only under the normal lifecycle and repository completion policy; this plan commit does not apply runtime targets.
- Rollback: stop active runs and confirm child termination; revert replacement code/template changes; preview/apply the corresponding explicit targets and reload. Preserve run records and candidate commits/files. Direct lifecycle commands remain the fallback.

### Test Strategy
- Existing seams: injected Git/process/registry/UI boundaries, node:test helpers, lifecycle prompt assertions. Add the fewest new seams: the real RPC bridge test driver and filesystem/process lock tests.
- `_fixtures/rpc-driver.ts` is test-only, explicitly loaded, and cannot be auto-discovered as a production entrypoint. Register a deterministic in-memory test provider using documented `pi.registerProvider` with `streamSimple` and `createAssistantMessageEventStream` (installed custom-provider docs and shipped provider examples). It emits a fixed bridge tool call, then a terminal response after the tool result. This drives the actual agent loop, registered tool, RPC UI request, `tool_execution_end`, and `agent_settled` without network/provider-service calls. Do not invoke a private bridge helper or assume a nonexistent `pi.callTool` command API. Test-provider streaming is a fixture, not a production feature.
- Compare old 56-test behavior as historical baseline, then add failing tests for new requirements before implementation. Mock providers/process timing for exhaustive failures, not lifecycle policy or internal helpers.
- Real runtime contract tests must identify Pi 1.5.0 explicitly and fail, not silently skip, when the required integration command is requested without it. They call only the in-memory fixture provider, make no remote model requests, and require no credential refresh.
- Live testing uses isolated worktree, private temporary run-state directory, explicit candidate resources, no production workload, and a committed tiny plan. A child can push/open a PR only when the smoke plan explicitly authorizes it; otherwise prohibit both in that plan. No shared queues/background jobs are introduced. Confirm no child survives cleanup. Keep evidence outside the candidate.
- Baseline and candidate live observations use the same smoke plan shape and configured capabilities. The old `/ship` is not expected to satisfy approvals/simplify; compare scope, model/cwd identity, and process cleanup, not model answer quality or latency. No performance/cost improvement is claimed. Record actual model identities, runtime version, run ID, and observation start/end; no remote telemetry query is necessary.
- Focused commands run from `dot_pi/agent`: `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'` and `node --test exact_scripts/lifecycle-prompts.test.mjs`.
- Full gates: `npm ci --ignore-scripts`, `npm test`, `npm run test:all`. Keep dependencies through both gates, then remove disposable source `node_modules` before the independent verification snapshot. LSP diagnostics supplement tests; they do not replace real-runtime compatibility checks.

## Acceptance Requirements
### Requirement R1: Safe fixed-unit preflight
The system SHALL resolve one committed plan to a canonical clean feature worktree, pin requirements and one eligible execution unit, and acquire exclusive ownership before writer dispatch.

#### Scenario: Eligible grouped unit
- GIVEN a clean committed grouped plan with completed prerequisites.
- WHEN `/implement` starts.
- THEN it selects only the eligible current slice and records immutable baseline references.

#### Scenario: Unsafe or ambiguous target
- GIVEN ambiguous paths/units, dirty or untracked candidate state, missing docs, failed Git inspection, default/detached branch, or an existing lock.
- WHEN invoked.
- THEN no writer starts and the specific blocker is reported.

#### Scenario: Later slices remain
- GIVEN one unit completes with `VERIFIED`.
- WHEN later plan slices remain.
- THEN the next slice in plan order starts a fresh round with the same models; no slice starts after a non-verified round.

### Requirement R9: Ordered slice loop
The system SHALL run one execute → simplify → verify round per remaining slice, in plan order, and finish only when no incomplete slice remains or a round does not end in `VERIFIED`.

#### Scenario: Multi-slice plan completes
- GIVEN a grouped plan with two incomplete slices.
- WHEN both rounds end in `VERIFIED`.
- THEN the run reports both slices verified, each round used a distinct unit base commit and fresh sessions, and stage configs and reports did not collide.

#### Scenario: Loop must stop
- GIVEN a round ends blocked, failed, cancelled, or `BLOCKED`, or the plan structure changed, out-of-unit checkboxes changed, or the next unit is not the next slice in order.
- WHEN the coordinator evaluates the next round.
- THEN no later round starts and the report names completed, stopped, and remaining slices.

#### Scenario: Round limit
- GIVEN a plan with more than 20 remaining slices.
- WHEN `/implement` reaches the limit.
- THEN it stops after round 20 and reports the remaining slices; it does not exceed the run-record limit.

### Requirement R2: Native dispatch, fresh contexts, and selected models
The system SHALL run exactly execute, simplify, and verify in order through native templates in fresh RPC sessions, under the selected models with validated provenance.

#### Scenario: Fresh sessions and selected models
- GIVEN valid selections.
- WHEN dispatched.
- THEN each stage has the intended cwd/model, a distinct fresh session, and normal required capabilities; verify differs from both selected writers.

#### Scenario: Unavailable or changed prerequisites
- GIVEN a missing/shadowed template, invalid selection, unavailable authentication, uncertain independence, or unapproved runtime model change.
- WHEN detected.
- THEN the run stops without substitution.

#### Scenario: Isolated child configuration
- GIVEN a child stage config or an unorchestrated session.
- WHEN `PI_LIFECYCLE_CHILD_CONFIG` is validated in RPC mode or absent in ordinary sessions.
- THEN valid child sessions register the bridge tools and verified model/thinking settings, invalid child configs fail preflight, and ordinary RPC/TUI sessions remain unaffected.

### Requirement R3: Structured user decisions
The system SHALL route complete decision context and the correlated answer between the active child and user without deciding for the user.

#### Scenario: Correlated user answer
- GIVEN an approval request.
- WHEN the coordinator displays it and the user answers.
- THEN only that child receives the matching decision and the run record records it.

#### Scenario: Rejected or missing approval
- GIVEN rejection, dismissal, missing response, wrong correlation, or oversize context.
- WHEN processed.
- THEN no approval is inferred and progression stops/cancels as applicable.

#### Scenario: Planning-only scope change
- GIVEN a scope change requiring planning.
- WHEN an inline answer is supplied.
- THEN the stage remains blocked pending the planning workflow.

### Requirement R4: Typed settled outcomes
The system SHALL advance only after one valid typed final outcome, settled completion, and successful transition checks.

#### Scenario: Valid settled result
- GIVEN a valid success result and settled unchanged result snapshot.
- WHEN transition checks pass.
- THEN only the next authorized stage starts.

#### Scenario: Insufficient or contradictory completion
- GIVEN exit zero, prompt acceptance (`disposition !== "started"` or without settled outcome), `agent_end`, verdict prose, missing result, duplicate/conflicting result, pending approval, provider failure, or a changed post-result snapshot.
- WHEN observed.
- THEN no next stage starts.

### Requirement R5: Simplification and independent closeout
The system SHALL require clean committed execution, enforce simplify commit/push policy, and perform fresh read-only verification after changed or unchanged simplification.

#### Scenario: Committed simplification
- GIVEN changed simplification with successful tests/commit/required push and a clean tree.
- WHEN it settles.
- THEN fresh verify examines the final candidate and original requirements.

#### Scenario: No-change simplification
- GIVEN no-change simplification.
- WHEN it succeeds.
- THEN no empty commit occurs and fresh verify still runs.

#### Scenario: Unsafe candidate or failed closeout
- GIVEN dirty state, failed commit/required push, out-of-unit edits, missing provenance, or verification mutation.
- WHEN detected.
- THEN the run stops or returns BLOCKED without repair.

### Requirement R6: Compatible manual handoffs
The templates SHALL retain direct lifecycle commands while preserving the exact requirements and both writer identities across optional simplification.

#### Scenario: Execute handoff
- GIVEN a plan path or original trivial task and known implementer.
- WHEN execute emits handoffs.
- THEN direct verify and optional simplify commands preserve that source and stable identity.

#### Scenario: Simplify handoff
- GIVEN simplify with known `--implemented-by` provenance (passed from execute or supplied by the user when asked).
- WHEN it emits verify metadata.
- THEN both `--implemented-by` and `--simplified-by` survive native expansion; `--base` and non-plan targets retain their meanings.

#### Scenario: Missing or invalid provenance
- GIVEN missing task or `--implemented-by` history, either `--implemented-by` or `--simplified-by` matching the verifier, or malformed/ambiguous metadata.
- WHEN resolving the handoff.
- THEN the template asks/blocks rather than inventing provenance or requirements.

### Requirement R7: Cancellation, ownership, and bounded state
The system SHALL bound protocol/state resources, stop active children before releasing ownership, and preserve candidate changes and commits on failure.

#### Scenario: Cancellation in any state
- GIVEN cancellation before dispatch, during work, during a dialog, or between stages.
- WHEN handled.
- THEN no later stage starts and confirmed child termination precedes unlock.

#### Scenario: Resistant child shutdown
- GIVEN abort resistance.
- WHEN grace periods expire.
- THEN termination escalates; if exit cannot be confirmed, ownership remains unresolved and manual recovery is reported.

#### Scenario: Capacity and stale ownership
- GIVEN large output, storage failures, retention capacity, crashes, or stale locks.
- WHEN detected.
- THEN limits and safe refusal apply without deleting active evidence, resetting files, or retrying the stage.

### Requirement R8: Accurate reporting and operational handoff
The system SHALL report per-stage state/model, selected unit, candidate commits, decisions, reports, PR presence/absence, and separate verdict/transport counts without claiming merge or deployment.

#### Scenario: Terminal outcome report
- GIVEN VERIFIED, BLOCKED, process failure, or cancellation.
- WHEN the run ends.
- THEN its report accurately names completed and unstarted stages, retained state, zero-or-one verification attempt/verdict counts, and a manual next action.

#### Scenario: Absent PR or verdict
- GIVEN no PR or no verification verdict.
- WHEN reporting.
- THEN no URL or verdict is invented.

## Implementation Tasks
The following tasks form one integration unit, not independently authorized product slices. Every task must be green before its commit. If native protocol feasibility fails in Task 1, stop before building later tasks. Do not orchestrate this replacement with the old `/ship` implementation.

### Task 1: Rebase onto main and prove the native child bridge and exact input contract
**Delivers:** Branch rebased onto the user-approved current `main` baseline (`fc796d7`) plus deterministic real-Pi evidence that registered bridge tools produce structured events, approvals round-trip, and native expansion preserves handoff data.
**Blocked by:** None
**Traces to:** R2, R3, R4, R6, R7
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/_bridge.ts`, `_protocol.ts`, `_protocol.test.ts`, `_rpc.test.ts`, `_fixtures/rpc-driver.ts`, `_spawn.ts`, `_spawn.test.ts`, `_prompts.ts`, `_prompts.test.ts`.

- [x] Rebase `maruina/pi-ship-conductor` onto the user-approved current `main` baseline (`fc796d77749b1876fdc1518b8a8a06918fef6a2c`) in this worktree without moving `main`, preserving the updated dependency manifest and lockfile plus `main`'s current skills, prompts, `pi-client-session-id` extension, TypeScript 7 LSP support, and `test:unit` entries alongside `ship-conductor/*.test.ts`. Confirm `git status` is clean after the rebase.
- [x] Read relevant installed Pi docs/examples in full before harness implementation, including custom-provider streaming and its shipped example. Use the explicitly loaded in-memory fixture provider to drive actual bridge tool calls through the native agent loop. Install development dependencies with `npm ci --ignore-scripts` from `dot_pi/agent`; keep them until full gates finish.
- [x] Add focused failing protocol/native-runtime tests before changing production behavior. Run `node --experimental-strip-types --test exact_extensions/ship-conductor/_protocol.test.ts exact_extensions/ship-conductor/_rpc.test.ts`; expect missing bridge/protocol behavior to fail initially.
- [x] Implement the versioned child-only bridge (including stage-contract injection and config validation), bounded RPC adapter (including `get_state`/`get_commands` preflight and `disposition === "started"` enforcement), and test-only explicit driver. Keep old command tests green until the command is replaced; do not add a second maintained coordinator mode.
- [x] Test native `/execute`, `/simplify`, and `/verify` expansion with temporary fixture templates and exact argument preservation, including quote characters, whitespace, flag-looking task content, and `$ARGUMENTS` literals. Confirm source provenance, shadowing refusal, and non-`"started"` prompt disposition failure.
- [x] Exercise the real tool event and UI response path using only the in-memory fixture provider, with no remote model calls. Verify `agent_end` alone is insufficient, and actual tool errors cannot count as results. Require the real Pi 1.5.0 test when using the full gate.
- [x] Run the narrow command again; expect all cases passing and no surviving child. Refactor only after green, then rerun.
- [x] Commit with `feat(pi): add structured lifecycle RPC bridge`.

### Task 2: Preserve manual lifecycle scope, approvals, and writer provenance
**Delivers:** Direct commands and orchestrated variants share template-owned lifecycle rules and working provenance handoffs.
**Blocked by:** 1
**Traces to:** R1, R2, R3, R5, R6
**Files:** `dot_pi/agent/exact_prompts/execute.md`, `simplify.md`, `verify.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.ts`, `_prompts.test.ts`, `_rpc.test.ts`.

- [x] Starting from `main`'s current `execute.md`, `simplify.md`, `verify.md`, and `lifecycle-prompts.test.mjs`, preserve all existing skill-delegation contracts (`skill-loader` provenance, `feature-worktree`, `reviewable-pr-workflow` stack-split, `learning-candidates`, and slice execution/verification).
- [x] Add failing handoff assertions in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` and native expansion cases in `_rpc.test.ts` (updating `execute and simplify emit the same /verify handoff contract` for the dual-writer `--implemented-by` + optional `--simplified-by` contract). Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect failures for missing dual-writer and conditional bridge contracts.
- [x] Add optional execute-to-simplify handoff (`/simplify <absolute-plan-path> --implemented-by <id>` or `--implemented-by <id> --task <quoted-original-request>`) and retain execute-to-verify. In `/simplify`, accept `--implemented-by` (ask the user if missing before emitting `/verify`), strip handoff metadata and `--base` before target resolution, preserve exact original tasks, and emit `/verify ... --implemented-by <exec-id> --simplified-by <simp-id>`. In `/verify`, require `--implemented-by` and accept optional `--simplified-by`, blocking if either matches the verifier model.
- [x] Conditionally use bridge decisions/results only when validated orchestration metadata/tools (`lifecycle_request_decision`, `lifecycle_submit_outcome`) exist. Preserve conversational approvals otherwise. In orchestrated stages require fixed-unit scope, pinned baseline, and proper blocked outcomes. Accept fresh orchestration verify sessions as independent without requiring a literal manual `/new`.
- [x] Preserve simplify clean-start commit/push policy, no-change no-commit behavior, and explicit distinction between manual unchanged-candidate verdict validity and mandatory first verification in `/implement`.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs` and `node --experimental-strip-types --test exact_extensions/ship-conductor/_prompts.test.ts exact_extensions/ship-conductor/_rpc.test.ts`; expect direct and orchestrated cases green.
- [x] Refactor only after green, rerun, and commit with `feat(pi): preserve lifecycle handoff provenance through simplify`.

### Task 3: Replace the command with the complete single-round coordinator
**Delivers:** `/implement` selects models, locks/pins one clean execution unit, runs all three stages, and reports a typed outcome.
**Blocked by:** 1, 2
**Traces to:** R1-R8
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/index.ts`, `_conductor.ts`, `_conductor.test.ts`, `_worktree.ts`, `_worktree.test.ts`, `_unit.ts`, `_unit.test.ts`, `_models.ts`, `_models.test.ts`, `_state.ts`, `_state.test.ts`, `_spawn.ts`, `_spawn.test.ts`, `_protocol.ts`, `_protocol.test.ts`, `_bridge.ts`, `_prompts.ts`, `_prompts.test.ts`; delete `_markers.ts`, `_markers.test.ts`, `_pools.ts`, `_pools.test.ts`; `dot_pi/agent/package.json`.

- [x] Use LSP definition/reference context for exported helper changes; repeat consumer search and account for tests and guidance before deleting old interfaces.
- [x] Add public-command/state-machine tests for preflight, three interactive model selections (defaulting execute/simplify to the current session model and filtering verify to distinct models), selected-unit boundaries, three sequential sessions, structured transitions, clean simplify, fresh verify, and final counts. Use temporary real repositories for Git assertions.
- [x] Run `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`; the new behavior is covered and the suite passes.
- [x] Implement the smallest coordinator and state helpers meeting the contract. Replace `/ship` registration and obsolete parsers/pools; no aliases or parallel policy. Fail on Git errors, not just nonempty status.
- [x] Validate child stage-config isolation (`PI_LIFECYCLE_CHILD_CONFIG`), with tests for marked child, invalid child config, ordinary RPC/TUI behavior, and no leaked parent marker.
- [x] Pin original Git objects and selected unit, acquire/recheck ownership before dispatch, validate observed models and effective thinking via `get_state` plus candidate state on each transition, and persist records atomically. Reject unknown provenance and model drift conservatively.
- [x] Keep approval replies correlated and never automatic. Keep parent repository work/nested orchestration blocked cooperatively while children own the worktree. Verify child context payloads contain no predecessor transcript/report narrative.
- [x] Keep tests in the existing `test:unit` enumeration; its glob already includes the extension suite. Make no additional dependency or lockfile changes beyond the user-approved updated main baseline.
- [x] Run `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`; all cases pass.
- [x] Run LSP diagnostics for changed TypeScript. Refactor only after green and rerun the narrow suite.
- [x] Commit with `feat(pi): replace ship with single-round implement coordinator`.

### Task 4: Prove failure containment, resource bounds, and cancellation
**Delivers:** Failures cannot authorize another stage, leak a child, lose candidate state, or silently release unresolved ownership.
**Blocked by:** 3
**Traces to:** R1, R3-R5, R7, R8
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `_conductor.test.ts`, `_spawn.ts`, `_spawn.test.ts`, `_state.ts`, `_state.test.ts`, `_protocol.ts`, `_protocol.test.ts`, `_rpc.test.ts`.

- [x] Add focused failing cases for malformed/oversized JSONL, split UTF-8/CRLF/Unicode separators, backpressure, bounded stderr/progress, pending requests, non-`"started"` prompt dispositions, write errors and record/report limits.
- [x] Add competing-process lock tests, stale-owner refusal, record pruning that preserves active evidence, and candidate tracked/untracked mutation checks.
- [x] Test cancellation before dispatch, while writing, while waiting for approval, and between stages; simulate abort resistance and SIGTERM resistance. Assert child termination/close before lock release, cleared timers/listeners, and no stage retry. Exercise parent shutdown cleanup.
- [x] Test failed commit/required push, duplicate result, post-result edits, model drift, read-only verification mutation, absent PR, absent verdict, and accurate zero/one counters.
- [x] Implement only missing containment behavior; do not refactor unrelated transport or add recovery features.
- [x] Run `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`; expect all cases green and no hanging test process. Rerun after any refactor.
- [x] Commit with `fix(pi): contain lifecycle failures and cancellation`; production behavior changed to enforce byte-bounded stderr and cancel pending UI selection/wait state.

### Task 5: Loop the round over remaining plan slices
**Delivers:** One `/implement` run executes every remaining slice in order and stops at the first non-verified round.
**Blocked by:** 4
**Traces to:** R1, R7, R8, R9
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `_conductor.test.ts`, `_protocol.ts`, `_protocol.test.ts`, `_bridge.ts`, `_state.ts`, `_state.test.ts`, `_rpc.test.ts`; `dot_pi/agent/exact_prompts/execute.md`, `simplify.md`, `verify.md`; `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [x] Add failing conductor tests: two verified slices run six stages in order with distinct unit base commits; a `BLOCKED` verdict, blocked writer, cancellation between rounds, changed plan structure, out-of-unit checkbox change, or out-of-order next unit stops the loop; an ungrouped plan runs one round; the 20-round limit stops with remaining slices reported. Add failing state tests for per-round stage config paths, and protocol tests for `unitBase`.
- [x] Run `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`; expect the new loop cases to fail.
- [x] Add `unitBase` to `StageConfig`, inject `Unit base commit` in `_bridge.ts`, write stage configs per round, keep progress only for the active round, and loop in `runImplement`. Per-round verification counters replace the single 0/1 counters in the record and summary.
- [x] Update the three templates' orchestrated sections: execute and simplify scope the unit from `Unit base commit`; verify diffs the slice from `Unit base commit` and reconstructs `Final verification` from `Pinned baseline commit`. Add matching assertions to `lifecycle-prompts.test.mjs`; run `node --test exact_scripts/lifecycle-prompts.test.mjs`.
- [x] Run the extension suite and `node --experimental-strip-types --test exact_extensions/ship-conductor/_rpc.test.ts`; expect all green. Run LSP diagnostics on changed TypeScript. Refactor only after green and rerun.
- [x] Commit with `feat(pi): loop implement rounds over remaining plan slices`.

Task 5 verification: before the change, the extension suite failed the new loop, `unitBase`, per-round config, and RPC contract cases; the ungrouped-plan and external-plan-change cases already passed because single-round behavior and the stage-start candidate check cover them. After the change, the extension suite passed 111/111 and `node --test exact_scripts/lifecycle-prompts.test.mjs` passed 55/55. `npm test` and `npm run test:all` exited 0 (330 unit, 84 prompt, 35 report, 12 collector tests, skills, `test:pi-deps`, and the extension smoke). LSP diagnostics showed no issues in changed TypeScript. A mutation check that disabled the bridge `unitBase` ancestry check made the new RPC case fail. The 21-slice test completes 20 rounds within the 256 KiB run-record limit because completed rounds drop progress, stderr, and stage decision copies. To keep the template size budgets in `lifecycle-prompts.test.mjs`, the change shortened two orchestrated-mode sentences in all three templates (`progress ledger` to `ledger`, and the redundant `not the bridge` clause) and removed two sentences in `verify.md` that repeated rules stated elsewhere in the same file. The next-unit "out of order" stop is a defensive check: `selectExecutionUnit` always selects the first incomplete slice, and the execute progress check requires every selected checkbox, so the check is reachable only when an invariant breaks.

Model-scope correction (user direction after Task 5): the three model pickers list only the session's scoped models (`ctx.scopedModels`, resolved by Pi from `--models` and `enabledModels`, the same set as `/scoped-models`) instead of every authenticated model from `ctx.modelRegistry.getAvailable()`. An empty scope keeps the full authenticated list, which matches Pi's own rule. A configured scope with no available authenticated model stops preflight instead of falling back to the full catalogue. A thinking level pinned by a scope pattern is ignored, because every stage inherits the coordinator thinking level. `_models.test.ts` gained two cases that failed first; the extension suite passed 113/113 and `npm run test:all` exited 0.

Per-stage thinking (user direction after Task 5): after each stage model, `selectModels` asks for that stage's thinking level from the levels `getSupportedThinkingLevels` reports for the registry model. The default is listed first: a level pinned by the session scope (for example `anthropic/*:high`) for that model, otherwise the coordinator level. A model with one supported level skips the picker, and a cancelled or unknown answer stops preflight. Each stage config's `thinkingLevel`, the child `--thinking` flag, the observed-state drift check, the run record (`thinkingLevels`), and the summary use the stage's level. This supersedes the earlier note that scope-pinned levels are ignored. Four new tests failed first; the extension suite passed 117/117.

Live-run visibility and cancellation (first Task 6 attempt, run `203a0e82-ac91-4252-baaa-61d94a213d19`): after model selection, the run did start, but the coordinator reported progress only through `ctx.ui.setStatus`, so the TUI looked idle. The coordinator now shows a `ctx.ui.setWidget` panel (run ID, round N of M, slice, one line per stage with status, model, and thinking level, and the latest child activity) and clears it at the end. The same attempt showed that the input-block message "cancel it with Ctrl-C" was wrong: in Pi 1.5.0, Ctrl-C is `app.clear` and Escape is `app.interrupt`, and `ctx.signal` is undefined in extension commands, so neither key reaches a running stage outside a dialog. `/implement` now registers `ctrl+shift+x` with `pi.registerShortcut` to abort the active run, and `session_shutdown` awaits the active run because Pi awaits shutdown handlers (`emitSessionShutdownEvent`). New tests failed first; the extension suite passed 119/119.

### Task 6: Run the live acceptance workflow in isolation
**Delivers:** Evidence that actual models, actual approvals, normal capabilities, and the three-stage candidate workflow work together across two slices.
**Blocked by:** 5
**Traces to:** R1-R9
**Files:** `plans/pi-ship-conductor/plan.md` (execution evidence only); disposable smoke files outside this feature worktree are test fixtures, not shipped source.

- [ ] Create an isolated disposable feature worktree with a small committed two-slice plan, an exact deterministic test command, no external service mutation, and one explicit approval gate. Use explicit candidate extension/prompt resource paths, normal required extensions, and a private temporary coordinator-state directory. Confirm intended templates resolve and old installed extension command conflicts do not hide the candidate.
- [ ] Record Pi version, selected/observed models, thinking, run ID, unit, baseline/candidate commits and observation window. Invoke `/implement <absolute-smoke-plan-path>` in a real interactive Pi session; this requires the user/TUI and authenticated providers, so automation alone is insufficient.
- [ ] Complete a real approval round-trip. Observe execute, no-change or committed simplify, and fresh distinct verify. Compare candidate state and deterministic test results, not merely absence of errors. Record PR absence explicitly if prohibited by the smoke plan.
- [ ] Exercise cancellation in a separate invocation while awaiting approval, and refusal for an owned worktree. Confirm no later stage and no surviving child before removing fixtures. Preserve retained candidate changes until inspected.
- [x] If user interaction, credentials, or a provider are unavailable, record a blocker and stop. Do not mark acceptance complete, infer success from mock tests, refresh credentials, or switch to prose parsing.

Blocker evidence (2026-11-09): The user launched the approval smoke in Pi 1.5.0, but model preflight returned `No available authenticated chat models are configured` / `No stage was started`. A read-only `pi auth check --provider openai --no-refresh --json` in the tool environment returned `not_ready` / `credentials_not_configured` for both the default and isolated agent directories; no credential refresh was attempted. The coordinator selects models before creating a run ID or acquiring the worktree lock, and no coordinator state directory exists. No child or stage was started. I did not run `/login`. At failure time, the launcher’s temporary `auth.json` was a symlink to `~/.pi/agent/auth.json`. I have since replaced only that temporary symlink with a private mode-0600 empty file; no `/login` was run. A future login through this launcher would stay in the temporary agent directory, but requires user authorization. Follow-up credential hypothesis: the smoke launcher runs `pi` directly and does not wrap it with `dd-auth`. The work-profile `models.json` config sets OpenAI request tags but no API key; Pi's built-in OpenAI provider expects `OPENAI_API_KEY`. `dd-auth --help` reports that it wraps a child command and defaults to exporting `DD_API_KEY`, with an option to choose another environment variable. Whether that Datadog key is valid for this model endpoint, and which mapping the normal Pi launch uses, are unconfirmed. I did not run `dd-auth` to fetch credentials. Approval, stage models, run ID, cancellation, and owned-worktree refusal remain unobserved; this task is incomplete.

Blocker resolution (2026-11-11): the `dd-auth` hypothesis is disproven. The work profile authenticates models through the `pi-dd-ai-gateway` package, which registers providers with a `!ddtool auth token rapid-ai-platform` API key command. `settings.json` listed that package as `../../go/src/...`, and Pi resolves relative local package paths from the agent directory (`docs/packages.md`). The launcher's `PI_CODING_AGENT_DIR` override therefore resolved the path under the temporary directory, the gateway did not load, and no model was authenticated. `pi list` with the temporary agent directory showed no resolved path for the six local packages; with absolute paths, all six resolved. The fix is commit `15ff89c` on `maruina/pi-absolute-package-paths` (`fix(pi): use absolute paths for work-profile local packages`), applied to `~/.pi/agent/settings.json`. No credential was read or refreshed.
Partial live evidence (2026-11-11, abandoned attempt, run `203a0e82-ac91-4252-baaa-61d94a213d19`, Pi 1.5.0, pre-`e24e4b2` coordinator): models execute `openai/openai/gpt-6-luna` (xhigh), simplify `google/gemini-3.8-flash` (medium), verify `baseten/glm-5-3-flash` (high). The execute child requested a decision through `lifecycle_request_decision` ("Do you approve `Hello, Pi!` as the greeting for an empty name?"); the user approved it in the coordinator TUI, and the record stored `approved`. Execute settled `success`/`changed` at `554a5e5` (`feat(smoke): implement approved greeting`); simplify settled `success`/`unchanged` at the same HEAD; verify started in a fresh session and was running when the coordinator session ended. The old `session_shutdown` handler only signalled abort, so the exit left the lock and a `running` record; no Pi process for the run remained. With user authorization, the run bundle was moved to the launcher's `evidence/` directory, the stale lock was removed manually, and the smoke worktree was reset to `7e8856c` for a fresh attempt. This attempt does not satisfy Task 6.

- [ ] Record report references and actual outcomes here, clean disposable resources only after confirmed child termination, and commit with `docs(pi): record implement coordinator live acceptance evidence`.

### Task 7: Complete documentation and final feature verification
**Delivers:** Complete acceptance traceability, passing repository gates, and durable usage/recovery guidance for future agents.
**Blocked by:** 6
**Traces to:** R1-R9; explicit documentation and future-agent guidance requirement
**Files:** `AGENTS.md`, `dot_pi/agent/AGENTS.md` (inspect; modify only if justified), `dot_pi/agent/exact_extensions/ship-conductor/README.md`, `plans/pi-ship-conductor/plan.md` (execution ledger).

- [ ] Replace root marker-parser coupling guidance with the structured bridge/template contract, exact focused tests, Pi 1.5.0 integration requirement, and scoped child-marker trap. Inspect `dot_pi/agent/AGENTS.md`; record why no change is needed if guidance is correctly owned elsewhere. Do not update unrelated obsolete MCP guidance.
- [ ] Document `/implement`, the lifecycle order (`/plan` → `/systematic-review` → `/implement`), the slice loop and its stop rules, the optional manual whole-feature `/simplify` + `/verify`, manual handoff examples, both writer identities, no-change semantics, ownership/cancellation recovery, run-record privacy/retention, required live evidence, and targeted rollout/rollback in the extension README. No generated references or production runbook/dashboard are needed; explain this local-tool scope.
- [ ] Final verification: map every R1-R9 scenario to passing focused tests or recorded live evidence; require the complete three-stage feature and loop, not only helper tests. Confirm `/ship` removal, no fixed pools/prose transition parsing, no predecessor narrative sent to verify, and no round after a non-verified round.
- [ ] Run `npm test` then `npm run test:all` from `dot_pi/agent` while installed dependencies remain; expect all tests and extension smoke green. Runtime integration must run against Pi 1.5.0, not silently skip. Run TypeScript LSP diagnostics after final code changes.
- [ ] Remove disposable source `node_modules` after both gates. Inspect Git status and ensure test artifacts are outside the candidate. Preview reviewed explicit targets with `chezmoi --source "$PWD" diff <explicit-target-file>` from the worktree; inspect deletions too. Do not apply before the independent `/verify` gate.
- [ ] Commit guidance with `docs(pi): document implement coordinator operation and recovery`. Record documentation decisions, focused/full results, live report references, and any unresolved blocker in this plan.
- [ ] Hand off to a new independent `/verify` with stable writer identities and the absolute plan path. Do not claim final independent verification, apply targets, or repair findings in this task.

## Requirement Traceability
| Requirement | Tasks | Highest supported evidence |
|---|---|---|
| R1 Safe fixed unit | 2, 3, 4, 5, 6, 7 | Real Git/worktree tests, unit fixtures, lock contention, live refusal |
| R2 Native/fresh/models | 1, 2, 3, 6, 7 | Native RPC dispatch, observed state/session identity, child-config isolation tests |
| R3 Decisions | 1, 2, 3, 4, 6, 7 | Real bridge RPC dialog, correlation failures, live TUI approval/dismissal |
| R4 Typed settled outcomes | 1, 3, 4, 6, 7 | Actual tool events, fake-process lifecycle tests, live settled outcomes |
| R5 Simplify/verify | 2, 3, 4, 6, 7 | Real Git transitions, commit/push failure fixtures, live closeout |
| R6 Manual handoffs | 1, 2, 3, 7 | Native expansion round-trips and template contracts |
| R7 Bounds/ownership/cancel | 1, 3, 4, 5, 6, 7 | Competing processes, bounded stream tests, actual termination and live cancellation |
| R8 Reporting | 3, 4, 5, 6, 7 | Structured run records/final reports across terminal outcomes |
| R9 Slice loop | 5, 6, 7 | Multi-round conductor tests, per-round state tests, live two-slice run |

## Execution Notes
- This is one execution unit: complete all seven tasks or stop explicitly blocked. No `### Slice N` headings are used because partial transport/template work cannot establish the approved feedback slice.
- Preserve this planning provenance and add `### Execution` beneath `## Skills loaded and used` when execution starts. Update checkboxes and append evidence without changing approved requirements.
- Before implementation, run `/systematic-review` on this plan. If the documented fixture-provider/bridge integration or exact native task preservation fails, return to planning; do not introduce an unapproved interface or weaken evidence.
- This plan intentionally changes more than fifteen files. Apply the existing stack-split check before a draft PR. Internal protocol/template commits may be reviewed separately, but no partial delivery can claim the complete coordinator; ask before choosing a PR stack or overriding review boundaries.
- Planning changes only this file. No application, implementation, dependency installation, or runtime rollout is part of the planning commit.
