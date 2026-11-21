# Lifecycle Stage Runner Design
Status: Approved

## Problem
`dot_pi/agent/exact_extensions/ship-conductor/` contains 11,973 lines of TypeScript and tests to run `/implement <plan-path>`. That extension maintains custom bidirectional RPC framing (`_spawn.ts`), child-only bridge tools (`lifecycle_request_decision` and `lifecycle_submit_outcome` in `_bridge.ts`), dual-mode bridge instructions across lifecycle prompts (`execute.md`, `simplify.md`, `verify.md`, `arp-review.md`, `arp-fix.md`), and per-slice `simplify` and `verify` state tracking (`_conductor.ts`, `_unit.ts`). Because the coordinator couples orchestration to custom RPC and slice-scoped verification, it is expensive to maintain and does not generalize to the interactive front half of the lifecycle (`/brainstorm`, `/systematic-review`, and `/plan`).

The goal is to replace `ship-conductor` with a small, deterministic stage runner built on native Pi 1.6.0 (`pi --mode json` and `pi --session`), a structured JSON handoff file, and Rex pane escalation. The same primitives must support hands-off post-plan execution (`execute → simplify → verify`), interactive recovery in Rex when a stage stops or fails, automated handoffs in the front half (`brainstorm → systematic-review → plan`), and automatic work-profile PR/ARP completion (`pr-publish → arp-review → arp-fix → verify`) when `verify` returns `VERIFIED`.

## Context reviewed
- **Repository baseline (`84b3dcd`):** `dot_pi/agent/exact_extensions/ship-conductor/` owns slice execution, model selection, clean-worktree and plan-progress checks, interactive session-model recovery, and the work-profile PR/ARP completion loop (`pr-publish → arp-review → arp-fix → verify`).
- **Session `01a1f540-7285-71f4-8486-309df1f955f8`:** Investigated blocked `/implement` run `28bdc912` on `maruina/rex-design-review`, where `execute` stopped early without a concrete blocker and recovery retried unchanged state. That investigation produced PR #164 (structured blocker payloads and deterministic recovery checks) and highlighted the high cost of maintaining dual-mode prompt contracts and RPC state in `ship-conductor`.
- **`maruina/rex-design-review` (`dot_pi/agent/exact_extensions/design-review/index.ts`, 283 LOC):** Demonstrates local Rex verification (`rex whoami --json`, `block inspect`), anchored horizontal splits (`session.new_split`), `ctx.scopedModels` selection excluding the active model, and a file-based startup handshake (`request.json`, `split.json`, `started.json`) without `npm:pi-subagents`.
- **Pi 1.6.0 documentation (`docs/json.md`, `docs/sessions.md`):** `pi --mode json` (without `--no-session`) emits the session header (`{"type":"session","id":"..."}`) as its first JSONL record, streams live `tool_execution_start`/`end`, `turn_start`/`end`, `message_end`, and `agent_settled` events on stdout, persists a standard `.jsonl` session file, and exits when the prompt settles. Interactive `pi --session <id-or-path>` resumes that exact persisted session.
- **`npm:pi-subagents` (0.89.2, `nicobailon/pi-subagents`):** Provides agent definitions, chains, model override precedence, FleetView observability, and `outputSchema` validation, but documents `interactive: true` as parsed for compatibility and not enforced.
- **Advisory learning lookup (`Datadog/Learnings.md`):** Scoped search for `ship-conductor`, `pi-subagents`, `subagent`, `rex`, `implement`, `verify`, and `lifecycle` returned six unrelated sections and no prior Pi lifecycle learnings.

## Goals and non-goals
### Goals
- Run post-plan implementation hands-off as a **sliced `execute` loop → single `simplify` → single `verify`**, printing compact live progress lines in the invoking Rex pane.
- Enforce safety checks deterministically in code (not in a coordinator LLM): clean worktree after every successful write stage, `HEAD` advancement after every `execute` slice, bounded loop iterations, and writer-vs-verifier model independence across both automated runs and interactive recovery.
- Keep semantic plan-fidelity judgment inside `verify`.
- Escalate failures, blockers, or dirty worktrees to an interactive Rex split pane: resume `pi --session <id>` for `execute` or `simplify` failures with a resumable session (otherwise stop and report the error), and open a fresh writer-model Rex pane (never resuming or editing inside the `verify` session) for a non-`VERIFIED` outcome while another verifier attempt remains.
- Eliminate custom RPC framing and dual-mode bridge tools (`lifecycle_request_decision`, `lifecycle_submit_outcome`).
- Design the stage contract and Rex launcher as reusable primitives so later slices can automate `brainstorm → systematic-review → plan` (auto-approving and launching `/plan` on a clean review) and trigger the work-profile `pr-publish → arp-review → arp-fix → verify` completion loop automatically when `verify` returns `VERIFIED`.

### Non-goals
- Using `npm:pi-subagents` as the orchestration runtime.
- Mid-run interactive popup dialogs inside headless stages; decisions that require human input stop the stage and escalate to an interactive Rex pane.
- Deleting `ship-conductor` or changing `/brainstorm`, `/systematic-review`, `/plan`, or PR/ARP completion in Slice 1.
- Automatically marking PRs ready, merging PRs, or deploying services.

## Assumptions
- Stage prompts can reliably write a small, strict JSON handoff file to a runner-specified path outside the repository without custom bridge tools. Slice 1 tests this directly against real models.
- The user runs Pi 1.6.0 inside a local Rex terminal with a nonempty `/scoped-models` list containing at least two available models (so writer and verifier models remain distinct).
- Auto-approving `Status: Approved` and auto-launching `/plan` when `/systematic-review` finds no unresolved questions or blocking findings (Slice 3) is an accepted policy tradeoff that trades explicit author sign-off on clean reviews for lower friction.

## Smallest user-feedback slice and phased roadmap
### Slice 1 (first deliverable): Reusable stage runner for `execute → simplify → verify`
Build the deterministic stage runner (`pi --mode json` + live progress formatter + JSON handoff validation + deterministic Git and model checks + Rex anchored split escalation) and expose it behind a standalone entry command while keeping `ship-conductor` and `/implement` untouched as fallback.

- **What the user sees:** You launch a run against a committed plan in a feature worktree, pick three models once upfront: one for `execute`, one for `simplify`, and one for `verify` (`execute` and `simplify` can share a model; verifier choices exclude both), and watch live progress lines in the Rex pane as each `execute` slice, then `simplify`, then `verify` runs hands-off. If a writer fails before Pi saves a resumable session, the runner reports the startup error and stops. For other failures, blockers, or dirty files, Rex opens an interactive split pane (`pi --session <id>` for writer stages, or a fresh pane on the `execute` model for `verify` if another attempt remains) so you can fix or inspect the issue and resume.
- **What we learn:** Whether native `pi --mode json`, prompt-written JSON handoff files, and `pi --session` Rex resume reliably replace `ship-conductor`'s RPC bridge on authenticated runs, and whether sliced `execute` followed by single `simplify → verify` keeps context bounded while reducing overhead.
- **Why no smaller slice produces this feedback:** Running `pi --mode json` on a single prompt does not test stage-to-stage handoffs, Git cleanliness gates, sliced `execute` looping, or writer-vs-verifier isolation across Rex recovery.

### Deliberately deferred slices
- **Slice 2 (Cutover and cleanup):** Point `/implement` to the stage runner, delete `dot_pi/agent/exact_extensions/ship-conductor/`, and remove dual-mode bridge blocks from `execute.md`, `simplify.md`, `verify.md`, `arp-review.md`, and `arp-fix.md`. Retiring `ship-conductor` does not wait for Slice 4: between Slice 2 and Slice 4, `/implement` stops at `VERIFIED` in both personal and work profiles, and work-profile users manually publish the verified branch, open or update the PR, and request or handle ARP review until Slice 4 lands.
- **Slice 3 (Front-half lifecycle reuse):** Reuse the stage runner and Rex launcher for `brainstorm → systematic-review → plan`. After `/brainstorm` commits `design.md` as `Draft`, run `/systematic-review` with an independent model; if the handoff JSON reports no unresolved questions or blocking findings, automatically commit `Status: Approved` and open `/plan` in a Rex pane. If questions or blocking findings remain, resume the reviewer session interactively in a Rex pane.
- **Slice 4 (Work-profile PR/ARP completion loop):** Restore automatic work-profile completion by starting `pr-publish → arp-review → arp-fix → verify` on the same stage runner when `verify` returns `VERIFIED`, preserving the safe commit-and-verify ordering (`arp-fix` commit → feature-scope `verify` → `pr-publish` verified head → `arp-review` settlement and re-review), bounded to three reviewed heads and a 20-minute deadline per head.

## Design overview
### Architecture
The runner is a deterministic Node.js/TypeScript CLI script (with an optional thin Pi command wrapper for upfront model selection from `ctx.scopedModels`). It makes no model calls of its own. All lifecycle judgment stays in the stage prompts (`execute.md`, `simplify.md`, `verify.md`) and the user.

```text
[Runner (deterministic script)]
  1. Preflight: canonical plan path, clean feature worktree, non-main branch, cooperative lock
  2. Model selection: execute model + simplify model + independent verifier model (verifier != execute model and != simplify model)
  3. Sliced execute loop (max 20 iterations, while plan has unchecked tasks):
       spawn `pi --mode json --provider <p> --model <m> --thinking <t>`
       stream NDJSON stdout -> compact progress lines in invoking Rex pane
       capture session_id from first JSONL record (`type: "session"`)
       validate handoff JSON + clean worktree + HEAD advanced
       on failure/blocker/dirty/failed progress gate/timeout -> use writer recovery below; stop if no resumable session
       at 20 iterations with unchecked tasks remaining -> print remaining tasks and stop (no recovery split)
  4. Single simplify stage (simplify model, feature diff `base..HEAD`):
       spawn `pi --mode json`, validate handoff JSON + clean worktree
       on failure/blocker/dirty -> same writer recovery as execute
  5. Single verify stage (independent verifier model, feature diff `base..HEAD`):
       spawn `pi --mode json`, validate handoff JSON (`VERIFIED` | `BLOCKED`) + clean worktree
       on any non-`VERIFIED` outcome (`BLOCKED`, non-zero exit, missing/invalid JSON, timeout, dirty worktree) ->
         if the run has exhausted its verifier attempts, report the failure and stop; otherwise
         open Rex split with a fresh WRITER session on the execute model (never resume verifier session),
         seeded with findings (`BLOCKED`) or failure reason + stderr + verifier artifact/session paths
       after recovery Pi exits -> close its split if still open -> re-check clean worktree + model independence -> start a fresh `verify` run
  6. Terminal state (Slices 1–3): `VERIFIED`; between Slice 2 and Slice 4, work-profile users publish and handle PR/ARP manually (Slice 4 restores automatic `pr-publish → arp-review → arp-fix → verify`)
```

### Stage invocation and progress visibility
Each hands-off stage runs as a child `pi --mode json` process with explicit `--provider`, `--model`, `--thinking`, and `--session-dir <run-session-dir>` (never `--no-session`). The runner reads stdout as an LF-delimited byte stream (not Node `readline`, per `docs/json.md`, because Unicode line separators can appear inside JSON strings):
- Record 1 (`{"type":"session","id":"..."}`) supplies the exact `session_id` needed for interactive Rex recovery.
- `tool_execution_start`, `tool_execution_end`, `turn_start`, `turn_end`, and `agent_settled` drive compact live status lines in the invoking Rex pane (stage name, slice number, active tool, elapsed time, turn count).
- A headless attempt is eligible for automatic advancement only after the process exits 0 and emits `agent_settled` with `aborted: false`.

### Structured JSON handoff contract
Before launching a stage, the runner creates a unique output path inside a private run directory outside the repository (e.g., `~/.pi/agent/lifecycle-runs/<run-id>/handoffs/<stage>-<attempt>.json`) and passes that path in the stage prompt. Because the handoff file lives outside the repository, writing it never dirties `git status`.

The runner validates the JSON file strictly (UTF-8, size <= 64 KiB, required fields, closed status enum) before advancing:
- **Writer stages (`execute`, `simplify`):** `{ "schemaVersion": 1, "stage": "execute"|"simplify", "status": "success"|"blocked", "summary": "...", "blocker"?: { "step": "...", "reason": "...", "evidence": "...", "nextAction": "..." } }`.
- **Verifier stage (`verify`):** `{ "schemaVersion": 1, "stage": "verify", "status": "VERIFIED"|"BLOCKED", "summary": "...", "findings"?: [ ... ] }`.
- **Missing or invalid JSON:** Treated as a stage failure (never parsed from prose fallback) and handled by the stage's recovery rule below.

### Deterministic transition gates
The runner enforces these invariants in code between every stage:
1. **Clean worktree:** `git status --porcelain=v1 --untracked-files=all` must be empty after any stage claiming `success` or `VERIFIED`.
2. **Forward progress on sliced `execute`:** Each `execute` iteration must advance `HEAD` (commit at least one change) and reduce unchecked `- [ ]` tasks in `plan.md`, bounded to 20 iterations. If a plan has no `### Slice N` headings, `execute` runs once and must check off all tasks.
3. **Writer-vs-verifier model independence:** Every model that writes commits during the run (`execute`, `simplify`, and any interactive Rex recovery pane) is recorded as `(provider, modelId)`. The runner refuses to start `verify` if the verifier model matches any recorded writer.
4. **Plan fidelity boundary:** The runner pins the starting baseline commit and checks that `plan.md` exists and is committed; semantic verification that the implementation matches the plan stays inside `verify`.

### Interactive Rex escalation and recovery
When a stage stops (non-zero exit, missing/invalid handoff JSON, `status: "blocked"`, `status: "BLOCKED"`, or dirty worktree):
- **Writer gate failure or timeout:** A writer stage also stops when its handoff reports `success` but the forward-progress gate fails, or when the stage reaches its timeout. On timeout, the runner sends `SIGTERM` to the child. Both cases use the writer recovery below. When the `execute` loop reaches 20 iterations and unchecked tasks remain, the runner prints the remaining unchecked tasks and stops. It does not open a recovery split.
- **Local Rex verification:** Reuse the verified local Rex pattern from `maruina/rex-design-review` (`rex whoami --json`, matching `REX_SESSION`/`REX_BLOCK`, anchored `session.new_split` with direct argv and no shell-string interpolation).
- **Writer failure (`execute` or `simplify`):** If the failed writer has no resumable session, the runner reports the stage and error in the invoking pane and stops. It does not open a split, retry, or advance. This includes startup failure before Pi emits the session header or saves the session file. If the failed session is resumable, launch interactive `pi --session <session-file> --provider <failed-stage-provider> --model <failed-stage-model>` (the selected `execute` or `simplify` model) in the Rex split so the user lands directly in the failed conversation with full tool history.
- **Any non-`VERIFIED` `verify` outcome (`verify`):** `verify` has two outcomes: `VERIFIED` and anything else (`BLOCKED`, non-zero exit, missing or malformed handoff JSON, timeout, or dirty worktree). For any non-`VERIFIED` outcome, never resume the `verify` session (`pi --session <verifier-id>`), because editing in that session would make the verifier model a writer. Count each headless `verify` launch, including the first and any that fail during startup, against a finite per-run limit. Recovery does not reset this count. On the last allowed attempt, accept a valid `VERIFIED` as usual; otherwise stop without opening another pane and print the last failure and available artifact paths. If attempts remain, launch an interactive Rex split running a fresh Pi session on the selected `execute` model, seeded with:
  - for a valid `BLOCKED` verdict: the verifier's `summary` and structured `findings`;
  - for any failure without a valid verdict: the failure reason (exit code, JSON validation error, timeout, or dirty worktree), the bounded verifier stderr, and the paths to the raw handoff file (if present) and persisted verifier session file so the user can inspect them.
  In the writer-model pane, the user can fix code, clean a dirty worktree, inspect the verifier artifacts, or make no edits (for a transient crash) and exit Pi.
- **Resuming the run:** The runner waits for the interactive recovery Pi process to exit. An idle prompt is not completion, and there is no readiness override. Once Pi exits, the runner closes that recovery split if it is still open. Only then does it check worktree cleanliness, record the recovery session's models as writers, and check writer-vs-verifier independence. If either check fails, the run stops and preserves the operator's work. Otherwise the next action depends on the failed stage:
  - **`execute` or `simplify`:** For `execute`, apply the forward-progress gate against `HEAD` and the plan at the start of the failed attempt, not at the start of recovery. For `simplify`, no new commit is required. If a gate fails, stop. Otherwise show the commit and task changes (including no changes) in the runner pane and ask the operator to accept the recovered slice or stage as complete. Only explicit approval replaces the writer success handoff: advance without rerunning the completed work. Without approval, stop and preserve the work.
  - **`verify`:** Start a fresh headless `verify` with the independent verifier model. Operator approval cannot replace its verdict.

### Reuse across Slices 3 and 4
- **Slice 3 (`brainstorm → systematic-review → plan`):** Uses the same Rex split launcher for interactive `/brainstorm` and `/plan`, and runs `/systematic-review` via `pi --mode json` with a `review` handoff schema (`clean` | `needs-human`). When `clean`, the runner commits `Status: Approved` and launches `/plan` in a Rex pane; when `needs-human`, it opens a Rex split running `pi --session <reviewer-session-id>`.
- **Slice 4 (PR/ARP completion):** Adds `pr-publish`, `arp-review`, and `arp-fix` stage definitions on the same runner, triggered automatically after `verify` returns `VERIFIED` in the work profile, with deterministic bounds (max 3 reviewed heads, 20-minute deadline per head, exact verified-head publish before ARP settlement/re-review).

## Risks and mitigations
- **Model omits or misformats the JSON handoff file:** Without a custom `lifecycle_submit_outcome` tool, a model can finish a turn without writing valid JSON. *Mitigation:* Treat missing or schema-invalid JSON as a stage failure and never fall back to prose parsing. Stop and report the error if no resumable writer session exists. Otherwise, escalate writer failures to a Rex split running `pi --session <id>` so session context is preserved, and escalate `verify` to a fresh writer-model Rex split seeded with the failure reason, bounded stderr, and the verifier session and raw handoff paths so the user can inspect or retry without opening writes in the verifier session. If live trials repeatedly require operator intervention solely for missing or malformed handoffs, evaluate schema-enforced results before cutover. Do not retry a writer automatically to repair its output format.
- **Interactive recovery silently breaks model independence:** A user could switch models inside an interactive Rex recovery pane to the model selected for `verify`. *Mitigation:* Read the persisted session file's model-change entries after the interactive recovery Pi process exits and refuse to run `verify` if any writer turn used the verifier model.
- **Failed or uncertain Rex split creation leaves orphan panes:** A Rex RPC call can fail, or time out after creating a split. *Mitigation:* When `session.new_split` fails or its result is uncertain, never retry. Print the exact recovery command (`pi --session <id>` for writer stages, or the fresh `execute`-model `pi` command plus verifier artifact paths for `verify`) and the Rex session and pane IDs, then stop. After a definite failure, no recovery process exists, so the runner releases the lock. After an uncertain result, the retained-lock rule in "Cancellation and timeouts" applies.
- **Unbounded `execute` loop on a stuck slice:** A slice that commits without checking off plan tasks could loop indefinitely. *Mitigation:* Require both `HEAD` advancement and unchecked-task reduction per slice, capped at 20 iterations.
- **Auto-approval in Slice 3 approves a design the author did not re-read:** When `/systematic-review` applies mechanical fixes and auto-commits `Status: Approved`, the author does not review the final diff before `/plan` starts. *Mitigation:* Explicitly accepted by the user; restrict auto-approval to runs with zero unresolved questions and zero blocking findings, and surface the committed diff summary at `/plan` start.

## Operability
- **State layout:** Store run records, handoff JSONs, session files (`--session-dir`), and cooperative worktree locks under `~/.pi/agent/lifecycle-runs/` with mode `0700` directories and `0600` files. Retain the latest 100 completed runs and prune older bundles.
- **Concurrency:** Hold a cooperative worktree lock keyed by canonical worktree path; refuse to start a second run on the same worktree and never steal a lock while its owning PID is alive.
- **Cancellation and timeouts:** Handle `SIGINT`/`SIGTERM` by forwarding `SIGTERM` (then `SIGKILL` after 5 seconds) to the active `pi --mode json` child, releasing the worktree lock only after child exit is confirmed, and printing the `session_id` (if available) for manual inspection. Apply a configurable per-stage inactivity/wall-clock timeout to headless stages. During interactive recovery, Ctrl-C in the runner pane cancels the whole run. Start no further stages, stop the recovery Pi process, and confirm its exit before closing its split and releasing the lock. Do not revert edits or commits. If exit cannot be confirmed, the runner keeps the lock and records the runner PID and, when known, the recovery `pi` PID. A dead runner PID alone does not prove the recovery writer has exited. A later run takes over the lock only when every recorded PID is no longer alive. Otherwise it refuses to start and prints the lock file path and the recovery Rex pane ID. When no recovery PID was recorded, the operator deletes the printed lock file after checking the pane. *Deliberate limit:* PID reuse can keep a stale lock in place; this fails safe, and manual deletion of the lock file clears it.
- **Observability:** Print concise stage, slice, tool, and elapsed-time lines to the invoking Rex pane; persist full stage stderr (bounded to 16 KiB) and handoff JSONs in the run directory for post-mortem inspection. For each advance, record the stage and attempt and distinguish a validated writer success handoff, explicit operator acceptance of a recovered writer, and a fresh `VERIFIED` verdict. Pane closure is not evidence of approval.

## Rollout and rollback
- **Rollout (Slice 1):** Develop and verify in a disposable feature worktree, run unit tests (`npm test`, `npm run typecheck`) and one authenticated live trial, then apply only the new files under `dot_pi/agent/` via `chezmoi --source "$PWD" apply <explicit-targets>`. Keep `ship-conductor` and `/implement` intact until Slice 2. When Slice 2 retires `ship-conductor` before Slice 4 lands, `/implement` stops at `VERIFIED` in both profiles and work-profile users manually publish and handle PR/ARP review during that interim window.
- **Rollback (Slice 1):** Revert the new runner files and apply the same explicit chezmoi targets. Existing `/implement` (`ship-conductor`) and direct `/execute`, `/simplify`, `/verify` prompts remain unaffected.

## Security and data handling
- Run directories, handoff files, and persisted stage sessions stay local under `~/.pi/agent/lifecycle-runs/` (`0700`/`0600`) and the runner neither commits them to the target repository nor uploads them. Local file permissions protect data at rest; Pi can include content it reads in requests to its configured model provider.
- Spawn `pi` and `rex` with argument vectors (`execFile`/`spawn`), never shell-interpolated strings, and validate canonical absolute paths for the plan and worktree.
- Verify the invoking local Rex endpoint (`unix://`, local UID, matching `REX_SESSION`/`REX_BLOCK`) before calling `session.new_split`.
- A fresh Pi session is context isolation, not a filesystem sandbox; stage prompts continue to own repository write restrictions.

## Testing strategy and validation limits
### Testing strategy
- **Unit tests:** Cover LF-only JSONL stream parsing, handoff JSON schema validation (valid, missing, oversized, malformed), Git preflight and clean-worktree/HEAD-advance checks, sliced `execute` loop termination and bounds, writer-vs-verifier model-independence enforcement (including post-recovery session inspection), and Rex failure/uncertain-split handling.
- **Isolated integration tests:** Drive a fake/fixture `pi --mode json` process to verify live progress streaming, `agent_settled` gating, and recovery branching (including writer `pi --session` resume and fresh writer-model escalation plus fresh `verify` restart for both `BLOCKED` and no-verdict `verify` failures) without network calls. Simulate a writer failing before it emits a header or saves a session: assert the runner reports the stage and error, opens no split, and stops. Keep a fixture recovery process idle, then exit it: assert no stage starts while it is alive and that cleanup targets only its split before the checks run.
- **Live authenticated trial (required before Slice 2 cutover):** Run a real multi-slice plan in a disposable worktree through Slice 1, verifying the hands-off happy path, Rex `pi --session` escalation for a writer blocker, and fresh writer-model Rex escalation for a non-`VERIFIED` `verify` outcome. Confirm the runner waits while recovery Pi is idle and leaves no recovery split after Pi exits. Record first-attempt valid handoffs out of total stage invocations, the number of interventions caused solely by missing or malformed handoffs, and whether the reopened writer session ID matches the failed writer. One trial establishes feasibility, not a reliability rate.

- **Recovery transition tests:** Simulate approval and refusal after writer exit. Check that approval cannot bypass a failed progress or independence check, that an approved `simplify` can leave `HEAD` unchanged, and that a recovered `verify` always reruns. Cancel while the recovery writer is active: assert no next stage starts, edits survive, and the lock is not released while exit is unconfirmed.

- **Verifier attempt limit:** Exercise success and failure on the last allowed attempt. On failure, assert the runner reports the reason and available artifacts, starts no new verifier, and opens no recovery split. Check that the run record distinguishes operator acceptance from automatic advancement.

### Validation limits
- **Accepted for Slice 1:** `/verify` compares its initial and final Git snapshots. The runner does not independently pin and compare `HEAD` when accepting the verdict. If another terminal commits after the final snapshot but before acceptance, the worktree can be clean even though the verdict covers the earlier commit. This narrow race does not block Slice 1.
- Unit and fake-process tests do not prove live LLM compliance with prompt-written JSON handoff files or real Rex/Pi authentication; the live disposable-worktree trial is required before Slice 2 cutover (accepted as a post-unit-test gate in Slice 1, blocking Slice 2).
- Slice 1 does not validate Slice 3 (`brainstorm → systematic-review → plan` auto-advance) or Slice 4 (work-profile PR/ARP completion); both are explicitly deferred and must pass their own live trials when implemented.

## Alternatives compared
- **Schema-enforced child results (deferred):** [`pifydev/workflow`](https://github.com/pifydev/workflow) documents validated child results. This could avoid a missing or malformed handoff file, but a valid result does not prove Git progress, operator approval, or independent verification. Slice 1 validates native file handoffs and adds no third-party runtime. Revisit if repeated formatting-only interventions justify the cost. Compare a minimal Pi-native mechanism first; adopting an extension requires review of the exact published artifact and evidence that it preserves writer recovery and cancellation.
- **Native `pi --mode json` + deterministic script + JSON handoff + Rex `--session` (Selected):**
  - *Downside:* Prompt-written JSON handoffs are softer than `ship-conductor`'s tool-enforced `lifecycle_submit_outcome`.
  - *Accepted limits:* No mid-run interactive popup dialogs inside headless stages; no built-in parallel agent fan-out.
- **`npm:pi-subagents` + Rex + JSON handoff (Rejected):**
  - *Genuine merit:* Built-in `outputSchema` validation, FleetView UI, watchdog, and declarative agent definitions.
  - *Rejection reason:* `interactive: true` is not enforced, so Rex escalation remains custom; adding an external dependency still leaves deterministic Git, loop, and model-independence gates outside or wrapped around it, whereas native `pi --mode json` provides live events and resumable sessions with zero new dependencies.
  - *Revisit trigger:* Prompt-written JSON handoffs fail frequently across models in Slice 1, or parallel multi-agent fan-out becomes a core requirement.
- **Smallest existing-code change — trim `ship-conductor` in place (Rejected):**
  - *Genuine merit:* Keeps battle-tested RPC framing, mid-run `lifecycle_request_decision` dialogs, and existing PR/ARP completion.
  - *Rejection reason:* The ~12k LOC complexity is structural (custom RPC protocol, `_bridge.ts` dual-mode prompt contracts, per-slice verify/simplify state) and does not generalize to `brainstorm → systematic-review → plan`.
  - *Revisit trigger:* Slice 1 shows that mid-run interactive decisions during `execute` occur often enough that escalating to a Rex pane is disruptive.
- **Interactive TUI `pi` in a Rex pane for every stage (Rejected):**
  - *Genuine merit:* Full live Pi TUI for every stage without JSON event formatting.
  - *Rejection reason:* Interactive TUI `pi` does not exit automatically when a turn finishes, adding pane-lifecycle and exit-detection complexity for happy-path runs where compact progress output is sufficient.
  - *Revisit trigger:* Compact progress lines prove insufficient for monitoring long `execute` runs.
- **Keep `ship-conductor` until Slice 4 restores PR/ARP completion (Rejected):**
  - *Genuine merit:* Avoids any gap in automatic work-profile PR/ARP completion between Slice 2 and Slice 4.
  - *Rejection reason:* Blocks deleting ~12k LOC of `ship-conductor` and dual-mode prompt bridges until PR/ARP is rebuilt, even though manual publish and ARP review after `VERIFIED` is acceptable during the interim window.
  - *Revisit trigger:* Manual PR/ARP between Slices 2 and 4 proves disruptive during daily work.
- **Separate recovery branch for `verify` no-verdict failures (e.g., in-runner retry prompt or read-only `pi --session <verifier-id>`) (Rejected):**
  - *Genuine merit:* Saves one pane exit on transient verifier crashes where no code edit is needed.
  - *Rejection reason:* Adds a second recovery path and risks breaking writer-vs-verifier independence if the user edits code inside a resumed verifier session; unifying all non-`VERIFIED` outcomes on a fresh writer-model split handles inspection, dirty-worktree cleanup, code fixes, and immediate retry through one mechanism.
  - *Revisit trigger:* Transient verifier crashes become frequent enough that opening a writer-model pane is noticeable friction.

## Open questions
- Set the finite Slice 1 verifier-attempt limit during `/plan`; the count includes the initial attempt.
- Exact CLI entry point name (standalone script in `dot_pi/agent/exact_scripts/` vs. thin Pi slash command) and exact JSON handoff field names for Slice 1 will be finalized during `/plan`.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Brainstorm workflow | Selected matching domain skills and provenance format |
| `codebase-research` | `skill-loader` | Existing `ship-conductor`, prompts, and `maruina/rex-design-review` | Mapped LOC, bridge contracts, session `01a1f540`, and Pi 1.6.0 JSON/session docs |
| `learning-lookup` | `prompt-required` | Advisory guidance before design decisions | Queried `Datadog/Learnings.md`; confirmed no matching Pi lifecycle learnings |
| `chezmoi` | `skill-loader` | Dotfiles-managed Pi configuration | Scoped additive rollout and rollback to explicit chezmoi source/target paths |
| `rex` | `agent-selected` | Rex pane handoff | Verified local pane verification and anchored split pattern from `design-review` |
| `feature-worktree` | `prompt-required` | Durable design commit | Created `maruina/lifecycle-stage-runner` worktree from `origin/main` while keeping base on `main` |
| `obsidian-cli` | `agent-selected` | Recovery guidance lookup | Queried the advisory store; no matching recovery guidance |
| `cli-best-practices` | `skill-loader` | Writer startup failure | Distinguished an actionable error from a resume command with no target |
| `write` | `skill-loader` | Design artifact drafting | Enforced concrete mechanism descriptions, specific failure risks, and concise ASD-STE100 prose |
