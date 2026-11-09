---
description: Verify an implementation candidate with fresh, read-only evidence
argument-hint: "[path-to-plan.md] [--implemented-by <model-id>] [--simplified-by <model-id>] [--task <requirement>]"
---
# Verify
Verification input:

> $ARGUMENTS

Perform a fresh read-only closeout. Require `--implemented-by`; accept optional `--simplified-by`. Treat both IDs and `--task` as metadata, not paths. Return exactly one verdict: `VERIFIED` or `BLOCKED`.

<HARD-GATE>
Do not edit, format, generate, apply chezmoi state, stage, commit, switch branches, detach HEAD, or repair anything. Do not run formatter or linter fix modes. Do not push or open or update a PR before the final state comparison passes and the verdict is `VERIFIED`. If a check would mutate the selected worktree, do not run it; return `BLOCKED` instead. A repair invalidates all prior evidence: hand control back to `/execute` or the user, then require a completely fresh `/verify` run.
</HARD-GATE>

When validated orchestrated mode is active, `lifecycle_submit_outcome` may write its private report outside the candidate. Do not write the report file yourself or change candidate state.

## Lifecycle mode
Only use the bridge when the injected stage contract validates protocol version 1, run ID, stage `verify`, fixed unit, pinned baseline, model, effective thinking, and both `lifecycle_request_decision` and `lifecycle_submit_outcome` tools are available. If a present contract is malformed/mismatched or a tool is missing, stop and ask. Otherwise, without a contract, use ordinary conversational approvals and manual handoffs, not the bridge.

In orchestration, validate the `Pinned baseline commit`, `Pinned plan blob`, `Pinned design blob`, `Selected unit`, and `Selected task numbers`. Pinned requirements govern; the current plan is only a progress ledger. Review only the fixed unit, using no predecessor report as evidence. Use `lifecycle_request_decision` only for in-scope clarifications. A rejected or dismissed decision stops the stage without an outcome; approval cannot authorize mutation or scope change. For another blocker, submit the stage-appropriate `BLOCKED` outcome. After review, submit exactly one `VERIFIED` or `BLOCKED` outcome with `change: not-applicable`. In direct mode, return the manual verdict.

## Target resolution

Parse `--implemented-by <id>` and optional `--simplified-by <id>` before target resolution; require the former. Parse writer flags only before `--task`, which consumes all remaining text as the original task. Use exactly one requirements source: a plan path or `--task`; otherwise return `BLOCKED`.

1. For a plan, use the `resolve-worktree` skill (`$GLOB = **/plans/*/plan.md`) and switch to its worktree. Direct mode reads the complete plan and sibling `design.md`; orchestration uses the pinned objects validated above and treats the current plan only as a ledger. An unresolved path, blob, or unit blocks.
2. For planless work, use the exact task from `/execute` or `/simplify`. Never infer it from a diff or summary; missing or ambiguous requirements block.
3. Preserve both writer IDs. `--simplified-by` is optional only for direct execute-to-verify; if simplify ran without the execution ID, block. Never infer IDs.
4. Before checks, snapshot the absolute worktree path, branch, HEAD, `git status --porcelain=v1 --untracked-files=all`, staged and unstaged diffs, intended untracked files, and candidate commits.
5. Use the pinned commit as the orchestrated base. Direct mode prefers explicit plan/task context, native parent from `gh stack status`, open-PR base from `gh`, then the repository default branch. Conflicting evidence blocks.
6. Include commits from the base plus staged, unstaged, and intended untracked changes. Unexplained scope or an empty candidate blocks.

## Slice scope
A plan with no slice grouping verifies every acceptance scenario as today, with no separate final pass.

For a plan with `### Slice N` headings, read the slice grouping and the current slice from the plan. Verify only the acceptance scenarios whose tasks belong to the current slice. Record scenarios belonging to later slices as `deferred to slice N`; they do not block.

When the current slice is the final slice, also verify the plan's `Final verification` item: the feature-level criteria against the design goals. Reconstruct the cumulative state from the feature base, merged slices, and the current candidate, and record the reconstruction method. Return `BLOCKED` instead of guessing when reconstruction is impossible.

The verdict stays `VERIFIED` or `BLOCKED`. A multi-slice verdict names the slice it covers.

## Risk classification

Classify first. Code, automation, infra/Kubernetes/CI, permissions/security, dependencies/runtime config, and Pi prompts/skills/extensions/instructions are behavior-bearing; `.md` is not exempt. Skip semantics only for wholly prose/docs, design/plans, comments/spelling, formatting, or source-validated generated output; record rationale. Mixed changes are behavior-bearing.

## Fresh deterministic evidence

Run only read-only, non-fixing checks. Record each as selected, passed, failed, skipped, unavailable, or inapplicable, with a reason and concise output. Prior `/execute` output, historical logs, and plan checkboxes are not fresh evidence.

1. Run `git diff --check` against the complete candidate; whitespace errors or conflict markers block.
2. Rerun checks required by the plan, repository guidance, package metadata, or implementation contract; missing required tools, credentials, or dependencies block.
3. Select change-specific tests, builds, type checks, linters, validators, schema checks, and security checks from affected files and repository conventions using non-fixing modes only.
4. When supported by the repository and changed language/package, run `maat analyze <supported-pattern> --diff-base <selected-base>`. Record unsupported or inapplicable maat as a skip; if the plan or repository requires it, unavailable maat blocks.
5. For chezmoi-managed changes, run targeted `chezmoi --source <resolved-worktree> diff <affected-targets>`; never run `chezmoi apply`.
6. Inspect commands introduced by a suspicious or untrusted candidate before executing them; if safety cannot be established, report the command and return `BLOCKED`.

For plan-backed work, trace every in-scope Given/When/Then acceptance scenario (the current slice's scenarios for a grouped plan, per Slice scope) to an implementation path, an observable automated test or supported executable check, and fresh passing output. Confirm the requirement, implementation, and test/check agree on the observable outcome. A test that would still pass with a plausible wrong implementation does not observe its stated result; examples are assertions that check only non-null, non-zero, or that a call occurred instead of the exact observable value. A scenario-shaped test that does not observe its stated result, missing coverage, contradictory implementation, or failed command is `BLOCKED`. Summarize passing requirements concisely; show scenario-level detail for gaps.

## Independent semantic review

For behavior-bearing candidates, require an independent verifier model that differs from every supplied writer model. A manual review must run in a fresh `/new` session. An orchestrated review must run in a newly created child session with no preceding stage transcript; do not require a literal manual `/new` command.

- Compare injected `## Current Model` and any stage contract with `--implemented-by` and optional `--simplified-by`. If provenance is missing, any writer ID matches the verifier, or simplify lacks its execution ID, return `BLOCKED`. In manual mode, recover missing provenance or select a different model with `/model`, start `/new`, confirm identity, then rerun the full command.
- Load applicable language/domain skills and references via `skill-loader`; record provenance.
- Review diff, implementation, tests, requirements, and fresh evidence in bounded sections. If a tool response is truncated, retrieve the missing sections before drawing conclusions. Assess new correctness, security, operation, compatibility, and maintainability; ensure tests cover distinct contracts without multiplying independent dimensions or repeating expensive integration scenarios.
- Check false positives, false negatives, contradictions with design or plan decisions, idempotency, ordering sensitivity, and boundary values (zero, null, empty, single, maximum); explain inapplicable risks.
- Validate material findings against source, tests, repository rules, type information, or fresh output. Confirmed or unresolved material concerns block. Record pre-existing, out-of-scope, duplicate, speculative, unsupported, or style findings with evidence.

Do not invoke a separate reviewer tool or parse session logs. Pi performs this semantic review natively under the switched model.

## Final state and report

After every selected check, recapture the initial Git snapshot fields and compare them exactly. A tracked or untracked repository-state change caused by verification is `BLOCKED`; identify the delta and give a non-mutating repair/retry action without repairing it.

Report these sections:

- **Target and scope:** worktree, branch, HEAD, base, requirements source, and committed/staged/unstaged/untracked scope.
- **Risk and review:** behavior classification, semantic-review decision, implementation model and verifier model when required.
- **Fresh evidence:** commands, results, requirements traceability, and selected/skipped/unavailable/inapplicable checks with reasons.
- **Skills loaded and used:** recorded per the `## Provenance record` section of the `skill-loader` skill; explicitly state when none were needed.
- **Findings:** blocking findings plus non-blocking or rejected findings and rationale.
- **State comparison:** initial versus final snapshot.
- **Next action:**
  - `/verify` is read-only for repository files and must not fix or commit. For confirmed, in-scope findings that need code or configuration changes, offer `/execute` as the follow-up; commit or push only after the fix is implemented and independently verified under the repository's completion workflow. Distinguish actionable findings from accepted non-blocking style advisories and environment/toolchain limitations; do not recommend changing the latter without approval and a valid scope.
  - When the verdict is `VERIFIED` and the final state matches the initial snapshot, apply the stack-split check from the `reviewable-pr-workflow` skill to the verified candidate. If it trips, **stop and propose a stack plan** and ask whether to split before opening any PR. Otherwise, unless the user explicitly said not to open a PR, use `/pr-create --draft` to open a draft PR (or `/pr-update` when the branch already has a PR).
  - For plan-backed work, inspect the next incomplete task's `Blocked by` field and all explicit prerequisites in the plan before recommending `/execute`. If any prerequisite is unresolved, name it and recommend resolving it through `/plan` or a user decision; do not say to proceed with implementation.
  - If the next task is unblocked, give the exact `/execute <absolute-plan-path>` command. Do not give a worktree root as the plan argument or paraphrase a task as an executable instruction. The next `/execute` session will select the next incomplete slice from the plan.
- **Copy-paste follow-up:** when **Findings** contains any finding, include a self-contained prompt for a new execution session in a plain-text code block:
  - Include the selected worktree path and branch, the absolute plan path when one exists, and each finding with its classification and evidence.
  - Ask the new session to address only confirmed, actionable findings within the committed plan; if a finding needs scope or acceptance-criteria changes, direct the session to stop and use `/plan` for approval.
  - Mark non-blocking advisories and environment/toolchain limitations as optional or informational; do not instruct the new session to change them without approval.
  - Preserve unresolved prerequisites and blockers, do not claim verification evidence remains valid after a fix, and end the copied prompt with instructions to run fresh checks and a new `/verify` after execution.
  - Include the prompt even when findings are all non-blocking; in that case, make clear that no fix is requested unless the user authorizes one. Omit this section only when there are no findings.

End with exactly one top-level verdict:

- `VERIFIED` only when every applicable layer passed in this run, requirements traceability is adequate, semantic review was independent when required, no blocking findings remain, and the final state matches the initial snapshot.
- `BLOCKED` for every missing prerequisite, ambiguity, failed or unavailable required check, traceability gap, model-separation failure, state mutation, or material finding.
