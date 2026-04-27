---
description: Research the computecla-controller codebase and write an implementation plan from a CMPT ticket
argument-hint: <CMPT-TICKET-ID>
model: sonnet
allowed-tools: Read, Write, Edit, Bash(mkdir:*), Bash(git:*), Bash(gh:*), Grep, Glob, Agent, AskUserQuestion, ToolSearch, Skill
---

# CCP Plan — computecla-controller Planning

Load k8s controller design guidance, read the epic and ticket, research the codebase, then produce a concrete implementation plan using Opus.

## Input

$ARGUMENTS

## Phase 0: Load Skills and Anchor Context

1. **Invoke domain skills** — send a single message invoking both via the Skill tool simultaneously:
   - `compute:k8s-api-design` — CRD design patterns and API evolution rules
   - `compute:k8s-controller-dev` — controller-runtime reconciler patterns, status, finalizers, watches

   Wait for both to complete before continuing.

2. **Read anchor files** — read all of these to establish baseline context. Do NOT skip any:

   **computecla-controller:**
   - `domains/compute/apps/computecla-controller/CLAUDE.md`
   - `domains/compute/apps/computecla-controller/internal/controller/cluster_controller.go`
   - `domains/compute/apps/computecla-controller/internal/webhook/cluster_webhook.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/types.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/conditions.go`

   **computecla worker:**
   - `domains/compute/apps/computecla/worker/account/provisioning/phase_one.go`
   - `domains/compute/apps/computecla/worker/account/provisioning/skip.go`
   - `domains/compute/apps/computecla/worker/account/proto/account.proto`

   **computectl CLI:**
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla.go`
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/provision.go`
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/delete.go`
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/deprecate.go`

## Phase 0b: Worktree

3. **Create or reuse a git worktree:**
   - Get the GitHub username: `git config user.name`
   - Branch name: `<github-username>/<ticket-id>` (e.g., `maruina/CMPT-3802`)
   - Check for existing worktree: `git worktree list`
   - If exists, reuse it. Otherwise:
     ```bash
     git worktree add .claude/worktrees/<branch-name> -b <branch-name>
     ```
   - **All subsequent work happens inside the worktree.** Store as `$WORKTREE_DIR`.

## Phase 1: Epic and Ticket Context

4. **Load the epic** — use `ToolSearch` to load `getJiraIssue` and `searchJiraIssuesUsingJql`, then run both in parallel:
   - Fetch **CMPT-3786** to get the two-stream architecture (Stream 1: TemporalController, Stream 2: computecla-controller) and the stream-to-ticket mapping
   - Query non-done tickets: `project = CMPT AND "Epic Link" = CMPT-3786 AND status != Done ORDER BY created ASC`
   - Condense to a list: `CMPT-XXXX [status]: summary`

5. **Fetch the ticket** (`$ARGUMENTS` must be a CMPT ticket ID):
   - Fetch summary, description, comments, linked issues
   - Identify: which stream it belongs to, its dependencies (blockers, is-blocked-by), and which components it touches
   - Discard bot comments and status transitions. Condense under 200 words.

6. **State the problem** in one sentence. Confirm with the user before proceeding.

## Phase 2: Artifact Directory

7. **Artifact directory is always:**
   ```
   domains/compute/apps/computecla-controller/plans/<ticket-id>/
   ```
   Create it: `mkdir -p $WORKTREE_DIR/domains/compute/apps/computecla-controller/plans/<ticket-id>`. Store as `$ARTIFACT_DIR`.

## Phase 3: Codebase Research

8. **Identify research scope** from the ticket and anchor files already read:
   - Which anchor files are directly affected?
   - Are there non-anchor files that must be read (e.g., a specific activity, a specific CLI subcommand)?

9. **Spawn a research subagent** — Agent tool, `subagent_type: "Explore"`, thoroughness `"very thorough"`:

   > Working in the `domains/compute/apps/computecla-controller` ecosystem in dd-source.
   >
   > Ticket: `<ticket-id>` — `<ticket summary>`
   > Problem: `<problem statement from step 6>`
   >
   > Anchor files have already been read: cluster_controller.go, cluster_webhook.go, types.go, conditions.go, phase_one.go, skip.go, account.proto, computectl CLA commands.
   >
   > Investigate from these anchors outward:
   > - **Reconciler**: which conditions and state-machine branches are affected; deferred patchStatus implications
   > - **CRD / API**: new fields, condition constants, CEL validation rules
   > - **skip_steps pipeline**: which `ConditionXxx` constant is involved; flow from controller → `ProvisionClusterRequest.skip_steps` → `phase_one.go` skip guard
   > - **Webhook**: new or updated admission rules, failurePolicy implications
   > - **computecla worker**: which activities in `phase_one.go` are affected; proto message changes
   > - **computectl CLI**: which CLA subcommands need new flags, behaviors, or CR interactions
   > - **Test patterns**: `cluster_controller_test.go`, `cluster_controller_rms_test.go`, `cluster_webhook_test.go` — helpers to reuse
   >
   > Return structured findings with file:line references. Do NOT use SendMessage.

10. **Write findings** to `$ARTIFACT_DIR/RESEARCH.md`. This file is NOT committed.

    ```markdown
    # Research: <problem summary>
    Date: <YYYY-MM-DD>
    Source: <ticket ID>

    ## Problem Statement
    <one paragraph>

    ## Affected Components
    <controller / webhook / worker / CLI — and why each is affected>

    ## Reconciler Impact
    <conditions changed, state-machine paths affected>

    ## CRD / API Changes
    <new fields, condition constants, CEL rules>

    ## skip_steps Pipeline
    <ConditionXxx constant, where set in controller, where checked in phase_one.go>

    ## Worker Impact
    <phase_one.go changes, proto changes>

    ## CLI Impact
    <computectl CLA command changes>

    ## Integration Points
    <where new code connects to existing code, with file:line>

    ## Test Patterns
    <helpers to reuse: newTestReconciler, notFoundRMSClient, mockRMSClient, webhook test setup>
    ```

## Phase 4: Clarification

11. **Ask clarification questions** via `AskUserQuestion`. At most 3, grounded in research:
    - CRD API decisions with multiple valid options (present trade-offs)
    - Scope boundaries (what's in/out vs. a future ticket)
    - Ordering constraints from the epic stream

## Phase 5: Plan Writing (Opus)

12. **Spawn a plan-writer** — Agent tool, `subagent_type: "general-purpose"`, `model: "opus"`. Pass:
    - Problem statement (step 6)
    - Epic context: stream assignment, non-done ticket list, dependencies (steps 4–5)
    - Research file path and key findings (step 10)
    - Clarification answers (step 11)
    - The **template below** (use this instead of the generic template in `ccp-writing-rules.md`)

    The agent must:
    - Read `~/.claude/ccp-writing-rules.md` for writing rules (apply them; the template below overrides the generic template in that file)
    - Read `$ARTIFACT_DIR/RESEARCH.md` — all file paths and line numbers must come from here; no fabricated references
    - Write `$ARTIFACT_DIR/PLAN.md` using this template
    - **Do NOT add a Steps or Implementation Steps section.** The plan ends at WHAT and WHY. `/ccp-implement` handles HOW.
    - **One code snippet only** — in Key Design. No other inline code anywhere in the plan.

    ---

    ```markdown
    # Implementation Plan: <title>

    **Source**: [CMPT-XXXX](https://datadoghq.atlassian.net/browse/CMPT-XXXX)
    **Date**: <YYYY-MM-DD>
    **Author**: @<github-username>
    **Stream**: <Stream 1: TemporalController | Stream 2: computecla-controller>
    **Depends on**: <CMPT-XXXX (ticket link) or "none">

    ## Problem
    <one sentence>

    ## Approach
    <chosen approach with rationale — why this over alternatives. Most important section: reviewers evaluate direction here.>

    ## Open Questions
    - <question> — **Option A**: <pros/cons>. **Option B**: <pros/cons>. Recommendation: <which and why>.

    ## Key Design
    <core artifact: the new condition constant, CRD field, reconciler branch, or admission rule.
    This is what reviewers need to evaluate — no boilerplate, no codegen output.>

    ## Component Changes
    <!-- Design intent only — no code, no file lists, no numbered steps. -->

    ### computecla-controller
    <one sentence per affected area: reconciler, webhook, CRD types — WHAT changes, not HOW>

    ### computecla worker
    <one sentence per affected area: phase_one.go, proto — WHAT changes, not HOW>
    Omit if the worker is not touched.

    ### computectl CLI
    <one sentence per affected area: which commands, what new behaviour — WHAT changes, not HOW>
    Omit if the CLI is not touched.

    ## Testing Strategy
    - <specific test cases using fake client + patchStatus swap pattern from CLAUDE.md>
    - <webhook test cases if admission rules change>
    - <reuse newTestReconciler, notFoundRMSClient, mockRMSClient helpers>

    ## Risks & Mitigations
    - <concrete risks: condition flip-flop hot loops, webhook failurePolicy bypass, skip_steps backward compat, RMS write ordering>

    ## Out of Scope
    - <explicitly excluded — reference the next CMPT ticket where applicable>
    ```

    ---

## Phase 5b: Polish

13. **Polish the PLAN.md:**
    - Read `$ARTIFACT_DIR/PLAN.md`.
    - Invoke the `rewrite` skill, passing the file content as the argument.
    - Overwrite `$ARTIFACT_DIR/PLAN.md` with the polished output.

## Phase 6: Draft PR

14. **Commit PLAN.md and open a draft PR:**
    ```bash
    cd $WORKTREE_DIR
    git add $ARTIFACT_DIR/PLAN.md
    git commit -m "[CMPT-XXXX] plan(computecla-controller): <description>"
    git push -u origin <branch-name>
    ```
    Do NOT commit RESEARCH.md — it is a local working artifact.

15. **Create draft PR:**
    ```bash
    gh pr create --draft \
      --title "[CMPT-XXXX] plan(computecla-controller): <description>" \
      --body "## Plan

    Artifacts in \`$ARTIFACT_DIR/\`.

    Review the plan and leave comments before running \`/ccp-review\`."
    ```

16. **Present the PR link** to the user. Do NOT start implementation.

## Rules

- Never fabricate file paths or line numbers. Every reference must come from anchor files or RESEARCH.md.
- Keep the plan concrete: specific condition names, state-machine transitions, exact function signatures.
- If research reveals the ticket touches more streams than expected, say so and recommend splitting.
- PLAN.md is the only committed artifact. RESEARCH.md stays local.
- Match patterns from the computecla-controller CLAUDE.md: `patchStatus` swap, `toSet(skip_steps)`, `setCondition` helper, `context.WithoutCancel` in deferred patches, span finishing before condition mutations.
- When using `AskUserQuestion`, never use the `markdown` preview field on options. Use plain `label` and `description` only.
