---
description: Update an existing PR while preserving review-state discipline and a current reviewer guide
argument-hint: "[context]"
---
# PR Update
Arguments: `$ARGUMENTS`

Update the current branch's existing GitHub PR after implementation or review feedback. Use `/pr-create` to open the first PR for a branch.

Read `reviewable-pr-workflow` before acting. It is the source of truth for PR bodies, history, stacks, reviewer guides, and reporting. Read `git-machete` only when using git-machete.

## Phase 1: Establish PR and review state
Run:

```bash
gh pr view --json number,title,body,baseRefName,url,author,reviews,comments,latestReviews,reviewDecision
git status --short
```

Set `base` from the PR's `baseRefName`, then inspect:

```bash
git log --reverse --format="%H %s" "origin/$base..HEAD"
git diff --stat "origin/$base..HEAD"
git diff --name-status "origin/$base..HEAD"
```

Stop if the branch has no PR. Inspect uncommitted changes and commit only changes that belong in this PR; leave unrelated changes unstaged and report them.

Use the review-state and explicit-rewrite rules from `reviewable-pr-workflow`. Treat `$ARGUMENTS` as context about implementation, addressed feedback, title changes, or explicit rewrite intent. If rewrite intent after human review is ambiguous, ask before rewriting.

## Phase 2: Shape or preserve the branch
Before human review, improve the commit story when doing so makes review easier. After human review, preserve history by default and add follow-up commits. Use `--force-with-lease` for approved rewrites; never use plain `--force`.

For a stack, inspect affected descendants before rewriting. Restack and push only as allowed by the workflow skill. If a reviewed descendant would be rewritten without explicit approval, stop and ask.

## Phase 3: Refresh the PR title and body
Read the current body and final branch state. Preserve accurate handwritten content and replace stale generated content in place. This command is idempotent:
- keep at most one `## Lessons learned` and one `## Evidence` section;
- remove stale `## Changes since last review` content rather than accumulating a changelog;
- reassess the reviewer guide against the full PR diff and relevant review discussion, not only the latest commits;
- retain unresolved review questions, remove resolved or obsolete concerns, and add concerns introduced by the update;
- refresh code references and order the remaining concerns by importance;
- preserve accurate handwritten context without accumulating a review-history log;
- refresh the stack-navigation block for every affected stacked PR.

Use the `reviewable-pr-workflow` body template. Include `## Lessons learned` only for reviewer-relevant surprises or tradeoffs. Include `## Evidence` only when external artifacts help reviewers verify or understand the change.

Before refreshing the reviewer guide, compare the full diff with the task context, relevant design artifacts, OpenSpec proposals or specs, and linked issue. Check:
- **Need:** Ask a reviewer who did not originate the prompt or implement the change to assess whether the evidence supports the problem, necessity, and scope. Do not present the author's rationale as independent validation.
- **Scope:** Call out changed files or behavior that do not match the stated intent or lack an explanation.
- **Hard-to-reverse contracts:** Check gRPC and other public APIs, program parameters, data models and fields, and database schemas for compatibility, migration, and rollout risks.
- **Go architecture and startup:** Inspect relevant interfaces, implementations, and callers. If no interface changes, assess whether that fits existing patterns; do not require an interface by default. For bootstrap changes, check that dependencies are available in order and do not introduce cycles.
- **Operability:** Identify new failure modes and what an on-call engineer would need at 4 a.m. Check diagnosis and recovery signals, including useful errors, logs, metrics, and traces, bounded metric cardinality, and sensitive log data.

Surface applicable findings as specific, prioritized reviewer questions. Do not add empty checklist items or invent concerns for unaffected areas. Mention an unaffected high-risk area only when that context helps the reviewer.

If the title is stale, propose a replacement. Change it only when the user explicitly requested it or approves the proposal.

Write the body to a temporary file, push the branch as required by its review state, and update the PR:

```bash
gh pr edit <number> --body-file <temp-file>
```

Include `--title <new-title>` only after approval or an explicit title-update request.

## Report
Report per the workflow skill, plus:
- title and generated-section changes;
- reviewer-guide concerns added, resolved, or retained.
