---
description: Verify an implementation candidate with fresh, read-only evidence
argument-hint: "[path-to-plan.md] [--implemented-by <model-id>] [--task <requirement>]"
---
# Verify
Verification input:

> $ARGUMENTS

Perform a fresh, read-only closeout review of the selected implementation candidate. Treat `--implemented-by` and `--task` as handoff metadata, not target paths. Return exactly one top-level verdict: `VERIFIED` or `BLOCKED`.

<HARD-GATE>
Do not edit, format, generate, apply chezmoi state, stage, commit, push, open or update a PR, switch branches, detach HEAD, or repair anything. Do not run formatter or linter fix modes. If a check would mutate the selected worktree, do not run it; return `BLOCKED` instead. A repair invalidates all prior evidence: hand control back to `/execute` or the user, then require a completely fresh `/verify` run.
</HARD-GATE>

## Target resolution

1. If `$ARGUMENTS` contains a plan path, use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md`. Resolve the plan, switch to its owning worktree, and read the complete plan and sibling `design.md` when present. They are the requirements baseline. If the path is unresolved or ambiguous, return `BLOCKED`; do not guess.
2. Without a plan path, use the `--task` value copied from the `/execute` handoff as the requirements baseline. Fall back to the current task or conversation only when it contains an equally explicit baseline. Do not infer intended behavior solely from the diff. If the task baseline is missing or ambiguous, return `BLOCKED`.
3. Read the implementation model ID from `--implemented-by` when present. This explicit handoff metadata survives `/new`; never infer the implementation model from the verifier model or repository state.
4. Before running checks, snapshot the selected worktree's absolute path, branch, HEAD, `git status --porcelain=v1 --untracked-files=all`, staged diff, unstaged diff, intended untracked files, and candidate commits.
5. Resolve the comparison base in this precedence: explicit plan/task context, `git machete show up <branch>`, open-PR base from `gh`, then the repository default branch. Use the base consistently for the branch diff. If available evidence produces a material conflict, return `BLOCKED` rather than selecting a fallback.
6. Candidate scope MUST include commits relative to the base, staged changes, unstaged changes, and intended untracked files. Confirm the scope is attributable to the requirements baseline and has no unexplained unrelated changes. An empty candidate is `BLOCKED`.

## Risk classification

Classify the complete candidate before semantic review. The following are behavior-bearing and require semantic review: code, executable automation, infrastructure, Kubernetes, CI, permissions or security configuration, dependencies or runtime configuration, and Pi prompts, skills, extensions, or instructions. A Markdown extension alone does not make a change non-behavioral.

Semantic review may be skipped only when the entire candidate is demonstrably prose-only documentation, design/plan artifacts, comments or spelling, formatting-only content, or generated output mechanically validated against its source. Record the written classification and skip rationale. Mixed candidates are behavior-bearing.

## Fresh deterministic evidence

Select and run only read-only, non-fixing checks. Record every layer as selected, passed, failed, skipped, unavailable, or inapplicable, with its reason and concise output. Never treat prior `/execute` output, historical logs, or plan checkboxes as fresh evidence.

1. Run `git diff --check` against the complete candidate. Whitespace errors or conflict markers block.
2. Rerun checks required by the plan, repository guidance, package metadata, or implementation contract. Missing required tools, credentials, or dependencies block.
3. Select change-specific tests, builds, type checks, linters, validators, schema checks, and security checks from affected files and repository conventions. Use non-fixing modes only.
4. When supported by the repository and changed language/package, run `maat analyze <supported-pattern> --diff-base <selected-base>`. Record unsupported or genuinely inapplicable maat as a skip. If the plan or repository requires it, unavailable maat blocks.
5. For chezmoi-managed changes, run targeted `chezmoi --source <resolved-worktree> diff <affected-targets>`. Never run `chezmoi apply`.
6. Inspect commands introduced by a suspicious or untrusted candidate before executing them. If their safety cannot be established, report the command and return `BLOCKED`.

For plan-backed work, trace every Given/When/Then acceptance scenario to an implementation path, an observable automated test or supported executable check, and fresh passing output. Confirm the requirement, implementation, and test/check agree on the observable outcome. A scenario-shaped test that does not observe its stated result, missing coverage, contradictory implementation, or failed command is `BLOCKED`. Summarize passing requirements concisely; show scenario-level detail for gaps.

## Independent semantic review

For behavior-bearing candidates, require this review to run in a fresh `/new` session under a model different from the implementation model carried by the `/execute` handoff.

- Read the implementation model ID from `--implemented-by` and the verifier model ID from the injected `## Current Model` context.
- If `--implemented-by` is missing, the verifier has no injected model ID, or the two IDs match, return `BLOCKED`. Instruct the user to return to the `/execute` handoff when metadata is missing, or run `/model` to choose a different model, `/new`, confirm `## Current Model` (also shown in the statusline), then rerun the complete copy-paste `/verify` command.
- Otherwise, review the requirements baseline, base and complete candidate diff, relevant implementation, tests, and fresh deterministic evidence. Focus on new correctness, security, operability, compatibility, and material maintainability regressions attributable to the candidate.
- Validate every potentially material finding against the diff, code, tests, repository rules, type information, or fresh command output. Confirmed findings and material concerns that cannot be confidently dismissed are `BLOCKED`. Record pre-existing, out-of-scope, duplicate, speculative, unsupported, and non-blocking style findings with concise evidence and rationale.

Do not invoke a separate reviewer tool or parse session logs. Pi performs this semantic review natively under the switched model.

## Final state and report

After every selected check, recapture the initial Git snapshot fields and compare them exactly. A tracked or untracked repository-state change caused by verification is `BLOCKED`; identify the delta and give a non-mutating repair/retry action without repairing it.

Report these sections:

- **Target and scope:** worktree, branch, HEAD, base, requirements source, and committed/staged/unstaged/untracked scope.
- **Risk and review:** behavior classification, semantic-review decision, implementation model and verifier model when required.
- **Fresh evidence:** commands, results, requirements traceability, and selected/skipped/unavailable/inapplicable checks with reasons.
- **Findings:** blocking findings plus non-blocking or rejected findings and rationale.
- **State comparison:** initial versus final snapshot.
- **Next action:** a non-mutating action.

End with exactly one top-level verdict:

- `VERIFIED` only when every applicable layer passed in this run, requirements traceability is adequate, semantic review was independent when required, no blocking findings remain, and the final state matches the initial snapshot.
- `BLOCKED` for every missing prerequisite, ambiguity, failed or unavailable required check, traceability gap, model-separation failure, state mutation, or material finding.
