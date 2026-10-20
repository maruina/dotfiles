---
name: reviewable-pr-workflow
description: "Create and update GitHub PRs that are easy, fast, and confidence-building to review: coherent PR stories, stacked PRs, review-state-based history rewriting, evidence links, safe force-pushes, clear explanations, and git-machete stack mechanics."
---
# Reviewable PR Workflow
Use when creating, updating, splitting, restacking, cleaning up, or reviewing a GitHub PR.

Goal: make the PR easy to review. When authoring the PR title or body, read `write` and apply its plain-language principles. The reviewer should understand the problem, behavior, design choices, scope, evidence, and tests without reading the implementation session.

## Core principle
Treat a PR as a review artifact. Because PRs are squash-merged, branch commits should tell the best review story, not preserve every intermediate mistake.

## Rewrite policy
The boundary is **human review state**, not whether the PR is open.

Before human review starts:
- Rewrite freely to improve reviewability: rebase, squash, fixup, split, reorder, drop accidental files, and restack.
- Push rewritten branches with `git push --force-with-lease`.
- Refresh PR-body code references against the final pushed branch.

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
- an explanation of the problem and what changes,
- motivation, design choices, and scope boundaries,
- a clear account of how the change works, with examples when useful,
- independently understandable commits,
- tests or validation notes,
- evidence links when external proof helps,
- no accidental files, temporary scripts, noisy fixups, or confusing commit order before review.

### Stack-split check
Evaluate the change against these signals before opening a PR:

- Strong signals: 2+ distinct subsystems that could ship independently; more than ~400 net lines of non-generated, non-test code; more than ~15 non-generated files.
- Soft signals: explaining the change would need more than five topics; commits fall into independent groups; the branch mixes refactor, feature, and behavior change.

Split into a stack when any strong signal or two or more soft signals trip. Propose the stack as one row per branch in dependency order, and ask before restructuring.

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

## PR description
Write for a software engineer who does not know this subsystem and has not read the implementation session.

Explain the change rather than summarize the diff. Give the reader enough context to understand:
- the practical problem and why it matters;
- what this PR adds or changes;
- how the main parts work together;
- what the result looks like and who or what consumes it;
- the important design choices and scope boundaries.

Start with behavior the reader can picture. Introduce subsystem terms and code names only after explaining their purpose. Use short paragraphs and concrete language. Do not turn the description into a list of functions, types, or changed files.

When a change produces output, show representative output. If it provides multiple formats or interfaces, explain who uses each and when. Use the same scenario across examples so readers can compare them. Keep examples as small as possible without hiding the behavior being explained.

Verify examples and claims against the implementation or tests. Label illustrative examples. Distinguish behavior delivered by this PR from planned integration; do not present a future command or consumer as already available.

Do not include `## What to look for in this PR` or an equivalent reviewer checklist. Explain relevant constraints and failure behavior in the narrative. Surface unresolved decisions explicitly without manufacturing review questions.

## PR body template
For non-trivial changes, use this structure. For trivial changes, omit sections that add no useful information.

```markdown
## What is this PR?
Explain the practical problem, why it matters, and what this change does.

## Why is it built this way?
Explain the important design choices, tradeoffs, and scope boundaries.

## How it works
Follow the input-to-result flow in a few steps. Mention files or symbols as navigation aids, not as the organizing principle.

## <Topic-specific examples heading>
Show representative inputs, outputs, or before/after behavior. Explain who uses each format or interface and when.

## Tests
Report validation performed and relevant limits.
```

Omit the examples section when it does not improve understanding. Use a fenced example or a `diff` block to make behavior concrete. Add a `mermaid` diagram when it makes a flow, interaction, or transformation easier to understand. GitHub renders Mermaid natively; follow `mermaid-best-practices`, keep one concept per diagram, and skip diagrams when prose or an example is already clear.

Keep stack navigation and relevant design links. Include `## Evidence` only when external artifacts help explain or verify the change. Add `## Lessons learned` only for reviewer-relevant surprises or tradeoffs.

Link code references to the file at the PR head SHA with line anchors. Commit links must use `/pull/<pr>/changes/<full-sha>`, never bare `/commit/<sha>` links.

Before publishing, check: Can a reader explain why this change exists, how it works, and what it produces without reading the diff or implementation session?

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
