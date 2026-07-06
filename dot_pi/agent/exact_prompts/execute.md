---
description: Execute a committed implementation plan with review checkpoints
argument-hint: "<path-to-plan.md | trivial work prompt> [extra instructions]"
---
# Execute
Execution input:

> $ARGUMENTS

Execute a committed implementation plan. For trivial low-risk work, `/execute` may also execute directly from a bare prompt after complexity triage.

Use the `resolve-worktree` skill to resolve plan paths with `$GLOB = **/plans/*/plan.md`. Switch context to the owning worktree before reading repository files or modifying code. The recursive glob matches plans nested under monorepo package paths (e.g. `domains/compute/apps/<app>/plans/<ticket>/plan.md`), not only repository-root `plans/`.

Brainstorming answers what problem to solve. Planning answers how to implement it. Execution makes the approved change.

<HARD-GATE>
Do not start implementation on `main` or `master` without explicit user consent. Do not skip the initial plan or prompt review. Do not continue past blockers, unclear instructions, scope changes, or repeated verification failures; stop and ask.
</HARD-GATE>

## Input Handling
If the first argument resolves to a plan path, follow the normal plan workflow.

If invoked with a bare prompt instead of a plan path, classify complexity before editing:

- **Trivial:** 1-2 files, no behavioral change, low risk, clear validation. Examples: typo fixes, comments, formatting, one-file non-behavioral config, or clearly mechanical updates. Proceed directly after checking branch/status and relevant files.
- **Non-trivial:** behavior, APIs, data, infrastructure, permissions, generated artifacts, rollout, multiple files, unclear validation, or meaningful review risk. Stop and ask the user to run `/plan` first.

Bare-prompt execution must not become planning inside `/execute`. If you need to invent scope, success criteria, rollout, test strategy, or behavior, stop and ask for `/brainstorm` or `/plan`.

## Worktree Policy
Prefer feature worktrees for implementation.

- If a plan path resolves to a worktree, switch to that worktree and continue there.
- If already in the correct feature worktree, continue there.
- If in a base checkout on `main` or `master`, create or switch to a feature worktree before implementation unless the user explicitly asks not to.
- For Datadog repositories, use `~/dd/.worktrees/<repo-name>-<branch-slug>` unless repository guidance says otherwise.
- Stop and ask if the branch, base branch, or worktree location is ambiguous.

## Posture
Treat the plan as a decision artifact, not an unquestionable script. Follow its scope, requirements, references, and non-goals. Do not blindly follow stale file paths or commands if the current repository contradicts them.

Keep changes surgical. Every changed line must map to a plan step, trivial bare prompt, or explicit user instruction.

Use boring technology and existing repository patterns. Reuse existing libraries, services, CLIs, controllers, APIs, and platform primitives. Do not reimplement the wheel without an explicit plan decision.

For testable behavior, default to red-green-refactor: write or run the focused failing test first, implement only enough for the current behavior, run narrow verification, refactor only after green, then rerun verification.

Do not leave the work 80% done. Complete the current approved slice, including tests, docs impact, verification, and PR readiness, or stop with a clear blocker.

## Workflow
1. **Setup —** Resolve and read the plan completely, or classify the bare prompt as trivial before editing.
2. Satisfy the worktree policy before changing files.
3. **Review —** Inspect relevant guidance, git branch/status, files named by the plan or prompt, tests, build commands, package boundaries, and current repository state.
4. Load execution skills before editing. Read skills named by the plan, infer skills from affected files, and prefer specific skills over general ones.
5. Inspect referenced tickets, PRs, reviews, or discussion threads. If recent actionable feedback is missing from the plan, stop and ask whether to update it.
6. Review the plan or trivial prompt before implementation. `/systematic-review` is the authoritative plan-validation gate; here, re-check at the depth the change needs:
   - Are files, commands, types, functions, tests, and dependencies present and consistent?
   - Does the plan or prompt match the current codebase?
   - Do repository instructions or loaded skills conflict with the plan or prompt?
   - Is the branch safe for implementation?
   - Are there blockers, risky assumptions, or ambiguities?
   - What scope boundaries, non-goals, implementation-time unknowns, execution notes, requirements traceability, references, or patterns must guide execution?
   - What operational requirements apply: logs, metrics, traces, alerts, dashboards, runbooks, rollout, rollback, and ownership?
7. For plan-based execution, verify the worktree starts with committed lifecycle docs:
   - `plans/<ticket-or-feature>/plan.md` exists and is committed.
   - If a sibling `design.md` exists, it is committed, ideally in a separate commit.
   - For plan-based work that came from `/brainstorm`, expect a sibling `design.md`; if it is missing, continue only when the plan clearly documents that the work was intentionally lightweight or started directly from `/plan`.
8. If lifecycle docs are uncommitted or untracked, recover only when all of these are true: the only uncommitted changes are under `plans/<ticket-or-feature>/`, the files are present, and the docs are new or modified only as expected lifecycle artifacts. Commit the design first when present, then the plan, staging only the relevant file per commit. If recovery cannot safely create separate commits, stop and ask.
9. Stop and ask if there are any uncommitted changes after recovery. The plan ledger starts committed; execution may update it once work begins.
10. Report any concerns and ask for direction before modifying files unless the work is clearly trivial and unambiguous.
11. **Execute —** Execute tasks in order. For bare-prompt trivial work, execute the single approved change.
12. For each task, update plan checkboxes as work progresses, run the specified verification, and mark steps complete only after verification passes. For trivial bare prompts, track progress in chat instead of a plan file.
13. Complete the plan's documentation and future-agent guidance task, including every required `AGENTS.md` inspection. For trivial bare prompts, explicitly decide whether docs are unnecessary.
14. **Verify and hand off —** Run the final verification commands and inspect `git status`.
15. Review plan fidelity: all tasks complete, requirements met, no unapproved scope added, and deviations documented in the plan ledger.
16. Before opening a PR, evaluate the completed work against the stack-split signals from the `reviewable-pr-workflow` skill:
   - Strong signals: 2+ distinct subsystems that could ship independently; more than ~400 net lines of non-generated, non-test code; more than ~15 non-generated files.
   - Soft signals: reviewer guide would need more than five topics; commits fall into independent groups; branch mixes refactor, feature, and behavior change.
   If any strong signal trips, or two or more soft signals trip, **stop and propose a stack plan** (one row per branch in dependency order) and ask whether to split before opening any PR. Do not proceed past this point until the user responds.
   If no split is needed, use `/pr-create --draft` to open a draft PR unless the user explicitly says not to.
17. Optionally suggest `/simplify` for a behavior-preserving cleanup pass over the diff before review. This is opt-in; do not run it automatically.
18. Report the exact handoff phrase below.

The terminal state is implemented, verified changes with the plan updated as the progress ledger when a plan exists.

## Task Rules
1. Mark the current task or step as in progress in the plan file.
2. Before implementing the task, check whether the intended work is already present. If it is, verify it satisfies the task, mark it complete, and do not reimplement.
3. Read referenced patterns and files.
4. Find existing tests for affected behavior.
5. Perform only the current step.
6. Run the specified verification, or explain why an equivalent command is required before running it.
7. Mark the step complete only after verification passes.
8. If verification fails, debug only within the current step and plan scope.
9. Commit only when the plan says to commit. Use the exact commit message unless it no longer matches the change; if it does not match, stop and ask. If the plan leaves commit boundaries ambiguous, commit only when a logical unit is complete, tests pass, and the message would describe a complete valuable change. If unsure, stop and ask.

Do not batch unrelated tasks or skip narrow tests because later tasks run broader ones. Do not batch all tests ahead of implementation or all implementation ahead of verification unless the plan explicitly requires that shape.

Keep tests on observable behavior through public or supported interfaces. Mock system boundaries (external APIs, time, randomness, databases, filesystems) when needed; do not mock internal collaborators unless the repository already treats that seam as public.

## Test Discovery
Before changing behavior-bearing code, find existing tests for the affected files or public interfaces.

Start with tests named in the plan, then search for:

- nearby test files
- tests importing or referencing the affected package/module
- tests sharing implementation file names
- integration or end-to-end tests for the public behavior

When changing behavior:

- add tests for new behavior
- update tests for changed behavior
- remove or update tests for deleted behavior
- justify explicitly if no tests are added

Before writing tests, check whether the plan's test scenarios cover applicable happy paths, edge cases, failure paths, and integration paths. If coverage is missing but clearly required by the current task, add it within scope. If adding it changes scope, stop and ask.

## System-Wide Check
Before marking a behavior task complete, ask:

- What else runs when this change runs: callbacks, reconcilers, hooks, middleware, jobs, event handlers, generated code, or controllers?
- Are there alternate entrypoints or APIs that should behave consistently?
- Can partial failure leave durable state inconsistent?
- Are retry, idempotency, timeout, and error-handling strategies aligned across layers?
- Do tests exercise the real integration path where needed, not only mocked internals?

Skip only for leaf-node changes with no behavioral or integration impact.

## Operational Completion Check
Before final verification, confirm:

- The implementation follows existing patterns and avoids unnecessary new technology.
- The implementation reuses existing platform capabilities instead of reimplementing them.
- Logs, metrics, traces, alerts, dashboards, and runbooks match the plan's risk level, or the absence is justified.
- Rollout and rollback are understood.
- Ownership is clear.
- The owning team would be comfortable being paged for the new or changed component.

If any answer is no, stop and ask whether to update the plan or make an additional scoped change.

## Stop Conditions
Stop and ask when:

- bare-prompt execution is non-trivial and needs `/plan`
- the completed implementation triggers a strong or two-soft stack-split signal (see workflow step 16) and the user has not approved a split or single-PR decision
- the branch is `main` or `master` without explicit user approval
- lifecycle docs cannot be committed or recovered safely before implementation begins
- there are uncommitted changes after lifecycle doc recovery
- the plan has gaps that prevent safe execution
- a plan instruction conflicts with repository guidance or a loaded skill
- an instruction is unclear
- a required dependency, credential, service, or generated artifact is missing
- verification fails repeatedly after focused debugging
- implementation needs a scope, behavior, API, schema, rollout, or rollback change beyond the committed plan
- the plan requires an unavailable skill
- the current codebase materially differs from the plan assumptions
- a loaded skill shows the planned approach is unsafe or non-idiomatic

Return to plan review after the blocker is resolved or the user approves a plan change.

## Plan Updates
Use the plan file as the progress ledger:

- update checkboxes for completed work
- add short notes for deviations, failed verifications, equivalent commands, and refactors made after green
- do not rewrite the committed plan unless the user approves a plan change

For bare-prompt trivial work, report progress in chat and do not create a plan ledger.

## Handoff
After all tasks are complete, verification passes, `git status` has been inspected, and the draft PR is opened, summarize changed files, verification commands, and follow-up items. Then say exactly:

> I finished implementing the plan

For trivial bare-prompt work without a PR, summarize changed files, verification commands, and follow-up items, then say:

> I finished the requested change
