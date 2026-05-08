---
name: pr-comment-triage
description: Triage GitHub PR review comments or whole PRs. Use when given a GitHub PR URL or review discussion URL and asked to assess comments, decide whether they apply, and propose or implement fixes.
---

# PR Comment Triage

Use this skill when the user provides a GitHub pull request URL or a specific PR review discussion URL such as `#discussion_r123`.

## Goal

Read PR feedback, inspect the local repository, determine whether comments still apply, and propose a concrete solution. Do not edit files unless the user explicitly asks to apply fixes.

## Inputs

Supported inputs:

- PR URL: `https://github.com/ORG/REPO/pull/NUMBER`
- Review discussion URL: `https://github.com/ORG/REPO/pull/NUMBER#discussion_rID`

## Workflow

1. Parse the URL:
   - owner
   - repo
   - PR number
   - optional review comment id from `discussion_rID`

2. Verify the local checkout matches the PR repository:

   ```bash
   git remote -v
   git status --short
   gh repo view --json nameWithOwner,url
   ```

3. Fetch PR context:

   ```bash
   gh pr view <PR> --json number,title,body,state,author,baseRefName,headRefName,headRepositoryOwner,mergeStateStatus,reviewDecision,url
   gh pr diff <PR>
   gh pr view <PR> --json files,reviews,comments
   ```

4. Fetch review comments.

   Prefer GitHub API because `gh pr view` may omit enough review-thread context:

   ```bash
   gh api repos/ORG/REPO/pulls/PR/comments --paginate
   gh api repos/ORG/REPO/issues/PR/comments --paginate
   gh api repos/ORG/REPO/pulls/PR/reviews --paginate
   ```

5. If a specific `discussion_rID` is supplied:
   - Find the review comment whose `id` matches the numeric suffix.
   - Focus only on that comment and its thread/replies when available.
   - If the comment cannot be found, say so and show the commands attempted.

6. For each selected comment, inspect:
   - `path`
   - `line` / `original_line`
   - `side`
   - `diff_hunk`
   - `body`
   - replies in the same thread if available
   - current file contents
   - related symbols and references as needed

7. Classify the comment:

   - `applies`: current code still has the issue
   - `already-fixed`: current code already addresses it
   - `stale`: comment references code no longer present
   - `needs-author-decision`: valid concern but multiple acceptable choices
   - `unclear`: insufficient context or ambiguous reviewer intent

8. Propose a solution.

   Include:
   - why the comment does or does not apply
   - exact file paths
   - recommended code change or response
   - risk/trade-off
   - confidence

9. Before editing:
   - Ask for confirmation unless the user explicitly requested implementation.
   - If implementing, make minimal targeted edits.
   - Run relevant tests or validation commands.
   - Summarize diff and proof.

## Output format

For one comment:

```markdown
## Comment

<short quote or summary>

## Assessment

Status: applies | already-fixed | stale | needs-author-decision | unclear

<why, with file evidence>

## Proposed solution

<recommended change or response>

## Risk

<risk/trade-off>

## Next step

<ask whether to apply, or state applied + validation>
```

For a full PR:

```markdown
## Summary

- Total comments reviewed:
- Applies:
- Already fixed:
- Stale:
- Needs decision:
- Unclear:

## Comments

### 1. <file:path>

Status: ...

<assessment and proposed solution>
```

## Rules

- Do not assume review comments apply; inspect current code first.
- Do not edit generated files unless repository instructions allow it.
- Do not resolve or reply to GitHub comments unless explicitly asked.
- Prefer `gh` for GitHub operations.
- Keep changes minimal.
- If local branch is not the PR head, warn before analysis.
