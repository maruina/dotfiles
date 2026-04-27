---
description: Review a computecla-controller PLAN.md against codebase patterns and correctness
argument-hint: <PR-URL or path-to-PLAN.md>
model: sonnet
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(gh:*), Grep, Glob, Agent, AskUserQuestion
---

# CCP Review — computecla-controller Plan Review Pipeline

Validate a computecla-controller plan against the codebase, surface gaps and risks, write REVIEW.md, then reconcile feedback into PLAN.md.

## Input

$ARGUMENTS

## Phase 0: Worktree Detection

1. **Detect or create worktree:**
   - Check: `git rev-parse --show-toplevel` and `git worktree list`.
   - If already in a worktree, continue there. Store as `$WORKTREE_DIR`.
   - If NOT in a worktree, derive branch from the PLAN.md path or PR:
     - Found: use it. Not found: `git worktree add .claude/worktrees/<branch-name> -b <branch-name>`
   - **All subsequent work happens inside the worktree.**

## Phase 1: Load Context

2. **Determine input and find PLAN.md:**

   **PR URL** (contains `github.com` and `/pull/`):
   - `gh pr view <number> --repo DataDog/dd-source --json headRefName,files`
   - Find PLAN.md in the file list. Check out the branch in the worktree.
   - `gh api repos/DataDog/dd-source/pulls/<number>/comments` — store as `$PR_COMMENTS`.

   **Path to PLAN.md**: read directly. `$PR_COMMENTS` = empty.

   **No argument**: search current dir then `Glob`. If multiple, ask user. `$PR_COMMENTS` = empty.

3. **Find RESEARCH.md** at `$ARTIFACT_DIR/RESEARCH.md`. If absent, warn: "No research file — pattern validation may be less thorough."

4. **Extract review targets:**
   - Parse **Approach**, **Key Design**, **Component Changes**, and **Testing Strategy** sections.
   - From **Component Changes**, identify which components are in scope: controller, worker, CLI.
   - List anchor files relevant to the in-scope components (see step 5).

## Phase 2: Parallel Review

Spawn both reviewers simultaneously.

5. **Technical reviewer** — Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`:

   Pass: PLAN.md path, research file path, in-scope component list.

   > Read PLAN.md and RESEARCH.md. For each proposed change, verify:
   >
   > **Correctness**:
   > - Do referenced files, functions, and types exist at the stated paths/lines?
   > - Controller: does the reconciler avoid condition flip-flop (setting a condition True then immediately False in the same pass)?
   > - Controller: is `context.WithoutCancel` used in the deferred `patchStatus` call?
   > - Controller: are child spans finished immediately after the RPC, not via defer?
   > - Controller: does the `isAlreadyProvisioned` RMS skip path handle force-reconcile correctly?
   > - skip_steps: is the `ConditionXxx` constant used consistently between `conditions.go`, the controller reconciler, and `phase_one.go`?
   > - Webhook: does new admission logic require `failurePolicy: Fail` to be meaningful?
   > - CRD: do new fields follow kstatus conventions (spec = desired, status = observed)?
   > - CRD: are CEL `XValidation` rules on the UPDATE path accompanied by a `ValidateUpdate` webhook for the absent-to-set edge case?
   >
   > **Completeness**: Does the plan address all requirements from the ticket? Are downstream callers (computectl, other workflows) covered?
   >
   > **Risk**: What happens on partial failure or rollback? Is `skip_steps` backward compatible (old workers ignore unknown step names)?
   >
   > **Testing**: Do proposed tests use the existing helpers — `newTestReconciler`, `notFoundRMSClient`, `mockRMSClient`, `patchStatus` swap, `WithStatusSubresource`?
   >
   > **Simplicity**: Is this the simplest approach? Flag over-engineering.
   >
   > Rate: **[BLOCKER]** must fix, **[CONCERN]** worth discussing, **[SUGGESTION]** advisory.
   > Return severity-ordered list with file:line. Do NOT write files. Do NOT use SendMessage.

6. **Pattern reviewer** — Agent tool, `subagent_type: "Explore"`, thoroughness `"very thorough"`:

   Pass: in-scope component paths, Approach and Key Design content.

   Start from these anchor files and explore outward:
   - `domains/compute/apps/computecla-controller/internal/controller/cluster_controller.go`
   - `domains/compute/apps/computecla-controller/internal/controller/cluster_controller_test.go`
   - `domains/compute/apps/computecla-controller/internal/webhook/cluster_webhook.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/types.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/conditions.go`
   - `domains/compute/apps/computecla/worker/account/provisioning/phase_one.go`
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/provision.go`

   > For each file the plan proposes to modify or create:
   > - Read sibling files in the same package
   > - Identify patterns: error handling, condition-setting style (`setCondition` helper), metric emission, span naming, test helper reuse
   > - Check whether the plan follows these patterns
   > - Flag cases where the plan introduces a new pattern when an existing one would work
   > - If the plan modifies shared types (conditions.go, types.go, account.proto), check all call sites
   >
   > Return: patterns found, whether the plan follows them, deviations. Include file:line. Do NOT use SendMessage.

**Wait for both to complete.**

## Phase 3: Write REVIEW.md

7. **Synthesize findings:**
   - Combine both reviewers.
   - If `$PR_COMMENTS` is not empty, incorporate human comments as findings (classify by tone: BLOCKER/CONCERN/SUGGESTION, source: `pr-comment (<author>)`).
   - Deduplicate; group BLOCKERs first.
   - Write `$ARTIFACT_DIR/REVIEW.md` (local only, not committed):

   ```markdown
   # Review: <plan title>

   **Date**: <YYYY-MM-DD>
   **Plan**: PLAN.md

   ## Findings

   ### BLOCKERs
   - **<title>** — <description with file:line>
     - Source: <technical / pattern / pr-comment (author)>

   ### CONCERNs / SUGGESTIONs
   (same structure)

   ## Patterns Validated
   - <pattern> — consistent / deviation noted above
   ```

## Phase 4: User Review

8. **Present the review.** Summarize by count (e.g., "2 BLOCKERs, 1 CONCERN").

9. **Ask** via `AskUserQuestion`: "Which findings should I incorporate into PLAN.md?"
   Options: **All** / **BLOCKERs only** / **Let me choose**.

## Phase 5: Reconciliation

10. **Spawn a reconciler** — Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`:

    > Read `~/.claude/ccp-writing-rules.md` for the PLAN.md writing rules.
    > Read PLAN.md and REVIEW.md. Incorporate accepted findings:
    > - Assumption challenged → add evidence or note as known risk in Approach
    > - Pattern deviation → align with existing patterns in Approach
    > - Simplicity concern → simplify Approach or Component Changes
    > - Missing detail → add to Approach or Key Design
    >
    > The updated PLAN.md must follow the writing rules strictly. No Steps section, no file lists, one code snippet only (in Key Design).
    > Do NOT use SendMessage.

11. **Commit updated PLAN.md only:**
    ```bash
    git add $ARTIFACT_DIR/PLAN.md
    git commit -m "[CMPT-XXXX] plan(computecla-controller): incorporate review feedback"
    git push
    ```
    Do NOT commit REVIEW.md or RESEARCH.md.

12. **Present the updated plan.** Summarize what changed. Do NOT start implementation.

## Rules

- Every finding must reference specific file paths or plan sections. No vague feedback.
- BLOCKERs must be resolved. CONCERNs and SUGGESTIONs are advisory.
- Human PR comments are first-class findings — classified and reconciled like any other source.
- Only PLAN.md is committed. RESEARCH.md and REVIEW.md stay local.
- When using `AskUserQuestion`, never use the `markdown` preview field. Use plain `label` and `description` only.
