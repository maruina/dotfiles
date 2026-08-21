---
description: Build enough PR context to critically adjudicate review feedback and decide the right response
argument-hint: "<GitHub PR URL or comment link> [familiarity: 0-3 or context]"
---
# PR Address Feedback
Feedback request: `$ARGUMENTS`

You are the author of this PR. Build a shared model of the changed system before judging review comments, then decide whether each comment is relevant, correct, and worth implementing as suggested.

This command is not a second full PR review. `/pr-review` explains and evaluates the PR as a whole. `/pr-address-feedback` develops only the system context needed to make well-supported decisions about review feedback.

<HARD-GATE>
Read-only by default. Do not edit files, commit, push, post GitHub comments, reply, or resolve review threads unless the user explicitly asks.
</HARD-GATE>

## Inputs
Parse:
- A PR URL: `https://github.com/ORG/REPO/pull/NUMBER`
- An inline discussion link: `https://github.com/ORG/REPO/pull/NUMBER#discussion_rID`
- A PR conversation-comment link: `https://github.com/ORG/REPO/pull/NUMBER#issuecomment-ID`
- Optional familiarity: `0` through `3`, or a sentence describing what the user already knows.

If the input is missing or unparseable, ask for a PR URL or comment link and stop.

When a specific comment link is supplied, assess that comment and its thread. Otherwise, assess all unresolved feedback.

## Phase 1: Locate the PR workspace
Prefer an existing checkout of the PR repository. Inspect the current repository first:

```bash
git remote -v
git status --short
gh repo view --json nameWithOwner
```

If it matches `ORG/REPO`, use it. Prefer the PR head branch. Otherwise locate an existing checkout in:
- `~/dd/REPO`
- `~/go/src/github.com/ORG/REPO`

If no checkout exists and `ORG` is `DataDog`, clone into `~/dd/REPO`. Otherwise ask where to clone.

If the selected checkout is not at the PR head, warn before switching it with `gh pr checkout <PR_NUMBER>`. Record the resulting path as `WORKTREE`. Use `WORKTREE` for all subsequent code reads.

## Phase 2: Gather PR and feedback data
Collect:
- PR title, description, author, base/head branches, state, review decision, changed files, and full diff.
- Inline comments, top-level PR comments, review bodies, and thread resolution state.
- For each selected thread: reviewer, timestamp, path, current/original line, diff hunk, full thread, and whether it is outdated.

Use the fetching mechanics in the `pr-comment-triage` skill. Skip resolved threads unless the user explicitly selected one. Do not silently drop outdated comments; label them.

## Phase 3: Build a targeted model before adjudicating comments
Do not judge a comment from its hunk alone. First understand the PR enough to assess all selected feedback efficiently.

Use the same evidence hierarchy as `/pr-review`:
1. Read repository guidance and PR metadata.
2. Classify changed files and identify the affected entry points.
3. Read the significant changed files in full, plus nearby implementations, callers, tests, and configuration needed to establish behavior.
4. Follow the affected execution or data path in logical order rather than diff order.
5. Use `skill-loader` to select and read relevant language and domain guidance before assessing implementation choices.
6. Use `codebase-research` when a concern depends on callers, alternate paths, generated code, existing patterns, or broader system behavior.
7. Use LSP semantic tools when they materially clarify definitions, callers, implementations, or impact.

Build a **targeted model**, not a full `/pr-review` narrative. Establish only:
- the PR’s intended outcome;
- the affected entry point and execution/data path;
- the relevant contracts, invariants, compatibility boundaries, and failure modes;
- existing patterns and tests that constrain an acceptable solution.

State what could not be verified. Do not infer behavior from the PR description when local code disagrees.

## Phase 4: Adjudicate feedback
For each selected comment, answer the following in order:

1. **Relevance:** Does this concern behavior, risk, or a contract that the PR changes or is responsible for?
2. **Correctness:** Does the claimed problem exist on the current PR head? Verify against current code and relevant callers, tests, and alternate paths.
3. **Suggested solution:** If the reviewer proposed a change, would it solve the actual problem without causing regressions, breaking contracts, or conflicting with repository patterns?
4. **Best response:** Choose exactly one outcome:
   - `adopt as suggested` — the concern is relevant and correct, and the suggested fix is sound.
   - `adopt different approach` — the concern is relevant and correct, but the suggested fix is incomplete, harmful, or not the best fit. Propose the smallest concrete alternative.
   - `push back` — the concern is irrelevant, incorrect, already guaranteed elsewhere, or its proposed change would be harmful.
   - `already addressed` — the current PR head handles the concern; the comment is stale or superseded.
   - `needs clarification` — reviewer intent, expected behavior, or evidence is ambiguous.

Do not manufacture a reason to accept or reject feedback. If the evidence is insufficient, use `needs clarification` and name the exact unanswered question.

For `adopt different approach`, include:
- the root cause;
- the minimum implementation change;
- affected files or symbols;
- required test coverage;
- why it is safer or simpler than the suggestion.

## Phase 5: Produce concise author-facing output
Keep system context brief and shared across comments. Do not repeat it per comment.

```markdown
## Summary
- PR: ORG/REPO#PR_NUMBER — title
- Worktree: WORKTREE
- Feedback assessed: N total; M unresolved; K outdated; R resolved and skipped
- Decisions: adopt as suggested X | adopt different approach Y | push back Z | already addressed W | needs clarification V

## Targeted PR model
- **Intent:** ...
- **Affected path:** `entry point → component → dependency`
- **Relevant contracts/invariants:** ...
- **Constraints from existing patterns/tests:** ...
- **Not verified:** ...

## Feedback decisions
| # | Reviewer | Location | Relevant | Correct | Suggested solution | Decision |
|---|----------|----------|----------|---------|--------------------|----------|
| 1 | @reviewer | `path:line` | yes/no | yes/no/unclear | sound/partial/unsound/n.a. | ... |

## Comment assessments
### 1. `path:line` — @reviewer
> Short quote or precise summary.

**Decision:** adopt as suggested | adopt different approach | push back | already addressed | needs clarification

**Evidence:** Explain relevance and correctness with current-code evidence. Cite file paths and line ranges.

**Suggested solution assessment:** Explain whether the reviewer’s proposal addresses the root cause and fits current contracts and patterns.

**Recommended action:** State the smallest code change, alternative approach, or reason not to change code.

**Draft reply:**
> Concise reply the author can edit before posting. For `already addressed`, omit it unless a response would help the reviewer.

## Next steps
- **Implement:** comments with `adopt as suggested` or `adopt different approach`, including the required tests.
- **Reply without code changes:** comments with `push back`, `already addressed`, or `needs clarification`.
- **Open questions / unverified assumptions:** ...
```

Keep each comment assessment proportional to its importance. Prefer a compact, evidence-backed paragraph over a mini code review.

## Follow-up
End by stating that implementation, commits, pushes, replies, and thread resolution require explicit confirmation. Use `WORKTREE` for any follow-up investigation.
