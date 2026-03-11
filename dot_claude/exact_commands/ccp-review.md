---
description: Review a PLAN.md against codebase research and existing patterns
argument-hint: <PR-URL or path-to-PLAN.md>
model: sonnet
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(gh:*), Grep, Glob, Agent, AskUserQuestion
---

# CCP Review — Plan Review Pipeline

Validate an implementation plan against the codebase, challenge assumptions, surface gaps, write REVIEW.md, then reconcile feedback into PLAN.md.

## Input

$ARGUMENTS

## Phase 0: Worktree Detection

1. **Detect or create worktree:**
   - Check if already inside a git worktree: `git rev-parse --show-toplevel` and `git worktree list`.
   - If already in a worktree (e.g., from `/ccp-plan`), continue working there. Store the path as `$WORKTREE_DIR`.
   - If NOT in a worktree, derive a branch name from the PLAN.md path or content:
     - Check if a worktree already exists for the plan's branch: `git worktree list`
     - If found, `cd` into it.
     - Otherwise, create one:
       ```bash
       git worktree add .claude/worktrees/<branch-name> -b <branch-name>
       ```
   - **All subsequent work happens inside the worktree directory.**

## Phase 1: Load Context

2. **Determine input type and find PLAN.md:**

   **PR URL** (argument contains `github.com` and `/pull/`):
   - Extract `<owner>/<repo>` and PR number from the URL.
   - Fetch PR metadata: `gh pr view <number> --repo <owner>/<repo> --json headRefName,files`
   - Identify the PLAN.md file from the PR's file list.
   - Derive the PR branch name from `headRefName` — use this for worktree detection (Phase 0) or checkout.
   - After worktree is ready, read the PLAN.md file. Derive `$ARTIFACT_DIR` as the containing directory.
   - Fetch PR review comments: `gh api repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | {author: .user.login, body: .body, path: .path, line: .line}'`
   - Store human review comments as `$PR_COMMENTS` for use in Phase 3.

   **Path to PLAN.md** (argument is a file path):
   - Read it directly. Derive `$ARTIFACT_DIR` as the containing directory.
   - `$PR_COMMENTS` is empty.

   **No argument**:
   - Check the current directory first, then `Glob` for `PLAN.md`. If multiple exist, ask the user which to review.
   - If not found, stop: "No PLAN.md found. Run `/ccp-plan` first."
   - `$PR_COMMENTS` is empty.

3. **Find RESEARCH.md:**
   - Look for `$ARTIFACT_DIR/RESEARCH.md`.
   - If found, read it. If not, warn: "No research file found. Pattern validation may be less thorough."

4. **Extract review targets:**
   - Parse the **Approach**, **Key Design**, and **Testing Strategy** sections.
   - Identify referenced file paths, packages, and directories as reviewer targets.

## Phase 2: Parallel Review

Spawn both reviewers simultaneously in a single message with two Agent tool calls.

5. **Technical reviewer** — Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`:

   Pass: PLAN.md path, research file path (if found), review target paths.

   > Read PLAN.md and the research file. For each proposed change, verify:
   >
   > **Correctness**: Do referenced files exist? Are described interfaces, functions, and types accurate? Does the approach solve the stated problem?
   >
   > **Completeness**: Does the plan address all requirements from the problem statement and Jira context? Are downstream effects covered?
   >
   > **Risk**: What is each change's blast radius? What happens on partial failure? Is there a rollback path?
   >
   > **Testing**: Are proposed test cases specific? Do they cover failure paths? Do they match existing test patterns from research?
   >
   > **Simplicity**: Is this the simplest approach? Flag over-engineering.
   >
   > Rate each finding:
   > - **[BLOCKER]** — Must fix before implementation
   > - **[CONCERN]** — Worth discussing
   > - **[SUGGESTION]** — Take it or leave it
   >
   > Return a severity-ordered list with file:line references. Do NOT write files. Do NOT use SendMessage.

6. **Pattern reviewer** — Agent tool, `subagent_type: "Explore"`, thoroughness `"very thorough"`:

   Pass: review target paths, key design from the **Approach** and **Key Design** sections.

   > For each file the plan proposes to modify or create, explore the surrounding codebase:
   > - Read sibling files in the same package/directory
   > - Identify existing patterns: error handling, logging, naming, struct layout, test structure
   > - Check whether proposed changes follow these patterns
   > - Flag cases where the plan introduces a new pattern when an existing one would work
   > - If the plan modifies shared interfaces, check all call sites
   >
   > Return: patterns found, whether the plan follows them, and deviations. Include file:line references. Do NOT use SendMessage.

**Wait for both agents to complete.**

## Phase 3: Write REVIEW.md

7. **Synthesize findings:**
   - Combine findings from both reviewers.
   - If `$PR_COMMENTS` is not empty, incorporate human review comments. Treat each comment as a finding:
     - Classify by severity (BLOCKER / CONCERN / SUGGESTION) based on the comment's tone and content.
     - Source: `pr-comment (<author>)`
   - Deduplicate: merge findings flagged by multiple sources into one entry, noting all sources.
   - Group by severity: BLOCKERs first, then CONCERNs, then SUGGESTIONs.
   - Write `$ARTIFACT_DIR/REVIEW.md`. This file is a **local working artifact** — it is NOT committed to git.

   ```markdown
   # Review: <plan title>

   **Date**: <YYYY-MM-DD>
   **Plan**: PLAN.md
   **Research**: RESEARCH.md

   ## Findings

   ### BLOCKERs
   - **<finding title>** — <description with file:line references>
     - Source: <technical / pattern / pr-comment (author)>

   ### CONCERNs
   - **<finding title>** — <description>
     - Source: <technical / pattern / pr-comment (author)>

   ### SUGGESTIONs
   - **<finding title>** — <description>
     - Source: <technical / pattern / pr-comment (author)>

   ## Patterns Validated
   - <pattern name> — <consistent / deviation noted above>
   ```

## Phase 4: User Review

8. **Present the review.** Summarize findings by severity count (e.g., "2 BLOCKERs, 3 CONCERNs, 1 SUGGESTION").

9. **Wait for user feedback** via `AskUserQuestion`:
   - "Take your time reading REVIEW.md. Which findings should I incorporate into PLAN.md?"
   - Options:
     - **All** — incorporate everything
     - **BLOCKERs only** — incorporate blockers, acknowledge the rest
     - **Let me choose** — user specifies which findings to address

## Phase 5: Reconciliation

10. **Spawn a reconciler** — Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`. Pass: PLAN.md path, REVIEW.md path, accepted findings from step 9.

    > First, read `~/.claude/ccp-writing-rules.md` to load the PLAN.md writing rules and template.
    >
    > Then read PLAN.md and REVIEW.md. Incorporate accepted findings into PLAN.md:
    > - Assumption challenged → add evidence or note as known risk in the Approach section
    > - Pattern deviation flagged → align with existing patterns in the Approach section
    > - Simplicity concern → simplify the Approach section
    > - Missing design detail → add to Approach or Key Design, whichever fits
    >
    > The updated PLAN.md must strictly follow the writing rules and template from `~/.claude/ccp-writing-rules.md`. Do not add sections, code, or details that the rules prohibit.
    >
    > Do NOT use SendMessage.

11. **Commit updated PLAN.md only:**
    ```bash
    cd $WORKTREE_DIR
    git add $ARTIFACT_DIR/PLAN.md
    git commit -m "[<ticket-id>] plan(<scope>): incorporate review feedback"  # omit [<ticket-id>] if no ticket
    git push
    ```

    Do NOT commit REVIEW.md or RESEARCH.md — they are local working artifacts.

12. **Present the updated plan.** Summarize what changed. Do NOT start implementation.

## Rules

- Every finding must reference specific file paths or plan sections. No vague feedback.
- Technical reviewer validates against research. Pattern reviewer validates against live code. None fabricate references.
- Human PR comments are treated as first-class findings — they are classified, deduplicated, and reconciled like any other source.
- BLOCKERs must be resolved. CONCERNs and SUGGESTIONs are advisory.
- Only PLAN.md is committed. RESEARCH.md and REVIEW.md stay local.
- When using `AskUserQuestion`, never use the `markdown` preview field on options. Use plain `label` and `description` only.
