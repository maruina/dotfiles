---
name: reviewable-pr-workflow
description: "Create and update GitHub PRs that are easy, fast, and confidence-building to review: coherent PR stories, stacked PRs, review-state-based history rewriting, evidence links, safe force-pushes, reviewer guides, and git-machete stack mechanics."
---
# Reviewable PR Workflow

Use this skill whenever creating, updating, splitting, restacking, cleaning up, or reviewing the shape of a GitHub PR.

The goal is reviewer joy: make PRs easy, fast, and confidence-building to review. Reviewers should be happy to get a PR from Matteo because everything they need to understand it is already there: motivation, focused scope, reading order, evidence links, tests, and no accidental commit noise.

## Core principle

Treat a PR as a review artifact. The branch's commits, PR description, and stack position exist to help a reviewer understand the change quickly and confidently.

Because PRs are squash-merged into `main`, branch commits are not permanent project history. They should tell the best review story, not preserve every intermediate mistake.

## Review-state discipline

The boundary is human review state, not whether the PR is open.

Before any human review starts on a PR:
- Rewrite freely when it improves reviewability.
- Rebase, squash, fixup, split, reorder, drop accidental files, and restack as needed.
- Push rewritten branches with `git push --force-with-lease`.
- Regenerate reviewer-guide commit links from the final pushed SHAs.

After any human review starts on a PR:
- Preserve branch history by default for the rest of the PR lifecycle.
- Do not rebase, squash, reorder, drop commits, or force-push.
- Address feedback with new commits and normal pushes.
- Preserve GitHub's review affordances: commit-anchored comments, the PR timeline, and "changes since last review".

Rewrite a human-reviewed PR only when the user explicitly asks to reset or rewrite reviewed history. Before doing it, state the tradeoff. Then use `--force-with-lease`, never plain `--force`, and regenerate the PR body from the new SHAs.

Human review means a review, PR comment, or diff comment from a human other than the PR author. Comments from Matteo or the PR author are author instructions, not human review. Do not treat them as the start of human review, even if they are PR comments, review comments, or diff comments. Bot, Codex, and agent comments do not count. If uncertain, assume human review has started and do not rewrite unless explicitly asked.

Do not refuse rewriting merely because a PR is open. The rewrite boundary is human review state.

Treat these user requests as explicit rewrite intent:
- "remove <file> from commits"
- "remove <file> from history"
- "drop <file> from the branch"
- "clean up the commits"
- "squash", "fixup", "reorder", or "split" commits
- "make the commit table clean"
- "rewrite this PR"
- "force-push"
- "reset for review"

If human review has started and the user uses one of these phrases, proceed after stating that commit SHAs may change and GitHub's "changes since last review" or commit-anchored comments may be disrupted. If human review has started and rewrite intent is ambiguous, ask before rewriting.

Example:
- User: "Remove `scripts/fix_rmp_rms_subnets.py` from commits."
- Correct: rewrite the branch so the file is removed from the commit where it was introduced, then push with `--force-with-lease`.
- Incorrect: add a new commit that deletes the file just because the PR is open.

## What makes a PR joyful to review

A joyful PR has:
- One clear purpose.
- A title that says what changed.
- A `## What` section that states the final state in one sentence.
- A `## Why` section that explains motivation, context, and tradeoffs.
- A reviewer guide that gives a reading order and says what to scrutinize.
- Commits that match the reviewer guide.
- Tests or validation notes that make risk legible.
- Evidence links so reviewers do not need to hunt: logs, example queries, dashboards, metrics, traces, screenshots, issue links, incidents, design docs, and official documentation.
- No accidental files, temporary scripts, noisy fixups, or confusing commit ordering before first human review.

Prefer small PRs. If the reviewer cannot hold the change in their head in one sitting, split it into a stack.

## Commit story

Good review commits are:
- independently understandable
- ordered in reading order
- scoped to one review topic
- named with concise, descriptive messages
- free of temporary artifacts and accidental churn

Before human review, fold these into the commit where they belong:
- typo fixes
- lint fixes
- test fixes
- accidental file removals
- small review/self-review corrections
- "address comment" commits created before a human reviewed the PR

Use a new commit when it is a meaningful new review step or when human review has already started.

## Safe rewriting

Use rewriting to improve the PR story before human review:

```fish
git log --reverse --format="%H %s" origin/<base>..HEAD
git diff --stat origin/<base>..HEAD
git diff --name-status origin/<base>..HEAD
```

Common tools:

```fish
git commit --fixup <sha>
git rebase -i --autosquash origin/<base>
git rebase -i origin/<base>
git reset --soft origin/<base>
git push --force-with-lease
```

Never use plain `git push --force`.

Do not create backup branches by default. Create one only for risky manual rewrites where a recovery point is useful.

## Human-reviewed PR updates

Once human review has started, prefer chronological response commits:

```fish
git add <files>
git commit -m "fix: address reviewer feedback"
git push
```

If upstream needs to be incorporated into a human-reviewed PR, merge rather than rebase unless the user explicitly asks to rewrite:

```fish
git merge origin/<base>
git push
```

This preserves GitHub's "changes since last review" and keeps existing comments anchored.

## Stacked PRs

Use stacked PRs when one PR would be too large or mix multiple concerns. Each PR in the stack should be independently reviewable and should tell one part of the story.

Use Matteo's branch naming:
- `maruina/<jira-ticket>` when a Jira ticket exists.
- `maruina/<branch-name>` otherwise.

Git-machete is the preferred tool for stack mechanics:

```fish
git machete status -l
git machete add -y maruina/<name>
git machete traverse -y --return-to=here
git machete traverse -y --push --return-to=here
git machete github create-pr --draft
git machete github retarget-pr
git machete clean
```

For branches that have not received human review, rebasing/restacking keeps the stack readable.

For branches with human-reviewed PRs, preserve history by default. If rewriting a parent would force rewriting a human-reviewed descendant PR, stop and ask unless the user explicitly requested a stack rewrite.

## Rewriting stacked PRs

Before human review, or with explicit user approval after review:

1. Inspect the stack:
   ```fish
   git machete status -l
   ```
2. Rewrite the target branch into the desired review story.
3. Restack descendants onto the rewritten parent.
4. Push affected branches with `git push --force-with-lease` or an equivalent git-machete push that does not use plain force.
5. Update affected PR bodies so stack navigation and commit tables match the final SHAs.

Do not rewrite only a parent and leave descendants based on old commits.

## Splitting into a stack

Split when a PR would be hard to review as one unit. Strong signals:
- The change touches multiple independent subsystems or concerns.
- The change is roughly more than 400 net lines of non-generated, non-test code.
- The change touches more than about 15 non-generated files.

Soft signals:
- The reviewer guide would need more than five topics.
- Commits already fall into independent groups.
- The branch mixes refactor, feature, and behavior change work.

A good stack has one branch per reviewable step in dependency order. Prefer bottom-up PR creation.

## Evidence-based review

Make claims reviewable. If the PR says a behavior changed, a bug is fixed, a migration is safe, or a risk is low, include evidence that lets the reviewer verify that claim without hunting.

Evidence can be:
- a test command and relevant output
- a CI job link
- a Datadog log, metric, trace, monitor, dashboard, or notebook link
- an example query
- a Kubernetes event, audit log, pod description, or deployment link
- a screenshot or recording
- a link to official docs
- a Jira issue, incident, RFC, design doc, or Slack thread with decision context

Prefer durable links and reproducible commands. Include the query text, command, or time window when the link alone is not enough. If evidence is sensitive or ephemeral, summarize what you found and explain how a reviewer can reproduce it.

Do not bury evidence in a long narrative. Put evidence near the claim it supports, or use a dedicated `## Evidence` section for larger PRs.

## PR body

Use this shape unless the repository has a stronger convention:

```markdown
## What

One sentence describing the final state of the PR.

## Why

Two to four sentences explaining why this change exists.

## Reviewer guide

> Read the commits in this order. Open each via its link below and comment there — those are first-class PR review comments. Do **not** open commits via the `/commit/<sha>` URL; comments there do not show up in the PR.

| # | Commit | Files | What to look for |
|---|--------|-------|------------------|
| 1 | [short-sha](https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>) | `file1.go`, `file2.go` | specific things to verify or scrutinize |

## Lessons learned

- Optional reviewer-relevant insights.

## Evidence

- Links to logs, metrics, dashboards, traces, queries, docs, tickets, incidents, or other artifacts that support the change or explain the context.

## Tests

- Test command or validation scenario.
```

Only include `## Lessons learned` when there is something reviewer-relevant: scope changes, surprising failure modes, validation discoveries, agentic/self-review discoveries, or meaningful tradeoffs. Do not use it as a historical changelog.

Only include `## Evidence` when external artifacts help reviewers understand, verify, or trust the change. Omit it for small self-contained PRs where tests and code are sufficient.

Commit links must use the in-PR review surface:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

Never use bare `/commit/<sha>` links in the reviewer guide.

After any rewrite, regenerate the commit table from:

```fish
git log --reverse --format="%H %s" origin/<base>..HEAD
```

## Stack navigation block

For stacked PRs, the PR body must start with a blockquote before `## What`:

```markdown
> 📦 **Stacked PR <pos> of <total>** — part of [<TICKET>](<jira-url>)<optional: ` (<short epic/feature note>)`>
>
> - PR <pos1>: <label> — #<pr1>
> - PR <pos2>: 👉 **<label> (this PR)** — #<pr2>
> - PR <pos3>: <label> — #<pr3>

---
```

Rules:
- One bullet per PR in dependency order, bottom to top.
- Mark the current PR with `👉 **<label> (this PR)**`.
- Reference every PR by `#<number>`.
- Link the ticket when known.
- Keep labels short and scoped to each PR's concern.
- Keep the block consistent across all PRs in the stack.

## Reporting

When creating or updating a PR, report:
- PR URL
- whether human review has started
- whether commits were rewritten or preserved
- whether `--force-with-lease` was used
- whether stacked descendants were restacked or pushed
- whether PR title/body changed
- what tests or validation were run
- evidence links added or intentionally omitted
- assumptions and tradeoffs
