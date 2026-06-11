---
description: Execute an approved implementation plan with review checkpoints
argument-hint: "<path-to-plan.md> [extra instructions]"
---
# Execute an Approved Plan
Plan: `$1`

Extra instructions:

> `${@:2}`

Execute the approved implementation plan.

Use the `resolve-worktree` skill to resolve `$1` with `$GLOB = plans/*/plan.md`. Switch context to the owning worktree before reading repository files or modifying code.

Lifecycle: `/brainstorm` creates an approved design spec, `/plan` creates an approved implementation plan, and `/execute` implements verified changes.

<HARD-GATE>
Do not start implementation on `main` or `master` without explicit user consent. Do not skip the initial plan review. Do not continue past blockers, unclear instructions, scope changes, or repeatedly failing verification; stop and ask.
</HARD-GATE>

## Posture
Treat the plan as executable instructions, not unquestionable truth. Review it critically before changing code, then follow it closely.

Keep changes surgical. Every changed line must map to a plan step or explicit user instruction.

For testable behavior, default to red-green-refactor: write or run the focused failing test first, implement only enough for the current behavior, run narrow verification, refactor only after green, then rerun verification.

## Workflow
1. Read the plan completely.
2. Inspect relevant guidance, git branch/status, files named by the plan, tests, build commands, package boundaries, and current repository state.
3. Load execution skills before editing. Read skills named by the plan, infer skills from affected files, and prefer specific skills over general ones.
4. Inspect referenced tickets, PRs, reviews, or discussion threads. If recent actionable feedback is missing from the plan, stop and ask whether to update it.
5. Review the plan before implementation:
   - Are files, commands, types, functions, tests, and dependencies present and consistent?
   - Does the plan match the current codebase?
   - Do repository instructions or loaded skills conflict with the plan?
   - Is the branch safe for implementation?
   - Are there blockers, risky assumptions, or ambiguities?
6. Verify the worktree starts with committed design and plan docs:
   - `plans/<ticket-or-feature>/design.md` exists.
   - `plans/<ticket-or-feature>/plan.md` exists.
   - Both files are committed in git, ideally in separate commits.
7. If the design or plan docs are uncommitted or untracked, recover before implementation only when all of these are true:
   - the only uncommitted changes are under the selected `plans/<ticket-or-feature>/` directory
   - both `design.md` and `plan.md` are present
   - the docs are new or modified only as expected lifecycle artifacts
   Then commit the design first with `docs: add <ticket-or-feature> design`, and commit the plan second with `docs: add <ticket-or-feature> implementation plan`. Stage only the relevant file for each commit. If recovery cannot safely create separate commits, stop and ask.
8. Inspect uncommitted work before implementation. Stop and ask if there are any uncommitted changes after recovery. The plan ledger starts committed; execution may update it after implementation begins.
9. If there are concerns, report them and ask for direction before modifying files.
10. If there are no concerns, execute tasks in order.
11. For each task, update plan checkboxes as work progresses, run the specified verification, and mark steps complete only after verification passes.
12. Complete the plan's documentation and future-agent guidance task, including every required `AGENTS.md` inspection.
13. Run the final verification commands and inspect `git status`.
14. Review plan fidelity: all tasks complete, requirements met, no unapproved scope added, and deviations documented in the plan ledger.
15. Use `/pr-create --draft` to open a draft PR unless the user explicitly says not to.
16. Report the exact handoff phrase below.

The terminal state is implemented, verified changes with the plan updated as the progress ledger.

## Task Rules
For each task:

1. Mark the current task or step as in progress in the plan file.
2. Perform only the current step.
3. Run the specified verification, or explain why an equivalent command is required before running it.
4. Mark the step complete only after verification passes.
5. If verification fails, debug only within the current step and plan scope.
6. Commit only when the plan says to commit. Use the exact commit message unless it no longer matches the change; if it does not match, stop and ask.

Do not batch unrelated tasks. Do not skip narrow tests because later tasks run broader tests. Do not batch all tests ahead of implementation or all implementation ahead of verification unless the plan explicitly requires that shape.

Keep tests on observable behavior through public or supported interfaces. Mock system boundaries such as external APIs, time, randomness, databases, or filesystems when needed; do not mock internal collaborators unless the repository already treats that seam as public.

## Stop Conditions
Stop and ask when:

- the branch is `main` or `master` and the user has not explicitly approved implementation there
- the selected `design.md` and `plan.md` cannot be committed or recovered into separate commits before implementation begins
- there are any uncommitted changes after lifecycle doc recovery; the plan ledger starts committed and execution may update it after work starts
- the plan has gaps that prevent safe execution
- a plan instruction conflicts with repository guidance or a loaded skill
- an instruction is unclear
- a required dependency, credential, service, or generated artifact is missing
- verification fails repeatedly after focused debugging
- implementation needs a scope, behavior, API, schema, rollout, or rollback change beyond the approved plan
- the plan requires an unavailable skill
- the current codebase materially differs from the plan assumptions
- a loaded skill shows the planned approach is unsafe or non-idiomatic

Return to plan review after the blocker is resolved or the user approves a plan change.

## Plan Updates
Use the plan file as the progress ledger:

- update checkboxes for completed work
- add short notes for deviations, failed verifications, equivalent commands, and refactors made after green
- do not rewrite the approved plan unless the user approves a plan change

## Handoff
After all tasks are complete, verification passes, `git status` has been inspected, and the draft PR is opened, summarize changed files, verification commands, and follow-up items. Then say exactly:

> I finished implementing the plan
