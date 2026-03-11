---
description: Implement changes from a PLAN.md or a quick description, with parallel code review
argument-hint: <path-to-PLAN.md or "description of the change">
model: sonnet
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(bzl:*), Bash(codex:*), Grep, Glob, Agent, AskUserQuestion
---

# CCP Implement — Plan Implementation Pipeline

Implement changes, run 4 parallel code reviews, synthesize findings with rationale, fix issues, then commit and create a PR.

Accepts two modes:
- **Planned**: path to an existing PLAN.md (from `/ccp-plan`)
- **Quick**: free text description — runs lightweight inline planning, then the same implementation and review flow

## Input

$ARGUMENTS

## Phase 0: Worktree Detection

1. **Detect or create worktree:**
   - Check if already inside a git worktree: `git rev-parse --show-toplevel` and `git worktree list`.
   - If already in a worktree (e.g., from `/ccp-plan`), continue working there. Store the path as `$WORKTREE_DIR`.
   - If NOT in a worktree, derive a branch name from the PLAN.md path or input:
     - Check if a worktree already exists for the plan's branch: `git worktree list`
     - If found, `cd` into it.
     - Otherwise, create one:
       ```bash
       git worktree add .claude/worktrees/<branch-name> -b <branch-name>
       ```
   - **All subsequent work happens inside the worktree directory.**

## Phase 1: Route Input

2. **Determine input type:**
   - **Path to PLAN.md** (argument ends in `.md` or contains `PLAN`): read it directly. Derive `$ARTIFACT_DIR` as the containing directory. Skip to step 6.
   - **No argument**: search for `PLAN.md` — check the current directory, then `Glob`. If found, skip to step 6. If multiple exist, ask the user which to implement.
   - **Free text description**: proceed to Phase 1b (inline planning).

## Phase 1b: Inline Planning (quick mode only)

3. **Quick research** — Agent tool, `subagent_type: "Explore"`, thoroughness `"medium"`:
   > Based on this description: "<user's free text>"
   >
   > Identify relevant files, packages, and patterns. Return: files to modify, files to create, existing patterns to follow, and risks. Do NOT use SendMessage.

4. **Write a lightweight PLAN.md:**
   - Determine the component directory from research results (common parent directory of affected files, or repo root for flat repos).
   - Append `plans/<kebab-case-slug>/` to get `$ARTIFACT_DIR`. Create the directory.
   - Read `~/.claude/ccp-writing-rules.md` for the PLAN.md template and writing rules. Write `$ARTIFACT_DIR/PLAN.md` following those rules. Keep each section to 1-3 bullets.
   - Present the plan via `AskUserQuestion`: "Quick plan ready. Proceed with implementation, or refine first?" This confirmation replaces step 8 — skip step 8 in quick mode.

## Phase 2: Load Plan

5. **Read supporting artifacts:**
   - Read `$ARTIFACT_DIR/RESEARCH.md` if it exists.
   - Read `$ARTIFACT_DIR/REVIEW.md` if it exists (review notes inform implementation decisions).

6. **Extract implementation targets:**
   - Parse **Approach**, **Key Design**, and **Testing Strategy** sections.
   - Identify files and packages to create or modify from the approach description and research.
   - Build the implementation checklist.

7. **Confirm with the user** via `AskUserQuestion`:
   > "Ready to implement: <plan title>. Proceed?"

## Phase 3: Implement

8. **Implement changes:**
   - Follow the **Approach** and **Key Design** sections.
   - Respect patterns from RESEARCH.md.
   - If the plan is ambiguous, ask the user before guessing.

9. **Run tests:**
   ```bash
   bzl test //<package>:all
   ```
   Identify the relevant Bazel package(s) from the files modified. Fix failures before proceeding. Note deviations from the plan.

## Phase 4: Parallel Review

Spawn all four reviewers simultaneously in a single message with four Agent tool calls. All reviewers report findings — none edit files.

10. **Claude code reviewer** — Agent tool, `subagent_type: "feature-dev:code-reviewer"`, `model: "sonnet"`:

    > Review uncommitted changes for bugs, logic errors, security vulnerabilities, and project convention adherence. Focus on files referenced in the plan's Approach and Key Design sections.
    >
    > Rate each finding:
    > - **[CRITICAL]** — Bug, security issue, or correctness problem
    > - **[MAJOR]** — Significant quality or maintainability concern
    > - **[MINOR]** — Style or readability improvement
    >
    > Return findings with file:line references. Do NOT edit files. Do NOT use SendMessage.

11. **Codex reviewer** — Agent tool, `subagent_type: "general-purpose"`, `model: "haiku"`:

    > Run `codex review --uncommitted` from the repository root.
    >
    > Return raw codex output. Do NOT interpret or filter it. Do NOT use SendMessage.

12. **Go code reviewer** — Agent tool, `subagent_type: "go-code-reviewer:go-code-reviewer"`:

    > Review all modified and created Go files for naming conventions, error handling, testing practices, concurrency patterns, performance, code organization, and style.
    >
    > Return consolidated findings with file:line references and severity ratings. Do NOT edit files. Do NOT use SendMessage.

13. **Code simplifier** — Agent tool, `subagent_type: "code-simplifier:code-simplifier"`, `model: "sonnet"`:

    > Analyze recently modified code for simplification opportunities. **Report only — do NOT apply changes.** Identify: redundancy, unnecessary abstractions, overly complex logic, inconsistent patterns.
    >
    > Return findings with file:line references and proposed simplifications. Do NOT edit files. Do NOT use SendMessage.

**Wait for all four agents to complete.**

## Phase 5: Synthesis

14. **Synthesize findings:**
    - Combine findings from all four reviewers.
    - Deduplicate: merge findings flagged by multiple reviewers into one entry, noting sources.
    - Group by severity: CRITICAL first, then MAJOR, then MINOR.
    - **For each finding, explain why the fix matters**: what breaks, what risk it introduces, or what maintenance burden it creates.

15. **Write `$ARTIFACT_DIR/IMPLEMENTATION-REVIEW.md`:**
    This file is a **local working artifact** — it is NOT committed to git.

    ```markdown
    # Implementation Review: <plan title>

    **Date**: <YYYY-MM-DD>
    **Plan**: PLAN.md
    **Reviewers**: claude, codex, go-reviewer, simplifier

    ## Findings

    ### CRITICAL
    - **<finding title>** — <description with file:line references>
      - Source: <claude / codex / go-reviewer / simplifier>
      - **Why this matters**: <concrete impact — what breaks, what risk, what cost>

    ### MAJOR
    - **<finding title>** — <description>
      - Source: <...>
      - **Why this matters**: <...>

    ### MINOR
    - **<finding title>** — <description>
      - Source: <...>
      - **Why this matters**: <...>

    ## Simplification Opportunities
    - <from code-simplifier, with before/after sketches>

    ## Codex Output
    <raw codex output, quoted>
    ```

16. **Present the review.** Summarize findings by severity count (e.g., "1 CRITICAL, 3 MAJOR, 5 MINOR").

17. **Wait for user feedback** via `AskUserQuestion`:
    - "Which findings should I fix?"
    - Options:
      - **All** — fix everything
      - **CRITICAL only** — fix critical issues, acknowledge the rest
      - **Let me choose** — user specifies

## Phase 6: Fix

18. **Fix accepted findings.** For each:
    - Apply the change.
    - If the fix conflicts with the plan, explain the deviation.

19. **Re-run tests:**
    ```bash
    bzl test //<package>:all
    ```
    All tests must pass before proceeding.

## Phase 7: Commit & PR

20. **Commit changes:**
    ```bash
    cd $WORKTREE_DIR
    git add <specific-files>
    git commit -m "[<ticket-id>] <type>(<scope>): <description>"  # omit [<ticket-id>] if no ticket
    ```
    Use conventional commits. Include PLAN.md if not already committed. Do NOT commit RESEARCH.md, REVIEW.md, or IMPLEMENTATION-REVIEW.md.

21. **Push and create PR:**
    ```bash
    git push -u origin <branch-name>
    ```

    ```bash
    gh pr create --title "[<ticket-id>] <type>(<scope>): <description>" --body "## Summary  # omit [<ticket-id>] if no ticket
    <what changed and why>

    ## Plan
    Implements \`$ARTIFACT_DIR/PLAN.md\`.

    ## Review Summary
    - **CRITICAL**: <count> found, <count> fixed
    - **MAJOR**: <count> found, <count> fixed
    - **MINOR**: <count> found, <count> fixed
    - **Simplifications**: <count> applied

    ## Deferred Findings
    <any intentionally skipped findings with rationale>

    ## Test Results
    All tests pass."
    ```

22. **Trigger online Codex review:**
    ```bash
    gh pr comment <pr-number> --body "@codex review"
    ```

23. **Present the PR** to the user. Do NOT merge.

## Rules

- Follow the plan. Deviations require explicit user approval.
- All four reviewers run in parallel. None edit files — they report only.
- Every finding must include file:line references and a "why this matters" explanation.
- CRITICAL findings must be fixed. MAJOR and MINOR are advisory.
- Tests must pass before and after the review-fix cycle.
- Only PLAN.md and implementation code are committed. RESEARCH.md, REVIEW.md, and IMPLEMENTATION-REVIEW.md stay local.
- BUILD/bzl files for Go are generated by Gazelle — never write them manually.
- When using `AskUserQuestion`, never use the `markdown` preview field on options. Use plain `label` and `description` only. The markdown preview mode has UI bugs that prevent users from typing custom answers.
