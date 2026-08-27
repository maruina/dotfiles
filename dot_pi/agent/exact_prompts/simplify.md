---
description: Simplify recently changed code without altering behavior
argument-hint: "[<pr-url> | <worktree-path> | <file-path>] [--base <ref>]"
---
# Simplify
Target:

> $ARGUMENTS

Simplify code for clarity and maintainability while preserving behavior exactly. This is an opt-in refinement pass, distinct from the within-step "refactor after green" in `/execute`: it reviews the whole recent diff and improves it as a unit.

Lifecycle: `/brainstorm` creates a committed design spec, `/plan` creates a committed implementation plan, `/systematic-review` validates code or plans, `/execute` implements verified changes, `/simplify` optionally refines them, and `/learn` captures evidence-backed guidance after the work lands.

<HARD-GATE>
Do not change behavior. Existing tests must pass before and after; run the focused tests for the touched code first, and again after simplifying. If no tests cover the touched code, say so and stop rather than guessing at behavior. Do not add features, abstractions, or configurability. Do not start on `main` or `master` without explicit user consent.
</HARD-GATE>

## Scope
Default to recently changed code, not the whole repository. Stay within the changed lines and their immediate context; do not expand into untouched code.

## Target Resolution
Resolve the target from the first positional in `$ARGUMENTS` and switch context to the owning worktree before reading repository files or modifying code. Strip a trailing `--base <ref>` before resolving; use `<ref>` as the diff base when supplied.

- **File path** — resolve it with the `resolve-worktree` skill (no `$GLOB`). Simplify only that file.
- **Worktree or directory path** — resolve it with the `resolve-worktree` skill (no `$GLOB`). Simplify the branch diff there against its base.
- **PR URL** — follow PR URL resolution below.
- **No positional** — simplify the current checkout's working-tree changes, or the branch diff against its base when the tree is clean.

### PR URL resolution
A PR URL selects the PR's feature worktree, not the current checkout.

1. Extract `ORG`, `REPO`, and `PR_NUMBER` from the URL.
2. Read PR metadata with `gh pr view <url> --json headRefName,baseRefName,headRepositoryOwner`. Record `headRefName` as the working branch and `baseRefName` as the diff base unless `--base` overrides it. When `headRepositoryOwner.login` differs from `ORG`, the head is on a fork.
3. Locate an existing worktree on `headRefName`: run `git worktree list --porcelain` from any checkout of `ORG/REPO` and match by branch name. If exactly one matches, switch context there and use its current state; do not reset or discard local changes.
4. If none matches, locate an existing checkout of `ORG/REPO` (current repo, `~/dd/REPO`, or `~/go/src/github.com/ORG/REPO`). If none exists and `ORG` is `DataDog`, clone into `~/dd/REPO`; otherwise ask where to clone.
5. Create a feature worktree at the PR head following the Worktree Policy below. From the located checkout, fetch the head branch and create the worktree on it. When the head is on a fork, create the worktree at the default branch and run `gh pr checkout <PR_NUMBER>` inside it instead.
6. Switch context to the resolved worktree. If the branch, base, or worktree location is ambiguous, stop and ask.

Do not move HEAD in the current checkout to inspect a PR. Use a worktree.

## Worktree Policy
Prefer feature worktrees for simplification work.

- If a path or PR URL resolves to a worktree, switch to that worktree and continue there.
- If already in the correct feature worktree, continue there.
- If in a base checkout on `main` or `master`, create or switch to a feature worktree before simplifying unless the user explicitly asks not to.
- For Datadog repositories, use `~/dd/.worktrees/<repo-name>-<branch-slug>` unless repository guidance says otherwise.
- Stop and ask if the branch, base branch, or worktree location is ambiguous.

## Delegate the "how"
Do not restate style rules here. Before proposing or making simplifications, use the `skill-loader` skill to determine which language and domain skills to read based on the touched files. Load those skills and defer to them, plus the repository's `AGENTS.md`.

If the touched code is in an unfamiliar area, also load `codebase-research` before changing it. Match the repository's existing conventions over any general preference.

Keep a record of each skill actually read and applied: source (`skill-loader`, `prompt-required`, `user-requested`, or `agent-selected`), why it was loaded, and how its guidance affected simplification. Include workflow skills such as `resolve-worktree` or `skill-loader` when their instructions were actually followed. This provenance is feedback for improving `skill-loader`; do not infer use from skills merely named in this prompt or another artifact.

## Guardrail
Simplicity serves the reader, not brevity. Do not:

- remove a useful abstraction, seam, or name that aids understanding
- collapse code in a way that harms debuggability or error messages
- trade maintainability for fewer lines
- churn code that is already clear

If a change is cosmetic-only with no clarity gain, skip it. If nothing is worth simplifying, say so and stop.

## Stop Conditions
Stop and ask rather than continuing when:

- the target, branch, base, or worktree location is ambiguous
- the resolved worktree is on `main` or `master` without explicit user consent
- an instruction is unclear or multiple interpretations exist
- no tests cover the touched code, so behavior cannot be confirmed before and after
- a simplification would change behavior and cannot be proven safe
- a loaded skill or repository guidance conflicts with the proposed simplification

## Handoff
Report the simplification diff, the verification commands run before and after, and anything you deliberately left alone. Include **Skills loaded and used** as a `Skill | Source | Why loaded | How used` table for every skill read and applied during simplification; explicitly state when none were needed. Then say exactly:

I finished simplifying the changes. This changed the diff, so any earlier `/verify` verdict is stale — run a fresh `/verify` closeout before relying on it: choose a model different from the one that made these edits, run `/new`, confirm the injected `## Current Model`, then run `/verify` against the plan or task.
