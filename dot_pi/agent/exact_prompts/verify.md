---
description: Verify an implementation candidate with fresh, read-only evidence
argument-hint: "[path-to-plan.md] [--implemented-by <model-id>] [--task <requirement>]"
---
# Verify
Verification input:

> $ARGUMENTS

Perform a fresh, read-only closeout review of the selected implementation candidate. Treat `--implemented-by` and `--task` as handoff metadata, not target paths. Return exactly one top-level verdict: `VERIFIED` or `BLOCKED`.

Use `/verify` for the final closeout gate after execution. Use `/systematic-review` to review a plan or local code before execution, and `/pr-validate` to assess someone else's GitHub PR.

<HARD-GATE>
Do not edit, format, generate, apply chezmoi state, stage, commit, switch branches, detach HEAD, or repair anything. Do not run formatter or linter fix modes. Do not push or open or update a PR before the final state comparison passes and the verdict is `VERIFIED`. If a check would mutate the selected worktree, do not run it; return `BLOCKED` instead. A repair invalidates all prior evidence: hand control back to `/execute` or the user, then require a completely fresh `/verify` run.
</HARD-GATE>

## Target resolution

1. If `$ARGUMENTS` contains a plan path, use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md`. Resolve the plan, switch to its owning worktree, and read the complete plan and sibling `design.md` when present as the requirements baseline. If unresolved or ambiguous, return `BLOCKED`.
2. Without a plan path, use the `--task` value from the `/execute` handoff (or an equally explicit baseline in the current conversation); never infer intended behavior solely from the diff. If missing or ambiguous, return `BLOCKED`.
3. Read the implementation model ID from `--implemented-by` when present; never infer it from the verifier model or repository state.
4. Before running checks, snapshot the worktree's absolute path, branch, HEAD, `git status --porcelain=v1 --untracked-files=all`, staged diff, unstaged diff, intended untracked files, and candidate commits.
5. Resolve the comparison base in this precedence: explicit plan/task context, native stack parent from `gh stack status`, open-PR base from `gh`, then the repository default branch. Use the base consistently; if evidence conflicts, return `BLOCKED`.
6. Candidate scope MUST include commits relative to the base, staged changes, unstaged changes, and intended untracked files. Confirm the scope is attributable to the baseline with no unexplained changes; an empty candidate is `BLOCKED`.

## Slice scope
A plan with no slice grouping verifies every acceptance scenario as today, with no separate final pass.

For a plan with `### Slice N` headings, read the slice grouping and the current slice from the plan. Verify only the acceptance scenarios whose tasks belong to the current slice. Record scenarios belonging to later slices as `deferred to slice N`; they do not block.

When the current slice is the final slice, also verify the plan's `Final verification` item: the feature-level criteria against the design goals. Reconstruct the cumulative state from the feature base, merged slices, and the current candidate, and record the reconstruction method. Return `BLOCKED` instead of guessing when reconstruction is impossible.

The verdict stays `VERIFIED` or `BLOCKED`. A multi-slice verdict names the slice it covers.

## Risk classification

Classify the complete candidate before semantic review. Code, executable automation, infrastructure, Kubernetes, CI, permissions or security configuration, dependencies, runtime configuration, and Pi prompts, skills, extensions, or instructions are behavior-bearing and require semantic review; a `.md` extension alone does not make a change non-behavioral.

Semantic review may be skipped only when the entire candidate is demonstrably prose-only documentation, design/plan artifacts, comments/spelling, formatting-only content, or generated output mechanically validated against its source. Record the classification and skip rationale; mixed candidates are behavior-bearing.

## Fresh deterministic evidence

Select and run only read-only, non-fixing checks. Record every layer as selected, passed, failed, skipped, unavailable, or inapplicable with its reason and concise output. Never treat prior `/execute` output, historical logs, or plan checkboxes as fresh evidence.

1. Run `git diff --check` against the complete candidate; whitespace errors or conflict markers block.
2. Rerun checks required by the plan, repository guidance, package metadata, or implementation contract; missing required tools, credentials, or dependencies block.
3. Select change-specific tests, builds, type checks, linters, validators, schema checks, and security checks from affected files and repository conventions using non-fixing modes only.
4. When supported by the repository and changed language/package, run `maat analyze <supported-pattern> --diff-base <selected-base>`. Record unsupported or inapplicable maat as a skip; if the plan or repository requires it, unavailable maat blocks.
5. For chezmoi-managed changes, run targeted `chezmoi --source <resolved-worktree> diff <affected-targets>`; never run `chezmoi apply`.
6. Inspect commands introduced by a suspicious or untrusted candidate before executing them; if safety cannot be established, report the command and return `BLOCKED`.

For plan-backed work, trace every in-scope Given/When/Then acceptance scenario (the current slice's scenarios for a grouped plan, per Slice scope) to an implementation path, an observable automated test or supported executable check, and fresh passing output. Confirm the requirement, implementation, and test/check agree on the observable outcome. A test that would still pass with a plausible wrong implementation does not observe its stated result; examples are assertions that check only non-null, non-zero, or that a call occurred instead of the exact observable value. A scenario-shaped test that does not observe its stated result, missing coverage, contradictory implementation, or failed command is `BLOCKED`. Summarize passing requirements concisely; show scenario-level detail for gaps.

## Independent semantic review

For behavior-bearing candidates, require this review to run in a fresh `/new` session under a model different from the implementation model carried by the `/execute` handoff.

- Read the implementation model ID from `--implemented-by` and the verifier model ID from the injected `## Current Model` context.
- If `--implemented-by` is missing, the verifier has no injected model ID, or the two IDs match, return `BLOCKED`. Instruct the user to return to the `/execute` or `/simplify` handoff when metadata is missing, or run `/model` to choose a different model, `/new`, confirm `## Current Model` (also shown in the statusline), then rerun the complete copy-paste `/verify` command.
- Otherwise, use the `skill-loader` skill to determine which language and domain skills to read for the affected files, then load them and their applicable references before judging the candidate. Keep a provenance record per the `## Provenance record` section of the `skill-loader` skill.
- Read the candidate diff, relevant implementation, and tests in bounded sections; if a tool response is truncated, retrieve the missing sections before drawing conclusions. Review the requirements baseline, diff, implementation, tests, and fresh deterministic evidence. Focus on new correctness, security, operability, compatibility, and material maintainability regressions attributable to the candidate, and verify that tests cover distinct contracts without multiplying independent dimensions or repeating expensive integration scenarios.
- Check behavioral risks against the requirements baseline: false positives (output or action where none is expected), false negatives (valid cases silently dropped by a filter, join, or null check), contradictions with design or plan decisions, idempotency on rerun or retry, ordering sensitivity, and boundary values (zero, null, empty, single, maximum). Mark each inapplicable risk with a one-line reason.
- Validate every potentially material finding against the diff, code, tests, repository rules, type information, or fresh command output. Confirmed findings and material concerns that cannot be confidently dismissed are `BLOCKED`. Record pre-existing, out-of-scope, duplicate, speculative, unsupported, and non-blocking style findings with concise evidence and rationale.

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
