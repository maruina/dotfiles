---
description: Simplify recently changed code without altering behavior
argument-hint: "[<plan-path | pr-url | worktree-path | file-path>] [--implemented-by <exec-id>] [--base <ref>] [--task <quoted-original-request>]"
---
# Simplify
Target:

> $ARGUMENTS

Simplify code for clarity and maintainability while preserving behavior exactly. This pass is separate from refactoring within `/execute`.

<HARD-GATE>
Do not change behavior. Existing tests must pass before and after; run the focused tests for the touched code first, and again after simplifying. If no tests cover the touched code, say so and stop rather than guessing at behavior. Do not add features, abstractions, or configurability. Do not start on `main` or `master` without explicit user consent.
</HARD-GATE>

## Stage runner
For a `/stage-runner` attempt, write only the requested private JSON handoff outside Git, at the supplied path and in the supplied schema. Do not push, publish, apply, or create a PR. Check the supplied feature baseline, requirements plan blob, and current candidate before work. Use the pinned plan for requirements and the current plan as the progress ledger. Stop on a mismatch. Require a clean candidate worktree at stage start.

## Handoff metadata
`--implemented-by` is handoff metadata. For a plan, accept repeatable `--implemented-by <id>` and preserve every writer ID. `--task` carries exact planless requirements. Strip `--implemented-by`, `--task`, and `--base` before target resolution; treat everything after `--task` as literal text, not flags. A plan path is the requirements source when present; use `--task` only for planless work. Preserve the exact original task and base meaning.

## Scope
For direct plan-backed work, require all execution tasks complete and review the full implementation from the feature base. Stop if the base or writer provenance is unclear. Otherwise default to recently changed code. Trace affected flows and callers beyond the diff, but edit only changed code and immediate context. For planless work, use the supplied `--task` or exact original request; do not infer it from the diff or summary. Ask if neither is available.

## Target Resolution
Resolve the first positional target after handoff metadata; switch to its worktree before reading or editing. `--base` sets the diff base, never the target.

- **Plan** — use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md`.
- **File** — use `resolve-worktree` (no glob); simplify only that file.
- **Worktree/directory** — use `resolve-worktree` (no glob); simplify its branch diff.
- **PR URL** — use `feature-worktree`; use the PR base unless `--base` overrides it.
- **No target** — review current changes, or the branch diff when the tree is clean.

## Worktree Policy
Before edits, use the `feature-worktree` skill to continue in or create the resolved feature worktree.

## Delegate the "how"
Use `skill-loader` to select and load skills for touched files; follow their guidance and `AGENTS.md`. Follow each loaded skill's reference-selection instructions; a core skill is not a substitute for reading an applicable reference. For unfamiliar code, also load `codebase-research`. Record provenance per the `## Provenance record` section of the `skill-loader` skill.

## Review Procedure
Read changed code and relevant tests in bounded sections. If a tool response is truncated, retrieve the missing sections before drawing conclusions; if unavailable, report the evidence gap and stop.

Complete two bounded review passes before editing or concluding no simplification is needed:
1. **Production code:** inspect state, control flow, ownership, and repeated work.
2. **Tests:** inspect distinct contracts, overlapping cases, independent dimensions, repeated setup, and expensive scenarios. Sharing a helper does not establish that test execution or coverage is nonredundant.

For a pass with no applicable files, record it as inapplicable. Keep reviews in scope and use loaded language skills. For each removed or merged test, name the contract it covered, the retained test that covers it, and why the removed combination adds no distinct interaction coverage. Fewer cases and unchanged statement coverage do not prove equivalent protection; retain interaction cases unless redundancy is established.

## Simplification Lens
Understand the behavior first. Follow the active decision ladder and stop at the first option that fully preserves behavior. Prefer bounded changes that remove concepts, branches, wrappers, duplicate logic, or needless indirection; reuse canonical helpers and ownership boundaries, and state invariants when that clarifies control flow.

A change must materially reduce reader concepts, branches, duplication, indirection, or ambiguity at a type/API/ownership boundary. Reject cosmetic line-count changes, complexity moved between files, new abstractions, or changes that alter sequencing, atomicity, error behavior, security, accessibility, or observability. If no material simplification exists, make no change.

## Guardrail
Simplicity serves the reader, not brevity. Keep useful abstractions, seams, and names. Do not harm debugging, error messages, or maintainability, or churn clear code.

Skip cosmetic changes. If no change is needed, continue to Handoff.

## Commit
Snapshot `git status --porcelain=v1 --untracked-files=all`. Commit changed simplifications only if the worktree started clean:
- After tests pass, stage only files changed here and commit with a descriptive `refactor:` message.
- If code changed with a plan, add a short ledger note in that commit so `/verify` can account for it. Record a learning candidate with the `learning-candidates` skill if a materially simpler path was initially missed.
- Push only when the branch has an open PR or configured upstream; never force-push. Otherwise report that the commit is local.
- When no code change was made, do not write a ledger-only note or create an empty commit. Report unchanged.

If the worktree started dirty, do not commit; report changes as uncommitted with the pre-existing changes.

## Stop Conditions
Stop and ask if the target, branch, base, or worktree is ambiguous; the worktree is `main`/`master` without consent; instructions are unclear or conflicting; tests cannot establish behavior; a behavior change cannot be proven safe; or loaded skills conflict with repository guidance.

## Handoff
Use one exact command per standalone `md` fenced block. Quote paths with spaces. Keep prose outside. Omit commands with missing arguments.

Summarize the diff, tests before and after, items left alone, and commit message/hash or why no commit was made. Include **Skills loaded and used** as a `Skill | Source | Why loaded | How used` table; explicitly say when none were needed.

For a stage-runner attempt, write the requested handoff even when unchanged. The runner starts fresh `/verify`.

In direct mode, plan-backed work requires a fresh `/verify` even when unchanged. For planless work, an earlier independent verdict remains valid only for the exact candidate and requirements. Use the original plan path or exact task. If the requirements or any `--implemented-by` ID is missing, ask the user before emitting `/verify`; do not infer it. Report all execution IDs and the stable provider-qualified simplification ID from `## Current Model`; ask if it is missing.

Execution model IDs: `<exec-id>`
Simplification model: `<name> (<simp-id>)`

- `/verify <absolute-plan-path> --implemented-by <exec-id> --simplified-by <simp-id>`; repeat `--implemented-by <exec-id>` for every writer ID.
- `/verify --implemented-by <exec-id> --simplified-by <simp-id> --task <quoted-original-request>`

Quote the task as one single-quoted Pi argument and escape each embedded apostrophe as `\'`. Preserve whitespace, quotes, flags, and literal `$ARGUMENTS`. For manual verification, run `/model`, pick a model different from every writer, run `/new`, and confirm `## Current Model`.
