---
description: Verify an implementation candidate with fresh, read-only evidence
argument-hint: "[path-to-plan.md] [--implemented-by <model-id>] [--simplified-by <model-id>] [--task <requirement>]"
---
# Verify
Verification input:

> $ARGUMENTS

Perform a fresh read-only closeout. Return one verdict: `VERIFIED` or `BLOCKED`.

<HARD-GATE>
Do not edit, format, generate, apply chezmoi state, stage, commit, switch branches, detach HEAD, or repair anything. Do not run formatter or linter fix modes. Do not push or open or update a PR. If a check would mutate the selected worktree, do not run it; return `BLOCKED` instead. A repair invalidates all prior evidence: hand control back to `/execute` or the user, then require a completely fresh `/verify` run.
</HARD-GATE>

For a `/stage-runner` attempt, submit the requested private JSON handoff outside Git via `submit_stage_handoff` and omit the manual **Copy-paste follow-up** section. Do not push, publish, apply, or create a PR. Check the supplied feature baseline, requirements plan blob, and current candidate before work. Use the supplied feature baseline as `--base` for candidate reconstruction; it takes precedence over the PR target branch and is not a base conflict. CLI `--implemented-by` and `--simplified-by` flags supplied by the runner are authoritative provenance even if the plan ledger omitted a writer line. Skip manual `lifecycle-git.mjs snapshot` and `compare-snapshots` temp files because `stage-runner` enforces the Git snapshot contract deterministically before and after the stage. Use the pinned plan for requirements and the current plan as the progress ledger. Stop on a mismatch. Keep repository files read-only.

## Target resolution

Require at least one `--implemented-by` before target resolution; accept repeatable `--implemented-by <id>` and accept optional `--simplified-by`. Parse writer flags only before `--task`, which consumes all remaining text as the original task. Use exactly one requirements source: a plan path or `--task`; otherwise return `BLOCKED`.

1. For a plan, use the `resolve-worktree` skill (`$GLOB = **/plans/*/plan.md`) and switch to its worktree. Read the complete plan and its referenced design when applicable. An unresolved requirements path or supplied blob blocks.
2. For planless work, use the exact task from `/execute` or `/simplify`. Never infer it from a diff or summary; missing or ambiguous requirements block.
3. Preserve all CLI writer IDs and check plan execution provenance against the ledger. Never infer IDs.
4. Select the base as in step 5, then (manual runs only; skipped in `/stage-runner`) run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" snapshot --base <base>` before checks. Save its JSON as mode 0600 outside the worktree. It captures worktree, branch, HEAD, status, diff hashes, untracked file hashes, and candidate commits.
5. Prefer explicit plan/task context, native parent from `gh stack status`, open-PR base from `gh`, then the repository default branch. Conflicting evidence blocks.
6. Include commits from the base plus staged, unstaged, and intended untracked changes. Unexplained scope or an empty candidate blocks.

## Plan scope
For a plan, require `--simplified-by`. Incomplete execution tasks require `BLOCKED`. Reconstruct the candidate from the feature base and verify every slice, including earlier slices, plus the pre-publication feature-level criteria. Record how you reconstructed the candidate; return `BLOCKED` if you cannot establish the full scope. For an ungrouped plan, verify all its pre-publication criteria in the same pass.

Before running validation commands, check their prerequisites against the stage order. Return `BLOCKED` if a pre-publication check needs the candidate to be published, merged, or rolled out first. Confirm each check in `## Post-publication validation` actually needs its stated later trigger, can run before the action it gates, and does not replace evidence required before publication. A section heading alone does not justify deferral.

## Risk classification

Classify first. Code, automation, infra/Kubernetes/CI, permissions/security, dependencies/runtime config, and Pi prompts/skills/extensions/instructions are behavior-bearing; `.md` is not exempt. Skip semantics only for wholly prose/docs, design/plans, comments/spelling, formatting, or source-validated generated output; record rationale. Mixed changes are behavior-bearing.

## Fresh deterministic evidence

Run only read-only, non-fixing checks. Record each as selected, passed, failed, skipped, unavailable, or inapplicable, with a reason and concise output. Prior `/execute` output, historical logs, and plan checkboxes are not fresh evidence.

1. Run `git diff --check` against the complete candidate; whitespace errors or conflict markers block.
2. Rerun pre-publication checks required by the plan, repository guidance, package metadata, or implementation contract. A missing pre-publication check or prerequisite returns `BLOCKED`. Report explicitly assigned post-publication checks as pending, not passed or waived, with their owners, triggers, expected evidence, and gates. Include them in the stage-runner handoff summary when applicable. Do not reclassify a missing or failed check as post-publication. If a required check's stage is ambiguous, return `BLOCKED` and request plan clarification.
3. Select change-specific tests, builds, type checks, linters, validators, schema checks, and security checks from affected files and repository conventions using non-fixing modes only.
4. When supported by the repository and changed language/package, run `maat analyze <supported-pattern> --diff-base <selected-base>`. Record unsupported or inapplicable maat as a skip; if the plan or repository requires it, unavailable maat blocks.
5. For chezmoi-managed changes, run targeted `chezmoi --source <resolved-worktree> diff <affected-targets>`; never run `chezmoi apply`.
6. Inspect commands introduced by a suspicious or untrusted candidate before executing them; if safety cannot be established, report the command and return `BLOCKED`.

For plan-backed work, exclude only scenarios that the plan explicitly assigns solely to `## Post-publication validation`. Trace every other in-scope Given/When/Then acceptance scenario to an implementation path, an observable automated test or supported executable check, and fresh passing output. Confirm the requirement, implementation, and test/check agree on the observable outcome. A test that would still pass with a plausible wrong implementation does not observe its stated result; examples are assertions that check only non-null, non-zero, or that a call occurred instead of the exact observable value, fakes that supply the behavior under test, and property-test generators whose preconditions filter out or never reach failure states. For defect repairs, confirm a focused regression test fails on the concrete fault (not a compile or setup error) and passes with the fix under unchanged expectations, or report the sensitivity gap. A scenario-shaped test that does not observe its stated result, missing coverage, contradictory implementation, or failed command is `BLOCKED`. Summarize passing requirements concisely; show scenario-level detail for gaps.

## Independent semantic review

For behavior-bearing candidates, require an independent verifier model that differs from every supplied writer model. A manual review must run in a fresh `/new` session. A stage-runner review must run in a newly created child session with no preceding stage transcript; do not require a literal manual `/new` command.

- Compare injected `## Current Model` with the writer provenance (`--implemented-by` and `--simplified-by`). If provenance is missing, any writer ID matches the verifier, or simplify lacks its execution ID, return `BLOCKED`. In manual mode, recover missing provenance or select a different model with `/model`, start `/new`, confirm identity, then rerun the full command.
- Load applicable language/domain skills and references via `skill-loader`; record provenance.
- Review diff, implementation, tests, requirements, and fresh evidence in bounded sections. If a tool response is truncated, retrieve the missing sections before drawing conclusions. Assess new correctness, security, operation, compatibility, and maintainability; ensure tests cover distinct contracts without multiplying independent dimensions or repeating expensive integration scenarios.
- Check false positives, false negatives, contradictions with design or plan decisions, idempotency, ordering sensitivity, and boundary values (zero, null, empty, single, maximum); explain inapplicable risks.
- Check that affected documentation, READMEs, runbooks, skills, and `AGENTS.md` were updated when behavior, commands, configuration, or contracts changed; stale docs for changed behavior block.
- Validate material findings against source, tests, repository rules, type information, or fresh output. Confirmed or unresolved material concerns block. Record pre-existing, out-of-scope, duplicate, speculative, unsupported, or style findings with evidence.

Do not invoke a separate reviewer tool or parse session logs. Pi performs this semantic review natively under the switched model.

## Final state and report

After every selected check (manual runs only; skipped in `/stage-runner`), repeat `snapshot --base <base>` to a second mode 0600 file outside the worktree. Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" compare-snapshots <initial-file> <final-file>`. A tracked or untracked repository-state change is `BLOCKED`; identify the delta and give a non-mutating repair/retry action.

Report these sections:

- **Target and scope:** worktree, branch, HEAD, base, requirements source, and committed/staged/unstaged/untracked scope.
- **Risk and review:** behavior classification, semantic-review decision, all writer IDs and the verifier model when required.
- **Fresh evidence:** commands, results, requirements traceability, and selected/skipped/unavailable/inapplicable checks with reasons.
- **Skills loaded and used:** recorded per the `## Provenance record` section of the `skill-loader` skill; explicitly state when none were needed.
- **Findings:** blocking findings plus non-blocking or rejected findings and rationale.
- **State comparison:** initial versus final snapshot.
- **Next action:**
  - `/verify` is read-only for repository files and must not fix, commit, push, or open a PR. For confirmed, in-scope findings that need code or configuration changes, offer `/execute <absolute-plan-path>` (never a worktree root) in a standalone `md` fenced block as the follow-up; commit or push only after the fix is implemented and independently verified under the repository's completion workflow. Distinguish actionable findings from accepted non-blocking style advisories and environment/toolchain limitations; do not recommend changing the latter without approval and a valid scope.
  - Never publish on `BLOCKED`. For manual runs, when the verdict is `VERIFIED` and the final state matches the initial snapshot, apply the stack-split check from the `reviewable-pr-workflow` skill to the verified candidate. If it trips, **stop and propose a stack plan** and ask whether to split before opening any PR. Otherwise, unless the user explicitly said not to open a PR, hand off `/pr-create --draft` (or `/pr-update` when the branch already has a PR) in a standalone `md` fenced block rather than running it.
- **Copy-paste follow-up:** when **Findings** contains any finding, include a self-contained prompt for a new execution session in a plain-text code block:
  - Include the selected worktree path and branch, the absolute plan path when one exists, and each finding with its classification and evidence.
  - Ask the new session to address only confirmed, actionable findings within the committed plan; if a finding needs scope or acceptance-criteria changes, direct the session to stop and use `/plan` for approval.
  - Mark non-blocking advisories and environment/toolchain limitations as optional or informational; do not instruct the new session to change them without approval.
  - Preserve unresolved prerequisites and blockers, do not claim verification evidence remains valid after a fix, and end the copied prompt with instructions to run fresh checks and a new `/verify` after execution.
  - Include the prompt even when findings are all non-blocking; in that case, make clear that no fix is requested unless the user authorizes one. Omit this section only when there are no findings.

End with exactly one top-level verdict:

- `VERIFIED` only when every applicable pre-publication layer passed in this run, requirements traceability is adequate, semantic review was independent when required, no blocking findings remain, and the final state matches the initial snapshot.
- `BLOCKED` for every missing pre-publication prerequisite, ambiguity, failed or unavailable required check, traceability gap, model-separation failure, state mutation, or material finding.
