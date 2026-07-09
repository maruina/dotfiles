---
name: reviewable-pr-workflow
description: "Create and update GitHub PRs that are easy, fast, and confidence-building to review: coherent PR stories, stacked PRs, review-state-based history rewriting, evidence links, safe force-pushes, reviewer guides, and git-machete stack mechanics."
---
# Reviewable PR Workflow
Use when creating, updating, splitting, restacking, cleaning up, or reviewing a GitHub PR.

Goal: make the PR easy to review. The reviewer should see the motivation, focused scope, reading order, evidence, tests, and no accidental commit noise.

## Core principle
Treat a PR as a review artifact. Because PRs are squash-merged, branch commits should tell the best review story, not preserve every intermediate mistake.

## Rewrite policy
The boundary is **human review state**, not whether the PR is open.

Before human review starts:
- Rewrite freely to improve reviewability: rebase, squash, fixup, split, reorder, drop accidental files, and restack.
- Push rewritten branches with `git push --force-with-lease`.
- Regenerate reviewer-guide commit links from final pushed SHAs.

After human review starts:
- Preserve branch history by default.
- Address feedback with new commits and normal pushes.
- Merge upstream instead of rebasing unless the user explicitly asks to rewrite.

Human review means a review, PR comment, or diff comment from a human other than the PR author. Author comments, bots, Codex, and agents do not count. If uncertain, assume review started.

If the user explicitly asks to rewrite after review, state that commit SHAs and GitHub review affordances may be disrupted, then use `--force-with-lease` and update the PR body.

Explicit rewrite intent includes: “remove from history,” “drop from branch,” “clean up commits,” “squash,” “fixup,” “reorder,” “split,” “force-push,” and “reset for review.”

## PR shape
A reviewable PR has:
- one clear purpose,
- a title that says what changed,
- a `## What` section with the final state,
- a `## Why` section with motivation and tradeoffs,
- a reviewer guide with reading order and scrutiny points,
- commits that match the guide,
- tests or validation notes,
- evidence links when external proof helps,
- no accidental files, temporary scripts, noisy fixups, or confusing commit order before review.

Split into a stack when one PR mixes independent concerns, touches many subsystems, exceeds roughly 400 non-generated net lines, touches more than about 15 non-generated files, or needs more than five reviewer-guide topics.

## Commit story
Good review commits are independently understandable, ordered for reading, scoped to one topic, and named clearly.

Before review, fold typo, lint, test, accidental churn, and self-review fixes into the commit where they belong. After review, use new commits for feedback.

Useful commands:
```fish
git log --reverse --format="%H %s" origin/<base>..HEAD
git diff --stat origin/<base>..HEAD
git diff --name-status origin/<base>..HEAD
git commit --fixup <sha>
git rebase -i --autosquash origin/<base>
git push --force-with-lease
```

Never use plain `git push --force`.

## Stacked PRs
Use Matteo's branch names:
- `maruina/<jira-ticket>` when a Jira ticket exists,
- `maruina/<branch-name>` otherwise.

Use git-machete for mechanics:
```fish
git machete status -l
git machete add -y maruina/<name>
git machete traverse -y --return-to=here
git machete traverse -y --push --return-to=here
git machete github create-pr --draft
git machete github retarget-pr
git machete clean
```

When rewriting a stacked branch, restack descendants and push all affected branches. Do not rewrite only a parent and leave descendants based on old commits. If rewriting a reviewed parent would force rewriting a reviewed descendant, stop and ask unless the user explicitly requested a stack rewrite.

Stacked PR bodies start with:
```markdown
> 📦 **Stacked PR <pos> of <total>** — part of [<TICKET>](<jira-url>)
>
> - PR 1: <label> — #<pr1>
> - PR 2: 👉 **<label> (this PR)** — #<pr2>
> - PR 3: <label> — #<pr3>

---
```

Keep labels short, list PRs in dependency order, and keep the block consistent across the stack.

## PR body template
```markdown
## What
One sentence describing the final state.

## Why
Two to four sentences explaining motivation, context, and tradeoffs.

## Reviewer guide
> Read the commits in this order. Open each via its link below and comment there — those are first-class PR review comments. Do **not** open commits via the `/commit/<sha>` URL; comments there do not show up in the PR.

| # | Commit | Files | What to look for |
|---|--------|-------|------------------|
| 1 | [short-sha](https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>) | `file.go` | specific scrutiny |

## Evidence
- Links or commands that support the change.

## Tests
- Validation command or scenario.
```

Omit `## Evidence` when code and tests are enough. Add `## Lessons learned` only for reviewer-relevant surprises or tradeoffs.

Commit links in reviewer guides must use `/pull/<pr>/changes/<full-sha>`, never bare `/commit/<sha>` links.

## Reporting
When creating or updating a PR, report:
- PR URL,
- whether human review started,
- whether history was rewritten or preserved,
- whether `--force-with-lease` was used,
- whether stack descendants were restacked or pushed,
- title/body changes,
- tests or validation run,
- evidence added or intentionally omitted,
- assumptions and tradeoffs.
