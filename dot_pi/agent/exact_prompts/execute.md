---
description: Execute an approved implementation plan with review checkpoints
argument-hint: "<path-to-plan.md> [extra instructions]"
---

# Executing Approved Implementation Plans

Plan: `$1`

Extra instructions:

> `${@:2}`

Execute the approved implementation plan. If `$1` is missing, ask for the plan path and stop.

Lifecycle:

1. `/design` turns an idea into an approved design spec.
2. `/plan` turns an approved design spec into an approved implementation plan.
3. `/execute` turns an approved implementation plan into verified changes.

<HARD-GATE>
Do not start implementation on `main` or `master` without explicit user consent. Do not skip the initial plan review. Do not continue past blockers, unclear instructions, or repeatedly failing verification; stop and ask.
</HARD-GATE>

## Posture

Be convinced, not blindly compliant. Treat the plan as executable instructions, but review it critically before changing code.
Follow the approved plan closely once it passes review. Deviate only because of repository reality, equivalent verification commands, or user-approved plan changes.
Keep changes surgical: every changed line should map to a plan step or explicit user instruction.

## Flow

1. Read the plan from `$1` completely.
2. Inspect repository guidance and enough codebase context to validate the plan: relevant `AGENTS.md` files, project shape, package boundaries, files named by the plan, tests, build commands, and current git branch/status.
3. Load execution skills proactively before starting. Read skills explicitly named in the plan, infer additional skills from affected files and tasks, prefer specific skills over general ones, read supporting files referenced by loaded skills. If you discover a new domain during execution, pause and load the relevant skill. If no available skill applies, say so briefly in the review and proceed with repository guidance.
4. Review the plan critically before implementation:
   - Are any files, commands, types, functions, or test names missing or inconsistent?
   - Do the tasks match the current codebase state?
   - Are required skills or repository instructions missing from the plan?
   - Is the branch safe for implementation?
   - Are there blockers, risky assumptions, or ambiguities?
5. If there are concerns, report them and ask for direction before modifying files.
6. If there are no concerns, execute tasks in order.
7. For each task, update the plan checkboxes as work progresses:
   - mark the current step/task in progress when starting it
   - follow the step closely
   - run the verification exactly as specified, or explain why an equivalent command is necessary before running it
   - mark the step/task complete only after verification passes
8. Complete the plan's docs and future-agent guidance task, including every required `AGENTS.md` inspection.
9. Run the plan's final verification commands and inspect `git status`.
10. Use the `/pr-create --draft` prompt template to open a draft PR for the branch.
11. Report completion using the exact handoff phrase below.

The terminal state is implemented, verified changes, with the plan updated to show completed work.



## Task Execution Rules

For each task:

1. Mark the task or first unchecked step as in progress in the plan file.
2. Perform only the current step.
3. Run the specified verification.
4. If verification passes, update the checkbox to complete.
5. If verification fails, debug only within the scope of the current step and plan.
6. Commit when the plan instructs you to commit, using the exact Conventional Commit message unless it no longer matches the actual change; if it no longer matches, stop and ask.

Do not batch unrelated tasks. Do not skip tests because later tasks run broader tests.

## When to Stop and Ask for Help

STOP executing immediately when:

- You are on `main` or `master` and do not have explicit consent to implement there. The design and the plan should be already in a worktree:
   ```shell 
   REPO=$(basename "$(git rev-parse --show-toplevel)")
   WORKTREE="../${REPO}-<jira-ticket-or-feature-name>"
   ```
- The plan has critical gaps preventing safe execution.
- A plan instruction conflicts with repository guidance or a loaded skill.
- You do not understand an instruction.
- A required dependency, credential, service, or generated artifact is missing.
- Verification fails repeatedly after focused debugging.
- The implementation requires changing scope, public behavior, APIs, schemas, or rollout strategy beyond the approved plan.
- The plan says to reference a skill and no matching skill is available.
- The current codebase differs materially from what the plan assumed.
- A loaded skill reveals that the planned approach is unsafe or non-idiomatic.

Return to plan review after the user resolves a blocker or approves a plan change. Ask for clarification rather than guessing.

## Plan Updates

Keep the plan file as the progress ledger:

- Use checkbox updates for completed steps.
- Add short notes only when they help a future reviewer understand deviations, failed verifications, or equivalent commands.
- Do not rewrite the approved plan unless the user approves a plan change.

## Completion Handoff

After all tasks are complete, all verifications pass, and `git status` has been inspected:

1. Summarize changed files, verification commands run, and any follow-up items.
2. Run `/pr-create --draft` by following the `/pr-create` prompt template. Always create as draft; the user will mark it ready for review when appropriate.
3. If an approved plan includes its own PR creation command, use `/pr-create --draft` instead unless the user explicitly approved the custom command.
4. Say exactly:

> I finished implementing the plan
