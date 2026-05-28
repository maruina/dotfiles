---
name: codex-iterate
description: Multi-round Codex cross-check loop. Use when the user asks to iterate with Codex, loop until Codex is clean, run another Codex pass, re-run Codex after fixes, cross-check with Codex, or validate/address/recheck Codex findings.
---

# Codex Iterate

## Pi port notes

This is the Pi port of the Claude Code `codex-iterate` skill. Use Pi tools directly:

- Use `bash` for git, formatter, and Codex helper commands.
- Use `read` to inspect cited files before validating findings.
- Use `edit`/`write` to apply only independently verified fixes.
- Use `rg`/`find` through `bash` for text discovery.
- Ask the user only at the end for queued ambiguous findings, unless a safety blocker prevents continuing.

The referenced files under `references/` are part of this skill and should be read as directed below.

Drive a Codex cross-check as an iterative loop: open a Codex session, validate each finding, address only the ones that survive validation, resume the same Codex session so it remembers what was fixed, and repeat until the loop converges.

This is the "what to do" skill. Why this exists: a single Codex pass surfaces findings but does not by itself converge on a clean state — false positives, addressed-but-not-confirmed items, and second-order issues all need a second pass. Iterating in the same Codex thread is what lets Codex skip what is already done and focus on what is new.

## Codex invocation constants

Always include these flags on every `codex-companion.mjs task` call made by this skill:

```
--model gpt-5.5 --effort xhigh
```

Rationale: the loop only behaves correctly if every iteration runs on the same reasoning model with full effort. Mixing models or efforts across turns breaks the "Codex remembers what it flagged" property and produces inconsistent verdicts.

If the user explicitly overrides on a single turn (e.g. asks for `spark` for a quick check), honor the override for that turn only and revert to the pinned values on the next turn unless the user says otherwise.

If the Codex CLI rejects `--model gpt-5.5` (e.g. the alias is not yet recognized in the installed Codex version), stop the loop and surface the error to the user rather than silently downgrading to a different model — silent downgrade defeats the consistency rationale above. Ask the user whether to retry with a different model identifier or to upgrade the Codex install.

### Helper resolution

`codex-companion.mjs` ships with the `codex` plugin from the `openai-codex` Claude plugin — a prerequisite for this skill. Resolve its absolute path **once at loop start** (the first action of Step 1, before any Codex call) and inline the resolved path into every subsequent `node ... codex-companion.mjs ...` invocation in the loop. bash environments do not persist across separate tool calls, so the resolver is run once and its output (the absolute path) is substituted into the examples below in place of `$CODEX_COMPANION`.

Resolver:

```bash
CODEX_COMPANION="$HOME/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs"
if [ ! -f "$CODEX_COMPANION" ]; then
  CODEX_COMPANION=$(find "$HOME/.claude/plugins" -maxdepth 6 -path '*/codex/scripts/codex-companion.mjs' -type f 2>/dev/null | head -1)
fi
if [ ! -f "$CODEX_COMPANION" ]; then
  echo "codex-companion.mjs not found — install the openai-codex plugin first:" >&2
  echo "  /plugin marketplace add openai/codex-plugin-cc" >&2
  echo "  /plugin install codex@openai-codex" >&2
  echo "  /codex:setup" >&2
  exit 1
fi
echo "$CODEX_COMPANION"
```

If the resolver fails (the helper isn't installed), stop the loop and direct the user to `/codex:setup`. Do not improvise an alternate Codex path — vendored copies and ad-hoc shims drift out of sync with the upstream helper and break `--resume-last` semantics in subtle ways.

## Autonomous iteration mode

This skill runs iteratively without pausing for the user mid-loop. The default behavior is to validate each finding, **apply the fix directly when Pi has independently verified it**, and buffer ambiguous findings for a single end-of-loop review. **This explicitly overrides the parent `codex:codex-result-handling` "never auto-fix" rule, scoped to this skill only** — see below.

### Override of the parent rule

`codex:codex-result-handling` says: *"Auto-applying fixes from a review is strictly forbidden, even if the fix is obvious."* This skill **explicitly overrides that rule, scoped to `codex-iterate` only**. The gate that replaces user approval is Pi's independent verification (see `references/validation-checklist.md`). The override does not affect single-pass usage via `codex:rescue` — that path still honors the parent rule unchanged.

### Three-tier confidence

Findings are routed by confidence, not by a binary fix/ask choice. From the validation checklist:

- **`valid — fix`** — high confidence (all four gate steps clean, no reviewer would reasonably second-guess) → apply silently.
- **`valid — judgment-call`** — confident enough to defend the choice, but the fix encodes a non-trivial inline decision a reviewer might reasonably pick differently → apply, then write a one-line audit note into that round's summary block.
- **`uncertain` / `valid — defer`** → buffer for end-of-loop, do NOT pause the loop.
- **`valid — accept as-is`** → addressed list (so Codex stops re-flagging).
- **`rejected — <reason>`** → drop with the one-line reason in the round log.

The `valid — fix` vs `valid — judgment-call` test: *would another reviewer reasonably have picked a different fix?* If yes → judgment-call + audit note. If no → silent fix. Be honest in tiering — lazy use of `judgment-call` as a defensive escape pollutes the audit trail.

The user can interrupt at any time, but the default is uninterrupted autonomous iteration.

## When to use vs. adjacent skills

- Use **this skill** when more than one Codex round is anticipated, when the user says "iterate" / "loop" / "until clean" / "round 2", or when previous output produced enough findings to warrant validate-then-address-then-recheck.
- Use `codex:rescue` instead for a single substantial hand-off where Pi is stuck and wants Codex to take over once.
- Use `dual-agents-review:dual-review` instead for a single parallel pass that combines Pi PR-review subagents with one Codex review pass.
- This skill **does auto-apply** findings Pi independently verifies (see "Autonomous iteration mode" above and `references/validation-checklist.md`). Ambiguous findings are buffered, not used as a reason to pause the loop.

## The loop

### Step 1 — Open the Codex thread

Compose a tight opening prompt that includes: the scope (which files, which feature, which constraints), the kind of review (correctness / security / performance / edge cases / design), and any project conventions (point at `CLAUDE.md` files Codex should respect).

Foreground (recommended default):

```bash
node "$CODEX_COMPANION" task \
  --model gpt-5.5 --effort xhigh \
  "<scoped opening prompt>"
```

**Do not pass `--write` by default in this skill.** This loop uses Codex as a reviewer, not as an editor — Codex surfaces findings, Pi and the user decide what to address. `--write` grants Codex sandbox permission to author edits, which conflicts with the never-auto-fix rule that governs this skill (see `references/validation-checklist.md`).

Add `--write` only when both of these are true: the user explicitly opts in for this round, AND Codex genuinely needs to run tests, build, or formatters on the workspace to verify a finding. Even with `--write`, Pi itself must never auto-apply Codex's suggested edits — the rule applies to Pi's behavior regardless of Codex's sandbox.

**`--background` is only for parallel fan-out across multiple Codex agents at the same time** — e.g. reviewing several disjoint scopes (batches A/B/C/D) concurrently, where serial would be unacceptably slow. Do NOT use `--background` for a single-scope loop; foreground avoids the polling failure mode entirely.

Parallel fan-out pattern:

1. Fire N background tasks at once, one per scope. Collect their job ids:

   ```bash
   node "$CODEX_COMPANION" task \
     --background \
     --model gpt-5.5 --effort xhigh \
     "<scope A prompt>"
   # repeat for scope B, C, D — each returns its own job id
   ```

2. Block on every job by calling `status <job-id> --wait` once per id. The companion's built-in poller (2s interval, 4-minute default timeout — `waitForSingleJobSnapshot`) does the blocking. Because jobs run concurrently, total wall-clock = max(per-job duration), not the sum:

   ```bash
   node "$CODEX_COMPANION" status <id-A> --wait
   node "$CODEX_COMPANION" status <id-B> --wait
   # ...
   ```

   Plain `status` (no `--wait`) returns a snapshot only and does NOT block. Always pass `--wait`.

3. After each wait returns terminal, fetch the output:

   ```bash
   node "$CODEX_COMPANION" result <id-A>
   ```

4. Aggregate findings across all scopes into the round's finding set. Each scope keeps its own addressed list for `--resume-last` continuation; cross-scope findings (rare) merge into a single round summary.

If `status <id> --wait` times out (default 4 minutes), surface the timeout for that specific job and offer `cancel <id>` or keep waiting. Do not silently abandon the job. Other fan-out jobs continue independently — do not cancel them because one timed out.

Either foreground or fan-out leaves a "last task thread" behind per scope, which is what `--resume-last` reattaches to in Step 4.

### Step 2 — Validate and route every finding

Walk each finding through the four-step gate in `references/validation-checklist.md` (cited location exists; code matches the claim; trace the consequence; cross-check `CLAUDE.md` conventions and callers). Then route each finding by verdict:

- **`valid — fix`** → Step 3 (silent auto-apply).
- **`valid — judgment-call`** → Step 3 (auto-apply + one-line audit note in the round log).
- **`valid — accept as-is`** → addressed list (carries forward to Codex on `--resume-last`).
- **`valid — defer`** / **`uncertain`** → Step 3a (buffer for end-of-loop; do NOT pause the loop).
- **`rejected — <reason>`** → drop, but log the one-line reason in the round summary block.

This skill **deliberately overrides** the parent `codex:codex-result-handling` never-auto-fix rule. See "Autonomous iteration mode" above and `references/validation-checklist.md` for the override scope and the validation gate that replaces user approval.

### Step 3 — Apply validated fixes autonomously

For each `valid — fix` finding, apply the edit with edit/write. No user prompt needed; the tool call itself is the audit trail.

For each `valid — judgment-call` finding, apply the edit AND record a one-line audit note in this round's summary block (e.g. "chose fixed delay over exponential — Splunk parity requires deterministic retry"). The user can audit the note later; the loop continues.

Keep a running **addressed list** of file:line + one-line description for everything Step 3 touches. The addressed list is what makes the next Codex turn cheap — Codex can skip code paths you already fixed.

Items the user previously marked as intended (carried over from earlier rounds, or surfaced from the queued-questions buffer and resolved) also belong on the addressed list, tagged "accepted as-is".

### Step 3a — Buffer ambiguous findings

For each `valid — defer` or `uncertain` finding, append one line to the queued-questions buffer:

```
- Round N / <severity> / `<file>:<line>` — <one-line summary> — <one-line reason it was queued>
```

Do NOT ask the user mid-loop. The buffer carries forward across rounds and is presented once, at end-of-loop, alongside the closing summary.

The buffer is **not** included in the `--resume-last` continuation prompt (Step 4). The addressed list IS — Codex stops re-flagging fixed items but may re-surface a queued item with new context, in which case it gets re-validated, not auto-re-queued.

### Step 3b — Run repo post-edit hooks on touched files

Before resuming Codex, run the repo's standard formatters and build-graph updaters on the files Pi edited in Step 3. Scope is narrow: only files touched this round, not the whole repo. The goal is collapsing this-round cosmetic churn before Codex re-reviews, so unformatted imports, stale BUILD targets, and lint noise don't show up in round N+1 as new findings.

The hook set is resolved **once at loop start** (in Step 1) by reading scope-local `CLAUDE.md` / `AGENTS.md` directives, falling back to a small heuristic table keyed on repo-root signals (`go.mod`, `Cargo.toml`, `package.json`, `pyproject.toml`). When neither path matches, Step 3b is an explicit no-op — the skill does not invent hooks for repos that don't have post-edit conventions. See `references/project-hooks.md` for the full detection priority, the heuristic table, and the hook-failure protocol.

If a hook fails (formatter rejects the diff, configure step errors out), demote the triggering finding back to `uncertain`, restore the pre-edit file content (`git checkout -- <file>` when safe, or restore from a pre-edit snapshot when the file had unrelated dirty changes), append the failure to the queued-questions buffer, and log one line in the round block. Do not silently swallow — letting a broken edit reach Step 4 pollutes the next Codex round.

If hooks modify files (the normal case for formatters), include the resulting touched-files set in Step 4's continuation prompt — the addressed list describes what changed, not just what Pi originally typed.

### Step 4 — Resume the same Codex thread

Use `--resume-last` to continue the thread opened in Step 1. The continuation prompt is built **from the addressed list only** — queued-question buffer items must NOT be sent to Codex, because Codex would treat them as still-open and re-flag them as new findings.

```bash
node "$CODEX_COMPANION" task \
  --resume-last \
  --model gpt-5.5 --effort xhigh \
  "I addressed the following from the previous round:

  - <file>:<line> — <one-line description>
  - <file>:<line> — accepted as-is (intended behavior)

  Re-review the same scope. Report only:
  - issues from previous rounds that are still present
  - new issues exposed by the changes
  - second-order issues you can now see

  Do not re-list anything I addressed unless the fix is incorrect."
```

Naming addressed items explicitly is the single most important detail of this skill — without it, Codex tends to re-surface what was already fixed, which destroys convergence. This applies doubly to the confirmation run in Step 5a: that round uses `--fresh` and has no conversational context, so the addressed list inlined into its opening prompt is the *only* thing keeping Codex from re-discovering rounds 1–N from scratch.

For fan-out continuations: each scope keeps its own thread and its own addressed list. The continuation for scope A only references scope A's addressed items; scope B is independent.

### Step 5 — Append the round to the running summary, then check convergence

After every round, append a per-round block to the running in-conversation summary (template below). This is non-optional — it's how the summary survives context compaction. The closing totals block in Step 6 is just the last append.

Then consult `references/convergence-heuristics.md`. Stop when any of these hold:

- Codex returns no new findings, only confirmations.
- All remaining findings are user-accepted as-is or already in the queued-questions buffer.
- Two consecutive rounds produce only duplicates or noise (diminishing return).
- The user explicitly calls the loop done.

If none hold, loop back to Step 2 with the new finding set. There is no hard cap on iterations — but if a single area keeps producing new findings round after round, that itself is a signal to stop and reconsider the approach rather than keep iterating.

If a resumed round returned no new findings and none of the other hard stop conditions short-circuit (in particular condition 5, the user calling it done), the loop is *converging* — fire Step 5a before declaring done.

### Step 5a — Confirmation run (fresh thread)

A `--resume-last` thread that has been thinking about the same code for several rounds is biased to stay quiet. Step 5a defeats that conversational momentum with a single `--fresh` Codex pass before the closing block.

Fire one confirmation per scope (each fan-out scope gets its own):

```bash
node "$CODEX_COMPANION" task \
  --fresh \
  --model gpt-5.5 --effort xhigh \
  "<same scope and review-kind framing as Step 1's opening prompt>

  The following were already addressed in previous rounds; do not re-flag:
  - <file>:<line> — <one-line description>
  - <file>:<line> — accepted as-is (intended behavior)
  - ...

  Report only:
  - issues still present despite the items above
  - new issues you can see now"
```

Outcomes:

- **Confirmation also returns no new findings → converged.** Append the per-round block (with the `(confirmation, fresh thread)` header variant) and proceed to Step 6.
- **Confirmation surfaces findings → keep iterating.** Validate them via Step 2 as normal. All subsequent `--resume-last` calls in this scope now resume the **confirmation thread**, not the original — the confirmation thread is the most recent state, and abandoning it would waste context. Note the thread switch with a one-line entry in the next round's block ("thread switched from original to confirmation").

Step 3b does not run during the confirmation round — Codex is reviewing, not editing. Step 3b resumes on the next normal round if the loop continues.

The confirmation pass also fires under hard stop conditions 2 and 4 (everything accepted-as-is, or only the queued buffer remains). It is skipped only under condition 5 (the user explicitly calls the loop done) and condition 3 (two consecutive duplicate-only rounds — the duplicate signal already establishes convergence). See `references/convergence-heuristics.md` for the full hard-stop table.

### Step 6 — Emit the closing block and surface the queued questions

The per-round blocks were already appended in Step 5. Now emit the closing block — totals table + queued-questions list — referencing the per-round entries already in the transcript.

**Per-round block** (appended after every round in Step 5):

```
#### Round N — Xs
- `path/to/file.go:120` — Race on `cache.m` — valid — fix → applied
- `path/to/api.go:45` — Missing nil check — rejected (caller guarantees non-nil)
- `path/to/svc.go:80` — Retry policy — valid — judgment-call → applied (chose fixed delay; Splunk parity requires deterministic retry)
- `path/to/migration.sql:14` — Schema change — uncertain → queued
- Step 3b: `gofmt -w cache/redis.go` (no diff) — clean
```

Confirmation-round variant (used in Step 5a). Same line format, distinguished header:

```
#### Round N (confirmation, fresh thread) — Xs
- (no new findings)
```

or, if the confirmation surfaces something:

```
#### Round N (confirmation, fresh thread) — Xs
- `path/to/normalizer.go:88` — Off-by-one in batch boundary — valid — fix → applied
```

**Closing block** (emitted once, at end-of-loop):

```
## Codex iterate — summary

| Metric | Value |
|---|---|
| Rounds | N |
| Raised | total findings Codex surfaced (raw count, summed across rounds) |
| Confirmed | passed validation (valid — fix / judgment-call / accept / defer) |
| Fixed | edits Pi applied (valid — fix + valid — judgment-call) |
| Total time | mm:ss (wall-clock from round 1 launch to closing block) |

(See per-round detail in the round-N blocks above.)

### Queued for end-of-loop review
- Round N / `<file>:<line>` — <one-line summary> — <one-line reason queued>
- ...
```

After the closing block, ask the user each queued question in turn. This is the only mandatory user-input point in the skill.

**Time tracking**: capture `date +%s` at the start of each Codex `task` invocation (foreground or `--background` fire) and at the closing block. Per-round duration = round-end − round-start. Total time = closing − round-1-start. Inline the timestamps into each per-round block so the totals row computes from data already in the transcript.

The summary belongs in the conversation, not in a separate file, unless the user explicitly asks for one.

## Common failure modes

- **Skipping validation.** Treating Codex findings as ground truth produces churn on false positives. Always run the four-step gate.
- **Forgetting `--resume-last`.** A fresh `task` call opens a new thread and Codex re-discovers everything from scratch, including issues you already fixed. The resume flag is what makes the loop coherent.
- **Switching models between rounds.** A round on `gpt-5.5` followed by a round on `spark` is not the same review; findings will not line up. Keep the pinned constants.
- **Using `--background` for a single-scope loop.** Single-scope loops belong in the foreground. `--background` is exclusively for parallel fan-out across disjoint scopes.
- **Skipping `--wait` on a fan-out background job.** Plain `status` returns a snapshot. Without `status <id> --wait`, Pi moves on before Codex finishes and the user gets nothing. Always pass `--wait`.
- **Asking the user mid-loop.** Defeats the autonomous iteration goal. Ambiguous findings go to the queued-questions buffer; the loop continues.
- **Sending the queued buffer back into the `--resume-last` continuation prompt.** Codex would re-flag every queued item as a new finding. Only the addressed list goes back to Codex.
- **Deferring the per-round summary append to end-of-loop.** Context compaction can erase the closeout. Append every round; the closing block is just the last append.
- **Treating `valid — judgment-call` as the safe default.** If the four-step gate is clean and no reviewer would second-guess, route as `valid — fix` silently. The audit-note tier is for genuine inline decisions, not a defensive escape hatch.
- **Skipping the confirmation run because the resumed thread looked clean.** Thread silence often reflects conversational momentum, not actual cleanliness — Codex has accepted Pi's fixes and built a "we're done" mental model that normalizes away issues a fresh reader would catch. The confirmation pass is the one-time payment for the resume-thread efficiency trade-off; do not declare convergence without it.
- **Skipping post-edit hooks.** Codex re-flags formatter noise (unformatted imports, stale BUILD targets, lint output) in round N+1 as new findings, polluting the convergence signal and inflating the round count. Step 3b's whole purpose is to collapse this churn before Codex sees the diff again.
- **Broadening Step 3b's scope beyond touched files.** Running `gofmt -w ./...` or `prettier --write .` across the whole repo pulls unrelated dirty files into the loop and confuses the addressed list. Keep the scope to files Pi edited this round, plus any side-effect files the formatter writes through.

## Additional resources

- `references/validation-checklist.md` — concrete criteria for validating a Codex finding before acting on it. read this every round.
- `references/convergence-heuristics.md` — stop conditions (including the confirmation-pass behavior of stop condition 1), anti-patterns, and how to recognize diminishing returns. Consult before deciding to start round N+1.
- `references/project-hooks.md` — Step 3b detection priority, the formatter / build-graph heuristic table, the hook-failure protocol, and the "no-op is fine" guard. read this once at loop start to populate the scope's hook set.
- `references/transport-comparison.md` — appendix only. Background on why this skill uses the `codex-companion.mjs` subprocess path rather than `mcp__codex__codex` / `codex-reply`. read only when troubleshooting transport choice or considering a future MCP-based variant.
