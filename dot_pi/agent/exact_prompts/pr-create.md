---
description: Create a draft GitHub PR with a clear explanation of the change
argument-hint: "[--base <branch>] [context]"
---
# PR Create
Arguments: `$ARGUMENTS`

Create the first GitHub PR for the current branch. Use `/pr-update` when the branch already has a PR.

Read `reviewable-pr-workflow` before acting. It is the source of truth for PR bodies, history, stacks, and reporting. For stacked PRs, also read `github-stacks` and use GitHub's native stack workflow.

Creating a PR is the explicit side effect of this command. Create it as a draft.

## Phase 1: Establish PR state
Parse `--base <branch>`. All remaining arguments are task context.

If `--base` is absent, use the parent branch from `gh stack status` when the current branch is in a native stack; otherwise use `main`.

Run:

```bash
git status --short
gh pr view --json number,url,title,body 2>/dev/null || true
git log --oneline "origin/$base..HEAD"
git diff --stat "origin/$base..HEAD"
git diff --name-only "origin/$base..HEAD"
```

If `gh pr view` finds a PR, stop and direct the user to `/pr-update`.

Handle uncommitted changes before creating the PR:
- Inspect enough of the diff to determine whether it belongs in this PR.
- If the user requested a commit, or the intended commit is clear from the task context and diff, stage only those files and create a Conventional Commit.
- If intent is unclear, propose a commit message and ask. Do not create a PR until the user answers.
- Leave unrelated changes unstaged and report them.

After committing intended changes, rerun the branch-diff commands. If the branch has no diff from `origin/$base`, stop: there is nothing to open.

Read repository guidance in the root and changed package directories. Locate relevant `plans/**/design.md` and `plans/**/plan.md` artifacts, OpenSpec proposals or specs, and linked issue context.

## Phase 2: Prepare a reviewable change
Read the significant diff and relevant design artifacts. Build the explanation from the problem, behavior, design choices, and representative examples, following `reviewable-pr-workflow`. Identify tests and supporting evidence. Ignore generated files unless they are needed to understand or verify the change.

Before writing the description, compare the full diff with the task context, proposal or spec, and linked issue. Check:
- **Need:** Assess whether the evidence supports the problem, necessity, and scope. Do not present the author's rationale as independent validation.
- **Scope:** Call out changed files or behavior that do not match the stated intent or lack an explanation.
- **Hard-to-reverse contracts:** Check gRPC and other public APIs, program parameters, data models and fields, and database schemas for compatibility, migration, and rollout risks.
- **Go architecture and startup:** Inspect relevant interfaces, implementations, and callers. If no interface changes, assess whether that fits existing patterns; do not require an interface by default. For bootstrap changes, check that dependencies are available in order and do not introduce cycles.
- **Operability:** Identify new failure modes and what an on-call engineer would need at 4 a.m. Check diagnosis and recovery signals, including useful errors, logs, metrics, and traces, bounded metric cardinality, and sensitive log data.

Use these checks to prepare the explanation, not to generate a reviewer checklist. Explain supported constraints and failure behavior in the narrative. Report unresolved blockers separately and ask before proceeding when they require a decision. Do not invent concerns for unaffected areas.

Apply the split and commit-story guidance in `reviewable-pr-workflow`:
- If the change should be a stack, propose the stack and ask before restructuring it.
- If the change remains one PR but commits do not tell the review story, propose a one-commit-per-topic rewrite and ask before rewriting.
- After an approved rewrite, verify a clean working tree and that the final diff contains only intended changes.

## Phase 3: Push and create the draft PR
Draft a title and body using the `reviewable-pr-workflow` template. Include an optional `## Design & implementation plan` section only when matching plan artifacts exist:
- link `design.md` as the reviewer-facing design record;
- link `plan.md` as optional implementation context.

For a native stack, run `gh stack submit` and capture the PR URLs and numbers it reports. Do not push or create the stack's PRs separately. For a standalone branch, push it and create a draft PR:

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --draft
```

Before setting the final body, verify that the explanation, examples, and code references match the pushed branch.

For a native stack, confirm GitHub displays the full stack after submission. Do not add a manual stack-navigation block to PR bodies.

## Report
Report per the workflow skill, plus:
- the base branch;
- whether a stack was proposed;
- the explanation and examples included;
