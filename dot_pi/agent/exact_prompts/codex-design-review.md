---
description: Run an adversarial Codex review of a design spec or implementation plan
argument-hint: "<path-to-design-or-plan.md> [model]"
---
# Codex Design Review
Raw arguments: `$ARGUMENTS`

Run a one-shot adversarial Codex review of a single planning document: a `/brainstorm` design spec or a `/plan` implementation plan. This reviews the document, not application code.

Arguments are positional:

1. path to the design or plan document, required
2. model, default `gpt-5.5`

## Rules
- This is review-only after the optional preparation commit.
- Do not edit files except to stage and commit the already-existing target document after explicit confirmation.
- Do not fix findings.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- Do not weaken the adversarial framing.

## Path resolution

If `$1` is missing, stop and ask for the path to the design or plan document.

Otherwise, use the `resolve-worktree` skill to resolve `$1` (no `$GLOB`). Set `$REVIEW_ROOT` to `$RESOLVED_ROOT` and `$REVIEW_FILE` to the document path relative to `$REVIEW_ROOT`. All later commands must use `cd $REVIEW_ROOT` or `git -C $REVIEW_ROOT`.

## Branch guard
The review diffs the branch against `main`, so the document must live on a feature branch.

1. Run `git -C "$REVIEW_ROOT" branch --show-current`.
2. If the branch is `main` or `master`, stop and explain that a branch diff against `main` would be empty. Ask the user to run from the feature worktree created by `/brainstorm` or `/plan`.

## Preparation commit
The target document must be committed so it appears in the branch diff. From `$REVIEW_ROOT`, inspect the document's status:

```bash
git -C "$REVIEW_ROOT" status --short -- "$REVIEW_FILE"
```

If the target document has staged, unstaged, or untracked changes:

1. Show the status output to the user.
2. Ask for explicit confirmation before committing. Stop until they answer.
3. If the user declines, stop and explain that the review would miss the uncommitted document.
4. If the user confirms, stage and commit only `$REVIEW_FILE` with a Conventional Commit message. Use the user's requested message if provided; otherwise choose a concise `docs:` message that matches the document.
5. Do not stage or commit any other file.

## Helper resolution
Resolve `codex-companion.mjs` once before invoking Codex. Use the official OpenAI checkout instead of the old Claude marketplace plugin copy:

```bash
CODEX_COMPANION="$HOME/go/src/github.com/openai/codex-plugin-cc/plugins/codex/scripts/codex-companion.mjs"
if [ ! -f "$CODEX_COMPANION" ]; then
  echo "codex-companion.mjs not found at $CODEX_COMPANION" >&2
  echo "Clone or update the official OpenAI Codex plugin checkout first:" >&2
  echo "  git clone https://github.com/openai/codex-plugin-cc.git $HOME/go/src/github.com/openai/codex-plugin-cc" >&2
  exit 1
fi
printf '%s\n' "$CODEX_COMPANION"
```

## Execution
Build the focus text that redirects the adversarial reviewer from code to this document, substituting the resolved `$REVIEW_FILE` path:

> You are reviewing a Datadog design or implementation planning document, not application code. The file under review is `$REVIEW_FILE`. Read it in full and treat it as the primary subject; treat any other diffed file as supporting context only.
>
> Review it as a skeptical staff engineer who will be on call for whatever it produces. Be convinced, not compliant: approve only if you would stake an on-call rotation on this document being safe to build from.
>
> Evaluate these dimensions in priority order: 1) security and data handling — credential exposure, authorization, tenant isolation, data loss, corruption, or exposure; 2) observability — which alerts, metrics, logs, and traces detect failure, and whether they are specified or hand-waved; 3) failure modes and blast radius — dependency slowness or outage, partial failure, retries, idempotency, ordering; 4) rollout and rollback — smallest safe rollout, fastest safe rollback, reconciliation, migration and version skew; 5) predictability — whether an unfamiliar engineer could execute or debug this at 3am; 6) simplicity — whether this is the most boring approach that works rather than over-built; 7) dependencies — circular or fragile dependencies and unowned components.
>
> For an implementation plan, also check task decomposition and ordering safety, that each task is independently testable with exact commands and expected results, test-first coverage of every spec requirement, and the absence of placeholders such as TBD, TODO, "handle edge cases", or references to nonexistent files, types, or commands.
>
> Challenge unsupported assumptions and vague mitigations. Demand specifics: which metric, which alert, which command, which failure path. Flag missing rollback, missing observability, scope creep, and any claim presented without evidence.

Assign that focus text to `$FOCUS`, then run this from `$REVIEW_ROOT` after the document is committed, passing the focus text as the trailing positional argument:

```bash
set -- $ARGUMENTS
MODEL="${2:-gpt-5.5}"
node "$CODEX_COMPANION" adversarial-review --base main --model "$MODEL" "$FOCUS"
```

Return Codex's output without applying changes.
