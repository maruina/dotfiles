---
description: Research a codebase and write an implementation plan from a Jira ticket or free text
argument-hint: <JIRA-TICKET-ID or "free text description">
model: sonnet
allowed-tools: Read, Write, Edit, Bash(mkdir:*), Bash(git:*), Bash(gh:*), Grep, Glob, Agent, AskUserQuestion, ToolSearch
---

# CCP Plan — Code-aware Planning

Research the codebase, understand the problem, ask clarification questions, then produce a concrete implementation plan.

## Input

$ARGUMENTS

## Phase 0: Resume Detection

1. **Check for existing plan artifacts:**
   - Derive `$ARTIFACT_DIR` from the input (same logic as Phase 2, step 7). Check if `$ARTIFACT_DIR/PLAN.md` exists.
   - If it exists, ask via `AskUserQuestion`:
     > "Found existing plan at `$ARTIFACT_DIR/PLAN.md`. What would you like to do?"
     - **Overwrite** — start fresh, re-research and rewrite everything
     - **Skip to Draft PR** — commit existing artifacts and open a draft PR (jump to Phase 6)
   - If the user chooses **Overwrite**, continue to Phase 0b.
   - If the user chooses **Skip to Draft PR**, resolve worktree/branch (Phase 0b step 2, reusing if it exists), then jump to Phase 6.

## Phase 0b: Worktree

2. **Create or reuse a git worktree:**
   - Get the GitHub username from `git config user.name` (fall back to system username).
   - Derive a branch name:
     - Jira ticket: `<github-username>/<ticket-id>` (e.g., `maruina/K8SRELEASE-123`)
     - Free text: `<github-username>/<kebab-case-slug>` (e.g., `maruina/add-retry-logic`)
   - Check if a worktree already exists for this branch: `git worktree list`
   - If it exists, `cd` into that worktree directory.
   - Otherwise, create it:
     ```bash
     git worktree add .claude/worktrees/<branch-name> -b <branch-name>
     ```
   - **All subsequent work happens inside the worktree directory.** Store the worktree path as `$WORKTREE_DIR`.

## Phase 1: Problem Definition

3. **Determine input type:**
   - Jira ticket ID (e.g., `PROJ-123`, `K8SRELEASE-45`): fetch via Atlassian MCP tools (`ToolSearch` to load `getJiraIssue` first). Extract summary, description, acceptance criteria.
   - Free text: use directly as the problem statement.

4. **Gather full Jira context** (skip for free text):
   - **Comments**: fetch all comments (`ToolSearch` → Jira tool). Requirements often live in comments, not the description.
   - **Linked issues**: fetch each linked issue's summary and status. Note blockers, is-blocked-by, and related.
   - **Subtasks**: fetch summaries and statuses.
   - Condense into a block under 300 words. Discard bot comments and status transitions.

5. **State the problem** in one sentence. The Jira ticket provides full context — the problem statement is just a quick orientation for the reader. Confirm understanding with the user before proceeding.

## Phase 1b: Complexity Gate

6. **Classify complexity** via `AskUserQuestion`:
   > "How complex is this task?"

   | Complexity | Criteria | Workflow |
   |------------|----------|----------|
   | **Simple** | Follows existing pattern, single component, no novel decisions (e.g., add a field, config change, version bump) | Parent writes PLAN.md directly — no research, no clarification, no plan-writer |
   | **Medium** | New integration, multi-component, some decisions but well-understood domain | Full research, skip clarification if research is clear, plan-writer subagent |
   | **Complex** | Architecture change, technology choice, new pattern with no precedent | Full workflow |

   Store the result as `$COMPLEXITY`.

## Phase 2: Artifact Directory

All plan artifacts live together in one directory inside the worktree.

7. **Infer location** from these signals, in priority order:
   - **Jira ticket**: check component field, labels, or path references. If the ticket names a specific service, controller, or component, use its directory.
   - **Research scope**: if relevant files share a common parent directory (e.g., `domains/compute/apps/computecla-controller/`), use that directory.
   - **Small repos**: if the repository has a flat structure, use the repository root.

   Then append `plans/<identifier>/` to the resolved directory:
   - Jira ticket: `<component-dir>/plans/<ticket-id>/` (e.g., `domains/compute/apps/computecla-controller/plans/K8SRELEASE-123/`)
   - Free text: `<component-dir>/plans/<kebab-case-slug>/` (e.g., `domains/compute/apps/computecla-controller/plans/add-retry-logic/`)
   - Small/flat repos: `plans/<identifier>/` at repo root

8. **If ambiguous, ask the user** via `AskUserQuestion`:
   > "Where should I write the plan artifacts? The changes touch `<paths found>`. Suggested location: `<best guess>`."

9. **Create the directory** and store the path as `$ARTIFACT_DIR`.

## Phase 2b: Simple Path

**If `$COMPLEXITY` is Simple**, skip Phases 3–5:

10. **Write PLAN.md directly:**
    - Read `~/.claude/ccp-writing-rules.md` for the template and writing rules.
    - Write `$ARTIFACT_DIR/PLAN.md` following those rules. Keep each section to 1-3 bullets.
    - Jump to Phase 6 (Draft PR).

## Phase 3: Codebase Research

**Skip for Simple** (handled in Phase 2b).

11. **Identify research scope:**
    - Determine relevant codebase areas from the problem statement.
    - If the problem references code outside the working directory, ask: "I need access to `<path/repo>` because `<reason>`. Confirm the location?"
    - Do NOT proceed until scope is clear.

12. **Spawn a research subagent** — Agent tool, `subagent_type: "Explore"`, thoroughness `"very thorough"`. Instruct it to:
    - Map relevant architecture (files, packages, interfaces, data flow)
    - Find existing patterns the implementation should follow
    - Identify integration points and dependencies
    - Note existing tests covering the area
    - Return structured findings with file paths and line numbers

13. **Write findings** to `$ARTIFACT_DIR/RESEARCH.md`. This file is a **local working artifact** — it is NOT committed to git.

    ```markdown
    # Research: <problem summary>
    Date: <YYYY-MM-DD>
    Source: <ticket ID or "free text">

    ## Problem Statement
    <one paragraph>

    ## Relevant Architecture
    <files, packages, interfaces, data flow>

    ## Existing Patterns
    <patterns the implementation should follow, with file:line references>

    ## Integration Points
    <where new code connects to existing code>

    ## Dependencies
    <upstream/downstream dependencies affected>

    ## Test Coverage
    <existing tests, testing patterns used>
    ```

## Phase 4: Clarification

**Skip for Simple.** For Medium, skip unless research reveals ambiguity.

14. **Ask clarification questions** via `AskUserQuestion`. Based on research, surface:
    - Ambiguities in requirements
    - Design decisions with multiple viable approaches (present options with trade-offs)
    - Scope boundaries — what's in and out
    - Non-functional requirements (performance, backward compatibility, rollout)

    At most 4 questions. Specific, grounded in research findings. No generic questions.

## Phase 5: Plan Writing

**Skip for Simple** (handled in Phase 2b).

Delegate writing to a plan-writer subagent. Pass all gathered inputs; the writer focuses on structure and prose — no discovery.

15. **Spawn a plan-writer** — Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`. Pass explicitly:
    - Problem statement (step 5)
    - Jira context (step 4, if applicable)
    - Research file path and key findings summary (step 13)
    - User's clarification answers (step 14, if applicable)

    The agent must first **read `~/.claude/ccp-writing-rules.md`** to load the writing rules and PLAN.md template. Then write `$ARTIFACT_DIR/PLAN.md` following those rules strictly.

    The agent must read `$ARTIFACT_DIR/RESEARCH.md` for file paths and line numbers. No fabricated references.

## Phase 6: Draft PR

16. **Commit PLAN.md only and open a draft PR:**
    ```bash
    cd $WORKTREE_DIR
    git add $ARTIFACT_DIR/PLAN.md
    git commit -m "[<ticket-id>] plan(<scope>): <description>"  # omit [<ticket-id>] for free text input
    git push -u origin <branch-name>
    ```

    Do NOT commit RESEARCH.md — it is a local working artifact.

17. **Create draft PR:**
    ```bash
    gh pr create --draft --title "[<ticket-id>] plan(<scope>): <description>" --body "## Plan  # omit [<ticket-id>] for free text input

    Artifacts in \`$ARTIFACT_DIR/\`.

    Review the plan and leave comments before running \`/ccp-review\`."
    ```

18. **Present the PR link** to the user. Do NOT start implementation.

## Rules

- Never fabricate file paths or line numbers. Every reference must come from research.
- Keep the plan concrete: file paths, function names, specific changes. No hand-waving.
- If research reveals unexpected complexity, say so and recommend splitting.
- PLAN.md is the only committed artifact. RESEARCH.md stays local.
- Do not suggest changes to unread code.
- Match existing code style and patterns found during research.
- When using `AskUserQuestion`, never use the `markdown` preview field on options. Use plain `label` and `description` only. The markdown preview mode has UI bugs that prevent users from typing custom answers.
