---
description: Execute a committed implementation plan with review checkpoints
argument-hint: "[path-to-plan.md | trivial work prompt] [extra instructions]"
---
# Execute
Execution input:

> $ARGUMENTS

## Lifecycle mode
Only use the bridge when the injected stage contract validates protocol version 1, run ID, stage `execute`, fixed unit, pinned baseline, model, thinking, and both `lifecycle_request_decision` and `lifecycle_submit_outcome` tools are available. If a present contract is malformed/mismatched or a tool is missing, stop and ask. Otherwise, without a contract, use ordinary conversational approvals and manual handoffs, not the bridge.

Validate the `Pinned baseline commit`, `Pinned plan blob`, `Pinned design blob`, `Selected unit`, and `Selected task numbers`. Pinned requirements govern; the current plan is only a progress ledger. Work only on the fixed unit. Use `lifecycle_request_decision` only for in-scope decisions. A rejected or dismissed decision stops the stage without success. For another blocker, submit the stage-appropriate `blocked` outcome. After authorized work, checks, commits, and pushes, submit exactly one `success` outcome with `change: changed` or `change: unchanged`; never use prose as the result.

Execute a committed implementation plan. For trivial low-risk work, `/execute` may also execute directly from a bare prompt after complexity triage.

Use the `resolve-worktree` skill to resolve plan paths with `$GLOB = **/plans/*/plan.md`. Switch context to the owning worktree before reading repository files or modifying code. The recursive glob matches plans nested under monorepo package paths (e.g. `domains/compute/apps/<app>/plans/<ticket>/plan.md`), not only repository-root `plans/`.

<HARD-GATE>
Do not start implementation on `main` or `master` without explicit user consent. Do not skip the initial plan or prompt review. Do not continue past blockers, unclear instructions, scope changes, or repeated verification failures; stop and ask.
</HARD-GATE>

## Input Handling
If the first argument resolves to a plan path, follow the normal plan workflow.

If the first argument names no plan path — for example, notes quoted from a design or a plan written in a different session — do not search worktrees for a plan that matches the argument's content. Plan discovery runs only when the command is invoked with no arguments. Treat the conversation as the bare prompt and apply the complexity triage below. If the input references lifecycle work that has no committed plan in this repository, say so and stop and ask whether to resume in the owning session or worktree, or run `/plan` here.

If invoked with no arguments, first use the `resolve-worktree` skill with `$GLOB = **/plans/*/plan.md` to discover existing plans across worktrees. If a plan is resolved, switch context to the owning worktree and follow the normal plan workflow. If no plan is found, treat the current conversation as the bare prompt and apply the complexity triage below.

If invoked with a bare prompt instead of a plan path, classify complexity before editing:

- **Trivial:** 1-2 files, no behavioral change, low risk, clear validation. Examples: typo fixes, comments, formatting, one-file non-behavioral config, or clearly mechanical updates. Proceed directly after checking branch/status and relevant files.
- **Non-trivial:** behavior, APIs, data, infrastructure, permissions, generated artifacts, rollout, multiple files, unclear validation, or meaningful review risk. Stop and ask the user to run `/plan` first.

Bare-prompt execution must not become planning inside `/execute`. If you need to invent scope, success criteria, rollout, test strategy, or behavior, stop and ask for `/brainstorm` or `/plan`.

## Worktree Policy
Before changing files, use the `feature-worktree` skill to continue in the plan's worktree or the correct feature worktree, or to create one.

## Posture
Treat the plan as a decision artifact, not an unquestionable script. Follow its scope, requirements, references, and non-goals. Do not blindly follow stale file paths or commands if the current repository contradicts them.

Keep changes surgical. Every changed line must map to a plan step, trivial bare prompt, or explicit user instruction.

Use boring technology and existing repository patterns. Reuse existing libraries, services, CLIs, controllers, APIs, and platform primitives. Do not reimplement the wheel without an explicit plan decision.

For testable behavior, default to red-green-refactor: write or run the focused failing test first, implement only enough for the current behavior, run narrow verification, refactor only after green, then rerun verification.

Do not leave the work 80% done. Complete the current approved slice, including tests, docs impact, verification, and PR readiness, or stop with a clear blocker.

## Slice execution
A plan with no slice grouping executes all tasks as today and hands off once.

For a plan with `### Slice N` headings, read the plan, find the first slice with incomplete tasks, and execute only that slice. After the slice's verification passes and you update the ledger, stop and hand off; do not auto-run the remaining slices. A later `/execute` on the same plan resumes at the next incomplete slice. If the user names a slice in the extra instructions, execute that slice when it has no incomplete blockers. For a multi-slice plan, the terminal state is one verified slice increment with the plan updated as the ledger.

## Workflow
1. **Setup —** Resolve and read the plan completely, or classify the bare prompt as trivial before editing.
2. Satisfy the worktree policy before changing files.
3. **Review —** Inspect relevant guidance, git branch/status, files named by the plan or prompt, tests, build commands, package boundaries, and current repository state.
4. Load execution skills before editing. Use the `skill-loader` skill to determine which language and domain skills to read based on affected files, plus any skills explicitly named by the plan, and read their applicable references. Keep an execution-stage provenance record per the `## Provenance record` section of the `skill-loader` skill.
5. Inspect referenced tickets, PRs, reviews, or discussion threads. If recent actionable feedback is missing from the plan, stop and ask whether to update it.
6. Re-check the plan or trivial prompt against the current codebase, repository instructions, loaded skills, and operational requirements (logs, metrics, traces, alerts, dashboards, runbooks, rollout, rollback, and ownership).
7. For plan-based execution, verify the worktree starts with committed `plans/<ticket-or-feature>/plan.md` (and sibling `design.md` when expected). If lifecycle docs are uncommitted or untracked, recover only when the sole uncommitted changes are expected lifecycle artifacts under `plans/<ticket-or-feature>/`, committing `design.md` first and `plan.md` second.
8. Stop and ask if any uncommitted changes remain after recovery, or if concerns, blockers, or ambiguities exist before modifying files.
9. **Execute —** Execute tasks in order (the first slice with incomplete tasks for a grouped plan, or the single approved change for bare-prompt trivial work).
10. For each task, update plan checkboxes as work progresses, run the specified verification, and mark steps complete only after verification passes. For plan-based work, maintain an `### Execution` subsection under `## Skills loaded and used`, preserving the planning record; if no execution skill was needed, record that explicitly. For trivial bare prompts, track progress and skill provenance in chat.
11. Complete the plan's documentation and future-agent guidance task, including every required `AGENTS.md` inspection (or decide whether docs are unnecessary for trivial bare prompts).
12. **Prepare verification handoff —** Run the final implementation-evidence commands, inspect `git status`, and confirm plan fidelity (every task in the current execution unit is complete, requirements and operational checks match the plan's risk level, no unapproved scope added, and deviations documented in the plan ledger).
13. In direct mode, optionally suggest `/simplify`; orchestration runs simplify and fresh verify. Do not run simplify automatically in direct mode.
14. Report the exact handoff phrase below.

The terminal state is implemented, verified changes with the plan updated as the progress ledger when a plan exists.

## Task Rules
1. Mark the current task or step as in progress in the plan file.
2. Before implementing the task, check whether the intended work is already present. If it is, verify it satisfies the task, mark it complete, and do not reimplement.
3. Read referenced patterns and files.
4. Find existing tests for affected behavior.
5. Perform only the current step.
6. Run the specified verification, or explain why an equivalent command is required before running it.
7. Mark the step complete only after verification passes.
8. If verification fails, debug only within the current step and plan scope. Stop after 3 focused attempts on the same failure.
9. Commit only when the plan says to commit. Use the exact commit message unless it no longer matches the change; if it does not match, stop and ask. If the plan leaves commit boundaries ambiguous, commit only when a logical unit is complete, tests pass, and the message would describe a complete valuable change. If unsure, stop and ask.

Do not disable a required check, weaken an agreed expectation, or change a tolerance merely to obtain a pass. If an expectation is wrong, stop and return to `/plan` for approval before changing it. Prompts and skills are advisory; CI, permissions, and required reviews provide enforcement.

Do not batch unrelated tasks or skip narrow tests because later tasks run broader ones. Do not batch all tests ahead of implementation or all implementation ahead of verification unless the plan explicitly requires that shape.

Keep tests on observable behavior through public or supported interfaces. Mock system boundaries (external APIs, time, randomness, databases, filesystems) when needed; do not mock internal collaborators unless the repository already treats that seam as public.

## Test Discovery
Before behavior changes, inspect tests named in the plan, nearby tests, importers, and integration/end-to-end suites. Add, update, or remove tests with the behavior; justify omissions. Cover distinct contracts and applicable happy, edge, failure, and integration paths without multiplying independent dimensions or repeating expensive scenarios (helper reuse alone does not prove nonredundancy). If missing coverage expands scope, stop and ask.

## Integration and operational evidence
For integration, reliability, performance, or cost checks, use the plan's comparable baseline and candidate workloads where applicable. Confirm isolation of mutable state, queues, background jobs, and downstream effects before exercising the candidate. Record mock limitations; mocked behavior alone cannot establish that a real integration works.

Query telemetry using the plan's selectors and observation window, and record the workload, candidate configuration, queries, and observed results separately from the interpretation. Insufficient traffic or telemetry makes the result inconclusive and cannot satisfy a required check; an empty error query alone is not evidence of success. If required isolation is missing, stop rather than run the experiment.

## System-Wide Check
Before marking a behavior task complete, check what else runs (callbacks, reconcilers, hooks, middleware, jobs, controllers, generated code), whether alternate entrypoints behave consistently, whether partial failure can leave durable state inconsistent, whether retry/idempotency/timeout strategies align across layers, and whether tests exercise the real integration path where needed. Skip only for leaf-node changes with no behavioral or integration impact.

## Stop Conditions
Stop and ask when the plan has gaps, conflicts with repository guidance or a loaded skill, requires an unavailable skill or missing dependency/credential/service/generated artifact, differs materially from the current codebase, or needs a scope, behavior, API, schema, rollout, or rollback change beyond the committed plan. Return to plan review after the blocker is resolved or the user approves a plan change.

## Plan Updates
Use the plan file as the progress ledger:

- update checkboxes for completed work
- add short notes for deviations, failed verifications, equivalent commands, and refactors made after green
- maintain `### Execution` under `## Skills loaded and used` as stage metadata; this ledger update is not a plan scope change
- do not rewrite the committed plan unless the user approves a plan change
- when implementation reveals a wrong turn or disproves a plan assumption, record a learning candidate with the `learning-candidates` skill

For bare-prompt trivial work, report progress in chat and do not create a plan ledger.

## Handoff
After the unit is complete, evidence passes, and `git status` is checked, summarize changed files, commands and outcomes, skills with source, loading reason, and effect on execution, plus follow-ups. Do not claim independent verification.

In orchestrated mode, submit the structured result. In direct mode, name the implementation model and stable provider-qualified ID from `## Current Model`; if absent, say so without guessing.

Implementation model: `<name> (<provider-qualified-id>)`

In direct mode, emit an optional `/simplify` handoff: `/simplify <absolute-plan-path> --implemented-by <id>` or planless `/simplify --implemented-by <id> --task <quoted-original-request>`. If skipped, select another model with `/model`, start `/new`, confirm `## Current Model`, then run `/verify <absolute-plan-path> --implemented-by <id>` or planless `/verify --implemented-by <id> --task <quoted-original-request>`.

If simplify runs, follow its verify handoff with both writer IDs. Preserve the original plan path or exact original task; pass a task as one native Pi argument, single-quoted, and replace each embedded apostrophe with `'"'"'`; quote paths with whitespace. Do not backslash-escape quotes. If the requirements source or writer ID is missing, ask; do not guess. `/verify` collects fresh evidence. Do not ask it to commit, apply, repair, or reuse this execution evidence.
