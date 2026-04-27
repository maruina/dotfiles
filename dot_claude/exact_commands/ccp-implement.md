---
description: Implement computecla-controller changes from a PLAN.md, with parallel code review
argument-hint: <path-to-PLAN.md or "description of the change">
model: sonnet
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(bzl:*), Bash(codex:*), Bash(make:*), Bash(mkdir:*), Grep, Glob, Agent, AskUserQuestion
---

# CCP Implement — computecla-controller Implementation Pipeline

Implement computecla-controller changes, run 4 parallel code reviews, synthesize findings, fix issues, then commit and create a PR.

Accepts two modes:
- **Planned**: path to an existing PLAN.md (from `/ccp-plan`)
- **Quick**: free text description — runs lightweight inline planning, then the same flow

## Input

$ARGUMENTS

## Phase 0: Anchor Context

1. **Read anchor files** to establish implementation patterns. Do NOT skip any:

   **computecla-controller:**
   - `domains/compute/apps/computecla-controller/CLAUDE.md`
   - `domains/compute/apps/computecla-controller/internal/controller/cluster_controller.go`
   - `domains/compute/apps/computecla-controller/internal/controller/cluster_controller_test.go`
   - `domains/compute/apps/computecla-controller/internal/webhook/cluster_webhook.go`
   - `domains/compute/apps/computecla-controller/internal/webhook/cluster_webhook_test.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/types.go`
   - `domains/compute/libs/go/computecla-controller/apis/computecla.datadoghq.com/v1alpha1/conditions.go`

   **computecla worker:**
   - `domains/compute/apps/computecla/worker/account/provisioning/phase_one.go`
   - `domains/compute/apps/computecla/worker/account/provisioning/skip.go`
   - `domains/compute/apps/computecla/worker/account/proto/account.proto`

   **computectl CLI:**
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/provision.go`
   - `domains/compute/apps/computectl/cmd/computectl/cmd/cla/delete.go`

## Phase 0b: Worktree Detection

2. **Detect or create worktree:**
   - Check: `git rev-parse --show-toplevel` and `git worktree list`.
   - If already in a worktree (e.g., from `/ccp-plan`), continue there. Store as `$WORKTREE_DIR`.
   - If NOT in a worktree, derive a branch name from the PLAN.md path or input:
     - Check: `git worktree list` — if found, use it.
     - Otherwise: `git worktree add .claude/worktrees/<branch-name> -b <branch-name>`
   - **All subsequent work happens inside the worktree.**

## Phase 1: Route Input

3. **Determine input type:**
   - **Path to PLAN.md** (ends in `.md` or contains `PLAN`): read it. `$ARTIFACT_DIR` = containing directory. Skip to step 7.
   - **No argument**: search for `PLAN.md` in current dir, then `Glob`. If multiple, ask user.
   - **Free text**: proceed to Phase 1b.

## Phase 1b: Inline Planning (quick mode only)

4. **Quick research** — Agent tool, `subagent_type: "Explore"`, thoroughness `"medium"`:
   > Based on: "<user's free text>"
   > Working in the computecla-controller ecosystem (computecla-controller, computecla worker, computectl CLI).
   > Return: files to modify, existing patterns to follow, risks. Do NOT use SendMessage.

5. **Write a lightweight PLAN.md:**
   - `$ARTIFACT_DIR` = `domains/compute/apps/computecla-controller/plans/<kebab-slug>/`
   - Read `~/.claude/ccp-writing-rules.md`. Write `$ARTIFACT_DIR/PLAN.md` following those rules (1–3 bullets per section).
   - Confirm via `AskUserQuestion`: "Quick plan ready. Proceed, or refine first?"

## Phase 2: Load Plan

6. **Read supporting artifacts:**
   - Read `$ARTIFACT_DIR/RESEARCH.md` if it exists.
   - Read `$ARTIFACT_DIR/REVIEW.md` if it exists.

7. **Extract implementation targets:**
   - Parse **Approach**, **Key Design**, **Component Changes**, and **Testing Strategy** sections.
   - From **Component Changes**, identify which of the three components are touched: controller, worker, CLI.
   - Build the implementation checklist per component.

8. **Confirm** via `AskUserQuestion`: "Ready to implement: <plan title>. Proceed?"

## Phase 3: Implement

9. **Implement changes**, following the Approach and Key Design sections:
   - Match patterns from the anchor files read in Phase 0: `patchStatus` swap, `toSet(skip_steps)`, `setCondition` helper, `context.WithoutCancel` in deferred patches, span finishing immediately after the RPC.
   - If the plan is ambiguous, ask before guessing.

10. **Run Gazelle** for each touched component (before building):

    **controller or CRD types touched:**
    ```bash
    bzl run //:gazelle -- update domains/compute/apps/computecla-controller domains/compute/libs/go/computecla-controller
    ```
    **worker touched:**
    ```bash
    bzl run //:gazelle -- update domains/compute/apps/computecla
    ```
    **CLI touched:**
    ```bash
    bzl run //:gazelle -- update domains/compute/apps/computectl
    ```

11. **CRD codegen** — run only if `types.go` or `conditions.go` was modified:
    ```bash
    cd domains/compute/libs/go/computecla-controller
    make generate
    CRD_DIR="$(git rev-parse --show-toplevel)/domains/compute/libs/go/computecla-controller/config/crd/bases"
    mkdir -p "$CRD_DIR"
    bzl run @io_k8s_sigs_controller_tools//cmd/controller-gen -- crd \
      paths="$(git rev-parse --show-toplevel)/domains/compute/libs/go/computecla-controller/apis/..." \
      "output:crd:artifacts:config=$CRD_DIR"
    ```

12. **Run tests** for each touched component:

    **controller:**
    ```bash
    bzl test //domains/compute/apps/computecla-controller/internal/controller:all //domains/compute/apps/computecla-controller/internal/webhook:all
    ```
    **worker:**
    ```bash
    bzl test //domains/compute/apps/computecla/worker/account:all
    ```
    **CLI:**
    ```bash
    bzl test //domains/compute/apps/computectl/cmd/computectl/cmd/cla:all
    ```
    Fix all failures before proceeding.

13. **Format check:**
    ```bash
    git diff --name-only origin/main...HEAD | grep '\.go$' > /tmp/pr_changed.txt
    bzl run @//tools/format:format_go -- --git-diff-file=/tmp/pr_changed.txt
    ```
    Re-stage any files the formatter touches.

## Phase 4: Simplify

14. **Invoke the `simplify` skill.** It reads recently modified files, fixes redundancy, unnecessary abstractions, and inconsistent patterns, then re-stages its changes.

15. **Re-run tests** for all touched components (step 12) after simplification. All must pass before proceeding.

## Phase 5: Parallel Review

Spawn both reviewers simultaneously. Both report findings — neither edits files.

16. **Claude code reviewer** — Agent tool, `subagent_type: "feature-dev:code-reviewer"`, `model: "sonnet"`:

    > Review uncommitted changes for bugs, logic errors, and project convention adherence. Focus on:
    > - Condition flip-flop: does any path set a condition True then immediately False in the same reconcile pass?
    > - `context.WithoutCancel`: is it used in every deferred patchStatus call?
    > - Span finishing: are child spans finished immediately after their RPC, not via defer?
    > - skip_steps: is the skip check `!skip[computeclav1alpha1.ConditionXxx]` guarding the right activity?
    > - Webhook failurePolicy implications if new admission rules are added.
    >
    > Rate: **[CRITICAL]** bug/correctness, **[MAJOR]** quality concern, **[MINOR]** style.
    > Return findings with file:line. Do NOT edit files. Do NOT use SendMessage.

17. **Codex reviewer** — Agent tool, `subagent_type: "general-purpose"`, `model: "haiku"`:

    > Run `codex review --uncommitted` from the repository root. Return raw output. Do NOT use SendMessage.

**Wait for both to complete.**

## Phase 6: Synthesis

18. **Synthesize findings:**
    - Combine, deduplicate, group by severity (CRITICAL → MAJOR → MINOR).
    - For each finding, state why it matters: what breaks, what risk, what cost.

19. **Write `$ARTIFACT_DIR/IMPLEMENTATION-REVIEW.md`** (local only, not committed):

    ```markdown
    # Implementation Review: <plan title>

    **Date**: <YYYY-MM-DD>
    **Reviewers**: claude, codex

    ## Findings

    ### CRITICAL
    - **<title>** — <description with file:line>
      - Source: <claude / codex>
      - **Why this matters**: <impact>

    ### MAJOR / MINOR
    (same structure)

    ## Codex Output
    <raw codex output>
    ```

20. **Present the review.** Summarize by count (e.g., "1 CRITICAL, 2 MAJOR, 4 MINOR").

21. **Ask** via `AskUserQuestion`: "Which findings should I fix?" Options: **All** / **CRITICAL only** / **Let me choose**.

## Phase 7: Fix

22. **Fix accepted findings.** Explain any deviation from the plan.

23. **Re-run tests** for all touched components (step 12). All must pass.

## Phase 8: Commit & PR

24. **Format check** (again after fixes):
    ```bash
    git diff --name-only origin/main...HEAD | grep '\.go$' > /tmp/pr_changed.txt
    bzl run @//tools/format:format_go -- --git-diff-file=/tmp/pr_changed.txt
    ```

25. **Commit changes** using atomic commits — one per logical topic (e.g., CRD types, controller, tests, worker). From `computecla-controller/CLAUDE.md`:
    ```bash
    git add <specific-files>
    git commit -m "[CMPT-XXXX] <type>(computecla-controller): <description>"
    ```
    Include PLAN.md if not already committed. Do NOT commit RESEARCH.md, REVIEW.md, or IMPLEMENTATION-REVIEW.md.

26. **Push and create PR** using the format from `computecla-controller/CLAUDE.md`:
    ```bash
    git push -u origin <branch-name>
    gh pr create --title "[CMPT-XXXX] <type>(computecla-controller): <description>" --body "$(cat <<'EOF'
    ## Context

    Part of [CMPT-3786](https://datadoghq.atlassian.net/browse/CMPT-3786) — specifically [CMPT-XXXX](https://datadoghq.atlassian.net/browse/CMPT-XXXX).
    <one paragraph on why the change exists>

    ## What this PR does

    - **<key artifact>**: <description>

    ## Tests

    <what tests were added, or why none if logic is unreachable>

    ## What's next

    \`\`\`
    CMPT-XXXX — <next ticket title>
    CMPT-XXXX — <ticket after that>
    \`\`\`

    ---
    🤖 This PR was authored with assistance from [Claude Code](https://claude.com/claude-code) AI

    [CMPT-XXXX]: https://datadoghq.atlassian.net/browse/CMPT-XXXX
    [CMPT-3786]: https://datadoghq.atlassian.net/browse/CMPT-3786
    EOF
    )"
    ```

27. **Trigger Codex review:**
    ```bash
    gh pr comment <pr-number> --body "@codex review"
    ```

28. **Present the PR link.** Do NOT merge.

## Rules

- Follow the plan. Deviations require explicit user approval.
- Simplify runs first and fixes code. Both reviewers run in parallel after. None edit files.
- CRITICAL findings must be fixed. MAJOR and MINOR are advisory.
- Tests must pass before and after the review-fix cycle.
- Run Gazelle before building — never write BUILD files manually.
- Run format check before every PR push.
- Only PLAN.md and implementation code are committed. RESEARCH.md, REVIEW.md, IMPLEMENTATION-REVIEW.md stay local.
- When using `AskUserQuestion`, never use the `markdown` preview field. Use plain `label` and `description` only.
