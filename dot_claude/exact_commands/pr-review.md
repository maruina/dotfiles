---
description: Walk through a GitHub PR as a narrative with visual HTML output. Usage: /pr-review <PR-URL>
argument-hint: <GitHub PR URL, e.g. https://github.com/DataDog/dd-source/pull/12345>
model: sonnet
allowed-tools: Read, Write, Glob, Grep, Bash(git:*), Bash(gh:*), Bash(open:*), Agent, Skill, AskUserQuestion
---

# PR Review

PR URL: $ARGUMENTS

Follow these phases in order. Never skip a phase.

## Phase 1: Parse and validate

Extract from the URL:
- `$ORG` (e.g. `DataDog`)
- `$REPO` (e.g. `dd-source`)
- `$PR_NUMBER` (e.g. `352925`)

Verify you are in the correct repository:

```bash
git remote get-url origin
```

If the remote URL does not contain `$ORG/$REPO`, print:
> Error: this command must be run from the `$ORG/$REPO` repository. Current remote is `<actual remote>`.

Then stop.

## Phase 2: Create review worktree

Fetch the PR branch and create an isolated worktree:

```fish
set branch (gh pr view $PR_NUMBER --repo $ORG/$REPO --json headRefName -q .headRefName)
git fetch origin $branch
# Remove stale worktree if it already exists
git worktree remove /tmp/pr-$PR_NUMBER-review --force 2>/dev/null; or true
git worktree add /tmp/pr-$PR_NUMBER-review $branch
```

Store the worktree path as `$WORKTREE`. All file reads happen from here.

## Phase 3: Gather PR data

Run these in parallel:

```fish
gh pr view $PR_NUMBER --repo $ORG/$REPO --json title,body,files,additions,deletions,baseRefName,headRefName,author,labels
gh pr diff $PR_NUMBER --repo $ORG/$REPO
gh api repos/$ORG/$REPO/pulls/$PR_NUMBER/comments
gh pr view $PR_NUMBER --repo $ORG/$REPO --json comments,reviews
```

Assess the PR description:
- Does it explain WHY (motivation), not just what?
- Are edge cases, gotchas, or known limitations called out?
- Note what is absent — a description that only states "what" without "why" is worth flagging.

List the changed files and classify each: implementation, tests, config, generated code.

**Read all discussion threads:**
- From `gh api .../pulls/$PR_NUMBER/comments`: these are inline review comments on specific lines.
- From `gh pr view ... --json comments,reviews`: these are top-level PR comments and formal review bodies.
- For each thread: note the author, the concern raised, whether it was resolved or is still open, and any author response.
- Build a list of open and resolved discussions. You will use this in Phase 5 and Phase 6.

## Phase 4: Explore surrounding context

Before reading the diff, understand what surrounds the changes. Read full files from `$WORKTREE`, not just changed hunks.

- For each significantly changed file, read the full file to understand existing structure, contracts, and conventions.
- Search for similar patterns elsewhere in the codebase that could have been reused or extended instead of written fresh.
- Identify what the changed code builds on: interfaces, types, base classes, shared utilities.

Scope heuristic:
- 10 or fewer changed files: explore all of them fully.
- More than 10 changed files: focus on new interfaces, schema changes, and public API surface. Explicitly note what was skipped and why.

## Phase 5: Build the narrative

The goal is a document that reads like a **literate program**: prose and code interleaved so the reader understands the existing system, what the PR changes about it, and why. A reviewer cannot assess new code without understanding the system it lands in.

**After the problem statement, add a solution map.** Before diving into any code, briefly enumerate the solution components and state which problem each one addresses. If the fix has multiple coordinated parts (e.g. a config change + an orchestration change + a new implementation), say so explicitly. A table or numbered list works well. This prevents the reader from having to infer the structure while reading.

**Structure each section as:**
1. **How it works today** — before showing any diff, explain the existing code that the PR modifies. What does this part of the system do? What are the key abstractions, the entry points, the contracts? Read from `$WORKTREE` for context beyond the diff. This is not wasted space — it is the foundation for evaluating the change.
2. **What changed and why** — show the diff snippet as evidence. Explain the motivation: what problem does this change solve that the existing code couldn't handle? Why this approach rather than the alternatives?
3. **What it means downstream** — if the change affects callers, data flow, or timing, say so immediately.

**Narrative rules:**

- Follow the **execution call stack**, outermost caller to innermost leaf. Start at the entry point that triggers the change, trace each layer down to the leaf. State what each layer does *in the existing system* before showing what the diff adds to or removes from it.
- Cross between files freely. When the call crosses a service or package boundary, say so explicitly before continuing.
- For **structural changes** (something added/removed from a collection, ordering changed): show a **before** code block and an **after** code block with labels. Readers need to see what moved and where.
- Explain **why** for every non-obvious design choice: signals, escape hatches, retry policies, polling loops. What operational problem does this solve? What happens without it?
- State **timing** (timeouts, max wait, retry intervals) at the point in the narrative where they first become relevant.
- Make every `file.go:line` reference in the HTML a clickable `<a>` tag: `<a href="https://github.com/$ORG/$REPO/blob/$HEAD_BRANCH/$PATH#L$LINE">file.go:line</a>`.
- Use three callout types inline:
  - `NOTE:` (amber) — non-obvious behavior, tricky implementation details, or things that look wrong but aren't. The reader should pay attention here.
  - `⚠ CONCERN:` (red) — issues, risks, open questions. Place immediately after the relevant code. Attribute to existing threads when applicable (e.g. "(@rifelpet)").
  - `Good pattern:` (green) — deliberate, positive design choices worth calling out explicitly. Use when a decision that looks unusual is actually well-reasoned. Do not use amber for these — green signals "this is intentional and good", not "watch out".
- Tone: neutral, matter-of-fact, conversational. Avoid vague summaries — be specific about what changes, at which layer, and what the effect is.

**Test coverage pass**: after the call-stack narrative, identify which behavior changes lack corresponding tests. Be specific: name the scenario and the missing assertion.

## Phase 6: Verdict and concerns

The verdict section is **short**. Concerns are already inline. This section contains only:
- Overall assessment: ready as-is / needs discussion / needs changes.
- Missing tests: specific scenarios. No narrative — just the list.
- Whether the PR description does its job.
- A one-sentence summary. Nothing else.

## Phase 7: Polish

Use the `rewrite` skill on your narrative and verdict text. Keep code blocks and `NOTE:` callouts untouched. Tighter prose, no structural changes.

**Do not print the full narrative or rewrite to the terminal.** The text is only for the HTML output in Phase 8.

## Phase 8: Generate visual HTML

Use the `playground` skill to create a self-contained HTML walkthrough. The HTML must include:

**Content sections (in order):**
1. PR metadata header: title, author, base → head, additions/deletions, PR state badge
2. The narrative walkthrough with interleaved syntax-highlighted code blocks
3. "Existing discussions" section — two subsections: Open threads and Resolved. Each thread: author, file/line, status badge, body summary.
4. Verdict & Concerns — visually distinct (boxed or separated). Only lists concerns NOT already in existing discussions.
5. Comment panel — textarea for drafting a review comment, review-type selector (comment / request-changes / approve), a generated `gh pr review` command that updates live as the user types, and a copy button.

**Visual requirements:**
- Single-page, scrollable. Not a stepper or slide deck.
- Dark theme (background `#0d1117`, text `#e6edf3`, like GitHub dark).
- Syntax highlighting via **highlight.js** from CDN, `github-dark` theme. Include the protobuf language pack CDN script if proto files are involved. Correct language per snippet.
- Two callout types, both inline:
  - `NOTE:` — amber left border (`#f0a435`), amber tinted background, 14px text.
  - `⚠ CONCERN:` — red/salmon left border (`#f85149`), red tinted background (`rgba(248,81,73,0.07)`), 14px text.
- Code blocks: `#161b22` background, `13px` monospace, `16px` padding, rounded corners.
- Before/after code pairs: labeled with a small "Before" / "After" badge above each block.
- Inline `code`: `#c9d1d9` text, `#1f2428` background, `2px 5px` padding, rounded.
- Verdict section: slightly different background (`#111820`), top border separator. Contains only overall assessment + missing test list. No concern list.
- Discussion threads: card-based, status badges (open=red, resolved=green).
- **Three-area layout** — `body` is a flex column with `height: 100vh; overflow: hidden`:
  1. **Top strip**: PR header, fixed height.
  2. **Middle**: flex row of left nav (fixed width, scrolls independently) + main content (flex-1, scrolls independently). Both fill the exact space between header and bottom strip.
  3. **Bottom strip**: fixed height (~230px), always visible. Contains two tabs — **Questions** and **Post comment** — so the user never has to scroll to reach them.
- Nav links must scroll the main content div via JS (`getBoundingClientRect` + `scrollBy`), not the body.
- **Questions tab**: `<textarea>` that fills the available height + "Copy as prompt" button. Copied text: `"Reviewing PR #$PR_NUMBER ($TITLE). I have these questions:\n\n[textarea content]\n\nWorktree: $WORKTREE"`.
- **Post comment tab**: review-type selector (comment / request-changes / approve) + `<textarea>` + generated `gh pr review` command that updates live, with a copy button.

Save the output to `/tmp/pr-$PR_NUMBER-review.html`, then open it:

```fish
open /tmp/pr-$PR_NUMBER-review.html
```

## Phase 9: Interactive session

Tell the user:
> Review is open at `/tmp/pr-$PR_NUMBER-review.html`. The comment panel at the bottom generates the `gh pr review` command as you type — copy and run it to post.
> Ask me anything about the change — I have the full worktree at `$WORKTREE`.

Stay available. Use `$WORKTREE` for any follow-up file reads.
