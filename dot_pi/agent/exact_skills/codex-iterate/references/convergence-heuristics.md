# Convergence heuristics

The loop should converge, not run forever. This file lists the stop conditions, the anti-patterns that masquerade as progress, and what to do when convergence stalls.

## Hard stop conditions

End the loop when any of these hold:

1. **No new findings — after a confirmation pass.** A `--resume-last` round returns only confirmations or "no further issues found". This does **not** end the loop on its own — it marks the loop as *converging* and triggers one **confirmation round** (`--fresh`, same scope, addressed list inlined into the opening prompt). If the confirmation round is also clean, the loop is done. If it surfaces findings, validate them normally and continue iterating — but all subsequent `--resume-last` calls now resume the **confirmation thread**, not the original. See "Why a confirmation pass in a resume-thread design?" below.
2. **All remaining items are accepted-as-is.** Every outstanding finding has been validated and explicitly accepted by the user; nothing remains to address. The confirmation pass still runs once — only skip it under stop condition 5.
3. **Two consecutive rounds produce only duplicates or noise.** If round N+1 surfaces the same items as round N (without new ones), the loop has stalled — treat it as done and write the summary. No confirmation needed; duplicate-only output is itself the convergence signal.
4. **Only the queued buffer remains.** The latest round produced no new findings, and the queued-questions buffer is the only remaining set of items. Run the confirmation pass once, then emit the closing block and ask the queued questions — do not loop on a buffer that exists precisely because Pi couldn't resolve it autonomously.
5. **The user calls it done.** Always honor an explicit "we're good" / "stop" / "ship it" / "that's enough" from the user, even mid-round and even before the confirmation pass. The confirmation is a quality safeguard, not a gate the user has to pass through.

## Why a confirmation pass in a resume-thread design?

A `--resume-last` Codex thread that has been thinking about the same code for several rounds is biased to stay quiet — once it has accepted Pi's fixes and built a mental model of the change as "done", it tends to normalize away issues that a fresh reader would catch. The confirmation round is a single `--fresh` pass that exists to defeat that conversational momentum.

Slog's `codex-review` skill doesn't need a confirmation pass because it spawns a fresh subagent every round — fresh eyes are baked into the design. Codex-iterate explicitly trades fresh-eye review for resume-thread efficiency (Codex skips re-discovering what was already fixed), so the confirmation pass is the one-time payment that buys back the quality property.

The confirmation prompt does not include `--resume-last`. It re-states the scope and inlines the cumulative addressed list under "the following were already addressed; do not re-flag." Because the fresh thread has no other context, a complete and accurate addressed list is non-negotiable here — see SKILL.md Step 4 for the formatting expectation.

## Soft stop conditions (raise with the user)

These are signals that the loop probably should end but the call is judgment-heavy. Surface them to the user instead of deciding unilaterally.

- **Diminishing severity.** Round 1 surfaced criticals; round 3 surfaces only style nits. Ask whether to continue chasing nits or to wrap up.
- **Findings drift out of scope.** Codex starts suggesting refactors that go beyond what the user originally wanted reviewed. Ask whether to expand scope or to defer them.
- **Cost per finding rises.** Each round takes longer and produces fewer actionable items. Diminishing returns; stop unless the user has a specific reason to keep going.

## Anti-patterns to avoid

- **Mistaking churn for progress.** If each round addresses one finding but introduces a new one in a different file, the change is leaking complexity, not converging. Stop and reconsider the approach with the user.
- **Chasing Codex's improvement suggestions.** Codex is biased toward proposing changes. Not every proposal needs to be addressed for the loop to converge. Use the validation checklist's "valid — defer" verdict liberally.
- **Letting the addressed list grow stale.** If round 4's continuation prompt does not name what was fixed in rounds 1–3, Codex will re-flag earlier items. Always carry the cumulative addressed list forward, not just the most recent round's.
- **Skipping validation under time pressure.** Late in the loop it is tempting to take Codex's word for the small stuff. Don't — that is when false positives slip in.
- **Running rounds when nothing has changed.** If the user did not address anything in the previous round, do not run another Codex pass. The result will be identical.
- **Using the queued buffer as a junk drawer.** Items belong in the buffer only when they are independently unverifiable, when the fix would be destructive without explicit user opt-in, or when the design question is genuinely open. Routing something to the buffer because Pi doesn't want to do the work of validating it defeats the autonomous premise — do the four-step gate instead.
- **Treating `valid — judgment-call` as the safe default.** The audit-note tier exists for fixes where a reviewer might reasonably have picked differently. If the four-step gate is genuinely clean and no reviewer would second-guess the call, use silent `valid — fix`. Routing trivial mechanical fixes through `judgment-call` pollutes the audit trail and makes the truly contestable decisions harder to find later.

## How many iterations is normal?

For a typical PR-scoped review (the confirmation pass adds +1 round to every case below):

- **1 + 1 confirmation** — the change was already clean; round 1 confirms, confirmation re-confirms with fresh eyes.
- **2–3 rounds + 1 confirmation** — the common case. Round 1 surfaces issues, round 2 verifies fixes and surfaces any second-order issues, round 3 (resume) confirms, confirmation (fresh) double-checks.
- **4+ rounds (excluding confirmation)** — usually means scope is too broad, the design is unstable, or the change is being made under uncertain requirements. After round 3 with non-trivial findings, ask the user whether to keep iterating or to step back and re-plan.

Autonomous mode (this skill's default) tolerates a round or two more than a user-guided review before fatigue sets in — the user isn't being interrupted between rounds, so the cost of an extra pass is just wall-clock and Codex tokens. But the underlying convergence triggers above are unchanged: stop on no-new-findings, stop on buffer-only-remains, stop on duplicates. Don't use "autonomy means I can keep going" as license to drift past convergence.

Do not pre-commit to a target iteration count. The stop condition is convergence on findings, not a fixed number of rounds.

## What to do when the loop stalls

If two consecutive rounds keep producing real (validated) new findings:

1. Pause the loop and summarize what has been addressed so far.
2. Look at the new findings as a set — are they concentrated in one file, one subsystem, one pattern? If yes, the underlying issue is probably structural (the design needs a change), not local.
3. Surface that observation to the user and ask whether to continue iterating on local fixes or to step back and re-plan the change. Do not silently keep iterating.

## When to start a fresh thread

Normally always use `--resume-last`. Start a fresh thread (use `--fresh` or omit `--resume-last`) only when:

- The scope has materially changed (different files, different feature) — Codex's prior context is now misleading.
- The previous thread is corrupted or returned malformed output across two attempts.
- The user explicitly requests a fresh start.

Starting fresh discards the convergence advantage of the thread, so do it deliberately.
