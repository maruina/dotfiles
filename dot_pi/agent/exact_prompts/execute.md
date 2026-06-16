---
description: Execute an approved implementation plan with review checkpoints
argument-hint: "<path-to-plan.md> [extra instructions]"
---
# Execute an Approved Plan
Plan: `$1`

Extra instructions:

> `${@:2}`

Execute the approved implementation plan.

Use the `resolve-worktree` skill to resolve `$1` with `$GLOB = **/plans/*/plan.md`. Switch context to the owning worktree before reading repository files or modifying code. The recursive glob matches plans nested under monorepo package paths (e.g. `domains/compute/apps/<app>/plans/<ticket>/plan.md`), not only repository-root `plans/`.

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
   - `plans/<ticket-or-feature>/design.md` exists and is committed.
   - `plans/<ticket-or-feature>/plan.md` exists and is committed, ideally in a separate commit.
7. If either doc is uncommitted or untracked, recover only when all of these are true: the only uncommitted changes are under `plans/<ticket-or-feature>/`, both files are present, and the docs are new or modified only as expected lifecycle artifacts. Commit the design first, then the plan, staging only the relevant file per commit. If recovery cannot safely create separate commits, stop and ask.
8. Stop and ask if there are any uncommitted changes after recovery. The plan ledger starts committed; execution may update it once work begins.
9. Report any concerns and ask for direction before modifying files.
10. Execute tasks in order.
11. For each task, update plan checkboxes as work progresses, run the specified verification, and mark steps complete only after verification passes.
12. Complete the plan's documentation and future-agent guidance task, including every required `AGENTS.md` inspection.
13. Run the final verification commands and inspect `git status`.
14. Review plan fidelity: all tasks complete, requirements met, no unapproved scope added, and deviations documented in the plan ledger.
15. Before opening a PR, evaluate the completed work against the stack-split signals from the `reviewable-pr-workflow` skill:
   - Strong signals: 2+ distinct subsystems that could ship independently; more than ~400 net lines of non-generated, non-test code; more than ~15 non-generated files.
   - Soft signals: reviewer guide would need more than five topics; commits fall into independent groups; branch mixes refactor, feature, and behavior change.
   If any strong signal trips, or two or more soft signals trip, **stop and propose a stack plan** (one row per branch in dependency order) and ask whether to split before opening any PR. Do not proceed past this point until the user responds.
   If no split is needed, use `/pr-create --draft` to open a draft PR unless the user explicitly says not to.
16. Report the exact handoff phrase below.

The terminal state is implemented, verified changes with the plan updated as the progress ledger.

## Task Rules

1. Mark the current task or step as in progress in the plan file.
2. Perform only the current step.
3. Run the specified verification, or explain why an equivalent command is required before running it.
4. Mark the step complete only after verification passes.
5. If verification fails, debug only within the current step and plan scope.
6. Commit only when the plan says to commit. Use the exact commit message unless it no longer matches the change; if it does not match, stop and ask.

Do not batch unrelated tasks or skip narrow tests because later tasks run broader ones. Do not batch all tests ahead of implementation or all implementation ahead of verification unless the plan explicitly requires that shape.

Keep tests on observable behavior through public or supported interfaces. Mock system boundaries (external APIs, time, randomness, databases, filesystems) when needed; do not mock internal collaborators unless the repository already treats that seam as public.

## Stop Conditions
Stop and ask when:

- the completed implementation triggers a strong or two-soft stack-split signal (see step 15) and the user has not approved a split or single-PR decision
- the branch is `main` or `master` without explicit user approval
- `design.md` and `plan.md` cannot be committed or recovered into separate commits before implementation begins
- there are uncommitted changes after lifecycle doc recovery
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
