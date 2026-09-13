# /ship Conductor — Design Spec

> Status: brainstorm → design committed, awaiting `/plan`. First slice: 2-stage skeleton (`execute → verify`).

## Problem
After a design and plan are approved, the back half of the lifecycle — `execute → verify` — is a manual chore: type `/execute <plan>`, read the handoff, run `/model` to pick a different model, `/new`, paste `/verify <plan> --implemented-by <id>`. `/ship <plan.md>` automates the mechanics — spawn each stage in a fresh isolated context window under a distinct model, capture completion, hand off the implementation model id — while preserving every hard gate.

## User / audience
Matteo, solo, on the `maruina/dotfiles` chezmoi repo (personal profile).

## Goal
A `/ship <plan.md>` extension that runs `execute` then `verify`, each in a separate `pi` subprocess (`--mode json -p --no-session`) under a distinct model, surfacing the final `VERIFIED`/`BLOCKED` verdict.

## Non-goals
- The `simplify` middle stage (deferred — this is the 2-stage skeleton; adding it is a localized insert, not a redesign).
- Auto-repair on `BLOCKED` (a repair invalidates all prior evidence; the conductor stops and hands back).
- Overriding any hard gate: stack-split proposals, stop-and-ask, main/master refusal.
- A new model-config source of truth (reuse model pools declared in the extension).
- Changing the `/execute` or `/verify` prompts.
- Interactive model selection UX (hardcoded pools for the first slice).

## Context reviewed
- Pi extension docs (`docs/extensions.md`): `pi.registerCommand`, `pi.setModel`, `ctx.modelRegistry.find`, `ctx.waitForIdle`, `ctx.newSession`, `ctx.ui.notify`/`setEditorText`, `ctx.signal`.
- Built-in `examples/extensions/subagent/index.ts`: subprocess-per-task pattern — `spawn` of `pi --mode json -p --no-session --model <m>`, JSON event stream parsing (`message_end` → assistant message with `stopReason`/`model`/`usage`), `getPiInvocation` (resolve the `pi` binary), abort propagation. Example is not exported; conductor needs its own small equivalent.
- `examples/extensions/handoff.ts`: `ctx.newSession` + `withSession` replacement-session pattern (rejected for this design — see Alternatives).
- Existing `dot_pi/agent/exact_extensions/lifecycle-model-recommender/`: owns `LIFECYCLE_POLICY` per phase; intercepts `/execute` and `/verify` inputs. Both recommend the same model (GLM-5.2 xhigh), so naively reusing `recommended` for both stages would make `/verify` BLOCK on model-match. The conductor uses its own pools, not the recommender.
- `plans/pi-verification-contract/plan.md`: `/verify` reads the implementation model from `--implemented-by` and BLOCKs if it matches the verifier's own model; requires a fresh `/new` session under a different model; mandates exactly one top-level `VERIFIED`/`BLOCKED` verdict.
- `dot_pi/agent/exact_prompts/execute.md` and `verify.md`: terminal markers (see Completion Detection).
- `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`: worktree resolution via `git worktree list --porcelain` + `git -C <dir> rev-parse --show-toplevel`.
- `dot_pi/agent/package.json`: `test:unit` enumerates test files explicitly and must be updated; `test:all` includes smoke.
- `dot_pi/agent/models.json.tmpl`: model catalog (work profile). Verified thinking-level support per model (see Model Pools).
- pi-ai `google-shared.js` (`resolveGoogleThinkingLevel`), `google-generative-ai.js` (`getThinkingLevel`, `isGemini3FlashModel`, `getDisabledThinkingConfig`), `models.js` (`getSupportedThinkingLevels`, `clampThinkingLevel`, `EXTENDED_THINKING_LEVELS`): how pi maps and clamps thinking levels per provider/model.

### Model catalog findings (discovery)
- AI Gateway `/v1/models` returns only `{"id": "..."}` for all 675 entries — no `reasoning`, no `capabilities`, no thinking levels. The gateway is **not** a source of truth for thinking support; it only confirms which ids are advertised. Thinking levels come from the refresh-models curation (`curated-models.json`), with Confluence (page 7052100418) and vendor behavior as the authoritative sources.
- `databricks/system.ai.kimi-k3`: previously a catalog bug (`reasoning: false`, no `thinkingLevelMap`, contextWindow 128000, maxTokens 16384 — uncurated fallback). Fixed upstream (datadog-pi-packages `curated-models.json`) and reconciled in the dotfiles template (PR #64). Now correctly curated: `reasoning: true`, `thinkingLevelMap` with `low`/`high`/`max`, context 1048576, maxTokens 65536, input text+image — matching Confluence. Kimi-k3 joins the impl pool from day one.
- `gemini-3.8-flash`: already correctly curated. `thinkingLevelMap: { "off": null }` with `reasoning: true` means **off is not supported** (Gemini 3 Flash cannot disable thinking — confirmed by `getDisabledThinkingConfig`), and `minimal`/`low`/`medium`/`high` are supported (null-mapped entries are excluded; undefined-mapped non-xhigh/max entries are included per `getSupportedThinkingLevels`). Empirical probe confirmed: 63 thinking tokens by default; `thinkingBudget: 0` still yields a `thoughtSignature`. Max supported level is `high`; `--thinking max` clamps to `high` via `clampThinkingLevel`. No upstream fix needed.

## Skills loaded and used

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `codebase-research` | `prompt-required` | Brainstorm requires discovery before design for Medium work; correctness depends on existing extension patterns and the model-recommender interaction. | Located `lifecycle-model-recommender`, `pi-verification-contract` plan, `subagent` example, completion markers, repo test/worktree conventions, and the model-catalog/thinking-level bugs. |
| `resolve-worktree` | `agent-selected` | Conductor must resolve a plan path to its owning worktree to set subprocess `cwd`. | Confirmed `git worktree list --porcelain` enumeration and `git -C <dir> rev-parse --show-toplevel` as the worktree-root resolution the conductor replicates. |
| `atlassian-mcp` | `user-requested` | User asked to check Confluence for gemini thinking levels. | Confirmed kimi-k3 reasoning levels (low/high/max) on page 7052100418; confirmed gemini-3.8-flash absent from the OSS-models table; cross-checked the "Models testing status" page (no thinking-level data). |

### Advisory learning lookup
`Datadog/Learnings.md` returned 0 matching sections for terms `pi extension`, `subprocess`, `print mode`, `slash command`, `session isolation`, `pi-coding-agent`. No advisory guidance applies. Obsidian was available; the store simply had no matching content. No learning is cited in this spec.

## Assumptions
- Prompt delivery: the conductor reads the *rendered* `~/.pi/agent/prompts/{execute,verify}.md`, substitutes `$ARGUMENTS`, and passes the expanded text as the subprocess task. This decouples from unverified print-mode `/` expansion (the subagent example passes free-text tasks, not `/commands`; docs only document `/template` expansion in the interactive editor).
- `--implemented-by` carries execute's concrete `--model` id (the conductor sets `--model <provider/id>`, so it knows the id). The conductor also confirms execute completed by parsing its handoff marker before proceeding to verify.
- Shared state across stages is the git worktree on disk (commits/staged changes persist); sessions are isolated via `--no-session`.
- "Automatic" = no manual command-typing/model-picking; still stops on every gate.
- The conductor runs in the user's interactive session and spawns/awaits children; it is never replaced, so the `ctx.newSession()` stale-context footgun does not apply.

## Design overview

### Command surface
`/ship <plan.md>` — single positional argument, a path to a committed `plan.md` (relative to cwd, absolute, or worktree-relative). Resolves to the owning worktree (resolve-worktree algorithm); all subprocesses run with `cwd` = that worktree's toplevel.

### Architecture: subprocess-per-stage
Reuse the proven `subagent` pattern. The conductor:
1. Resolves the plan path → worktree root.
2. Pre-flights: refuse if the resolved worktree is on `main`/`master`; refuse if either pool is empty; refuse if the plan file is missing/uncommitted.
3. Picks implementer model from the impl pool; picks verifier model from the verify pool, excluding the implementer's model; fails if no distinct verifier is available.
4. Spawns execute subprocess, awaits, parses completion.
5. On clean execute completion, spawns verify subprocess with `--implemented-by <execute-model-id>`, awaits, parses verdict.
6. Surfaces the verdict (or the failing stage's last assistant message on a hard stop).

Each subprocess: `pi --mode json -p --no-session --model <provider/id> --thinking max --cwd <worktree-root> <expanded-prompt-text>`. The conductor parses the JSON event stream line-by-line (`message_end` events → assistant messages), captures the final assistant message, and extracts the stage's terminal marker.

### Model pools
Declared as data in the extension. All stages pass `--thinking max`; pi's `clampThinkingLevel` clamps per model.

- **Implementation pool:** `baseten/zai-org/GLM-5.3`, `baseten/zai-org/GLM-5.3-Flash`, `baseten/deepseek-ai/DeepSeek-V4-Flash-0731`, `databricks/system.ai.kimi-k3`.
- **Verification pool:** `baseten/zai-org/GLM-5.3-Flash`, `baseten/deepseek-ai/DeepSeek-V4-Flash-0731`, `gemini-3.8-flash`.
- Conductor picks implementer from impl pool, verifier from verify pool minus implementer, enforces verifier ≠ implementer. `deliberate:` first-slice selection rule is round-robin or first-available; a smarter selection is a follow-up.

### Completion detection
The stages signal completion via natural-language markers in the final assistant message, not structured events. The conductor parses the final assistant message:

- **Execute:** regex `^Implementation model: `(.+?) \((.+?)\)`$` (line 180 of `execute.md`). Extracts model name and id. If the conductor set `--model <provider/id>`, it cross-checks the parsed id against the set id; mismatch is a hard stop (marker present but inconsistent). If the marker is absent → hard stop (execute did not reach its handoff).
- **Verify:** the final assistant message is a 7-section report (Target and scope, Risk and review, Fresh evidence, Skills loaded and used, Findings, State comparison, Next action) **ending with** exactly one top-level verdict line. The conductor finds the last line matching `^(VERIFIED|BLOCKED)\s*$` (trimmed, case-sensitive). Absent → hard stop (verify did not reach its verdict).

The conductor proceeds execute → verify only when execute's marker is present and consistent. It reports the verify verdict as the terminal state.

### Hard stops
"Automatic" automates mechanics, not gates. The conductor stops and hands back to the user (via `ctx.ui.notify` + `ctx.ui.setEditorText` with the failing stage's last assistant message) on:
- Resolved worktree on `main`/`master`.
- Missing or uncommitted plan file.
- Empty pool or no distinct verifier available.
- Execute marker absent or inconsistent with the set `--model`.
- Verify verdict absent.
- Verify verdict `BLOCKED` — **no auto-repair** (a repair invalidates all prior evidence; the verify prompt mandates a fresh re-run).
- Any stop-and-ask emitted by a stage (detected via the stage not reaching its terminal marker, or a non-zero exit with an incomplete final message).
- Subprocess non-zero exit, abort, or error.

The conductor never edits, commits, pushes, opens/updates PRs, switches branches, or repairs. It only spawns read-only-ish subprocesses that themselves obey their prompt hard gates.

### `--implemented-by` handoff
The conductor sets `--model <provider/id>` for the execute subprocess, so it knows the implementation model id. It passes that id as `--implemented-by <id>` to the verify subprocess. The verify prompt reads `--implemented-by` and BLOCKs if it matches the verifier's own model; the conductor additionally guarantees `model_verify ≠ model_execute` by pool construction, so the model-separation guard passes by construction.

### Prompt delivery
The conductor reads `~/.pi/agent/prompts/execute.md` and `verify.md` (the rendered templates), substitutes `$ARGUMENTS` with the plan path (execute) or `<plan-path> --implemented-by <id>` (verify), and passes the expanded text as the subprocess task argument. This makes the exact prompt per stage deterministic from the template + args, and decouples from print-mode `/` expansion behavior.

### getPiInvocation equivalent
`getPiInvocation` from the subagent example is not exported. The conductor needs its own small equivalent: resolve the `pi` binary (prefer `process.execPath` + current script when run under a non-generic runtime, else `pi` on PATH). `deliberate:` copied from the subagent example; revisit if pi exports it in a future version.

## Alternatives considered

### A — `ctx.newSession()` per stage (rejected)
Use the session-replacement API to chain stages in-process. Rejected because the docs document a real footgun: after replacement, captured old `pi`/`ctx`/`sessionManager` objects are stale and throw if used, and `withSession` runs in the old closure after the old instance's shutdown. Chaining three replacements (or even two) in one command handler would require careful state-machine discipline and re-establishing extension state across each replacement. The subprocess approach sidesteps this entirely: the conductor is never replaced, and each stage gets a genuinely clean context window. Merit of A: no subprocess spawn overhead; in-process model switch via `pi.setModel`. But the isolation guarantee is weaker and the footgun risk is real.

### B — Reuse `lifecycle-model-recommender` policy (rejected)
The existing recommender maps each phase to recommended/lowerCost/increaseQuality, but `/execute` and `/verify` both recommend the same model (GLM-5.2 xhigh), so naively using `recommended` for both stages would make `/verify` BLOCK on model-match. The conductor needs distinct models per stage by construction, which the recommender's single-model-per-phase policy doesn't provide. Merit of B: one source of truth for lifecycle model choices. But it doesn't solve the distinct-model requirement, and the pools here are deliberately different (flash-tier models for cost/speed at max thinking). The recommender remains useful for its own interactive purpose; the conductor doesn't displace it.

### C — Rely on print-mode `/` expansion (rejected)
Pass `/execute <plan>` as the subprocess task and rely on pi expanding the slash command in print mode. Rejected because docs only document `/template` expansion in the interactive editor, and the subagent example passes free-text tasks, not `/commands`. The expansion behavior in print mode is unverified. Reading and expanding the template in the conductor is deterministic and reviewable. Merit of C: zero template-reading code in the conductor. But it depends on unverified behavior; the explicit expansion is safer.

## Risks and mitigations

- **Completion-marker parsing fragility.** Markers are natural-language; a stage could emit a near-marker or omit it. Mitigation: strict regex on the final assistant message; absent/inconsistent marker is a hard stop (never guess). Test the parser against positive and negative fixtures.
- **Stage hangs or rate-limits.** Subprocess could hang or hit 429s. Mitigation: abort propagation via `ctx.signal`/child process kill; the conductor does not retry (retry is the stage's own responsibility per its prompt). A configurable timeout is a follow-up, not first-slice.
- **Model unavailable/unauthenticated.** A pooled model may lack auth. Mitigation: pre-flight `ctx.modelRegistry.find` + auth check before spawning; fail fast with a clear message.
- **Stale plan path / wrong worktree.** Mitigation: resolve-worktree algorithm; refuse if the plan is missing or uncommitted.
- **`--implemented-by` id mismatch.** The conductor sets `--model` so it knows the id, but execute's handoff marker names a model from the injected `## Current Model` context. Mitigation: cross-check the parsed id against the set id; mismatch is a hard stop.

## Operability
- No background resources; subprocesses are awaited and abort-propagated (Ctrl+C kills children, per subagent pattern).
- No new runtime dependencies (reuse `node:child_process`, `typebox`, package types already in devDeps).
- Ownership: Matteo. Not paged. Failures are surfaced via `notify` + editor text, not silent.
- Observability: the conductor logs each stage's spawn (model, cwd), the parsed marker/verdict, and any hard stop to the chat. No metrics/traces (dev tool, not paged).

## Rollout and rollback
- Rollout: add the extension file + tests; update `test:unit` enumeration; `/reload` picks it up. No migration.
- Rollback: delete the extension file + tests; revert `test:unit`. No state to clean up (subprocesses are `--no-session`).

## Security / data-handling
- The conductor spawns `pi` subprocesses with the user's environment (inherits auth). It does not handle credentials directly.
- Prompt expansion reads `~/.pi/agent/prompts/*.md` (rendered templates); no secrets in templates.
- No new network calls; the subprocesses make their own gateway calls via the user's existing auth.
- `--implemented-by` carries a model id, not a secret.

## Testing strategy
- **Unit tests** (added to `test:unit` enumeration):
  - Prompt expansion: `$ARGUMENTS` substitution for execute and verify; correct arg shape per stage.
  - Execute marker parsing: positive (extract name + id), negative (absent, malformed, inconsistent id).
  - Verify verdict parsing: positive (`VERIFIED` and `BLOCKED` as last line within a 7-section report fixture), negative (absent, mid-message false positive, lowercase).
  - Model-difference enforcement: verifier picked from verify pool minus implementer; fail when no distinct verifier.
  - Main/master refusal: resolved worktree branch check.
  - Pool construction: all four impl models and all three verify models resolve with `max` support (gemini-flash clamps to `high`).
- **Smoke test** (`test:smoke` already runs `pi --list-models`): the extension loads without errors.
- **Manual validation**: run `/ship` against a real committed plan in a feature worktree; confirm `VERIFIED`; then run against a plan whose execute hits a stop condition; confirm the conductor stops and surfaces the message. Redact credentials; delete disposable worktrees afterward.

## Open questions
1. **Implementer selection rule** — round-robin, first-available, or cheapest-first? First-slice: first-available. Confirm in `/plan`.
2. **Timeout** — should the conductor impose a per-stage timeout, or rely on the stage's own behavior + manual Ctrl+C? First-slice: rely on stage + manual abort; timeout is a follow-up. Confirm in `/plan`.
3. **Thinking level source** — pass `--thinking max` uniformly (pi clamps), or read each model's max supported level and pass per-model? First-slice: uniform `max` (simpler; pi clamps correctly per discovery). Confirm in `/plan`.

## Self-review (skeptical staff engineer)
- **Downside of the chosen direction (explicit):** subprocess-per-stage spawns two `pi` processes per `/ship`, adding startup overhead and making the conductor's output less integrated than an in-process chain. This is the cost of genuine context isolation and avoiding the `ctx.newSession()` footgun. Acceptable for a dev tool run a few times a day.
- **Alternative merits (genuine):** A (in-process) avoids spawn overhead and gives tighter UX integration; B (recommender policy) offers one source of truth; C (print-mode expansion) avoids template-reading code. Each was rejected for a concrete reason, not dismissed.
- **Rejected finding — "parse the full verify report for structured findings":** considered extracting the Findings section programmatically. Rejected: the verdict line is the only signal the conductor needs to act on; structured findings are for the human reader, surfaced via the editor text. Adding report parsing is unrequested scope.
- **Rejected finding — "auto-retry verify on BLOCKED":** rejected outright; it violates the verify prompt's "a repair invalidates all prior evidence" and the no-auto-repair gate. Recorded here so a future reader doesn't reintroduce it.
- **Verified:** the design reuses the proven subagent pattern rather than reimplementing; paths are repo-relative inside the spec; no placeholders; the model-separation guarantee is by construction; hard stops are explicit.
