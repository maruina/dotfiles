---
description: Run a scientific-method optimization loop against a measurable metric
argument-hint: "<goal, metric, or target>"
---
# Optimize
Goal:

> $ARGUMENTS

Improve a concrete, measurable metric (such as latency, CI runtime, test duration, memory, allocations, or token cost) through an iterative hypothesis-and-measurement loop while preserving required behavior.

<HARD-GATE>
Do not edit production code before you run a repeatable measurement harness and record the baseline metric, exact command, inputs, and environment. Do not start edits on `main` or `master` without explicit user consent. Do not weaken assertions, skip checks, or drop required behavior to improve a metric. Do not push or open a PR from `/optimize`.
</HARD-GATE>

## Setup and skill loading
1. Load the `skill-loader` skill first and load every matching domain or language skill for the target repository and touched files. Record provenance per the `## Provenance record` section of the `skill-loader` skill.
2. Before editing repository files, use the `feature-worktree` skill to work in a clean feature worktree.
3. If `$ARGUMENTS` does not name a concrete metric or measurable target, ask the user to define the metric, stop condition, and any non-negotiable constraints before proceeding.

## Baseline measurement
1. Identify the narrowest repeatable command or benchmark that measures the target metric under realistic inputs.
2. Run the baseline measurement and the focused correctness tests for the target area.
3. Record the baseline commit SHA, exact command, environment notes, and measured baseline value in a scratch hypothesis ledger outside tracked files (for example, a temporary file under `/tmp/pi-optimize-<slug>.md` or an untracked scratch path).

## Hypothesis loop
Repeat until the target goal is met, diminishing returns are reached, or the user's iteration budget ends:

1. **Hypothesize:** Generate 3 to 5 concrete hypotheses ranked by expected impact on the metric. Consult the scratch hypothesis ledger so you do not repeat previously tested or rejected ideas.
2. **Implement one:** Apply the single highest-leverage hypothesis with the smallest clean change.
3. **Verify correctness first:** Run the focused correctness tests for the touched code. A change that breaks correctness or weakens test assertions is rejected immediately.
4. **Measure:** Run the exact baseline benchmark under the same conditions. Compute:
   - baseline value and candidate value;
   - absolute delta and relative delta;
   - amount and percentage of the remaining gap to the goal closed (when a numeric goal was given).
5. **Keep or revert:** Keep the change only when correctness passes and the measurement improves within acceptable complexity tradeoffs. Otherwise revert the change completely so the working tree returns to the last kept state.
6. **Log:** Append the hypothesis, change summary, measured delta, and `kept` or `reverted` decision to the scratch hypothesis ledger.

## Closeout and handoff
Remove temporary scratch files from the repository tree (keep the external ledger summary in your report) and inspect `git status` and `git diff --stat`. If the worktree started clean and kept improvements exist, commit them locally with a Conventional Commit message (or report them uncommitted if the worktree started dirty).

Report:
- **Baseline and final result:** exact command, environment, baseline, final candidate, absolute and relative delta, and percentage of the goal gap closed.
- **Hypothesis ledger:** concise table of tested hypotheses, measurements, and `kept`/`reverted` outcomes.
- **Correctness checks:** commands run and results.
- **Skills loaded and used:** per the `## Provenance record` section of the `skill-loader` skill.
- **Next action:** if code changed, hand off `/simplify` and independent `/verify` (with the writer model ID from `## Current Model`) in standalone `md` fenced blocks rather than pushing or opening a PR.
