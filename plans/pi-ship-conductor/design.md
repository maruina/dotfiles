# Pi lifecycle coordinator design
## Status and approval
Approved through `/brainstorm`. Design only; implementation is not authorized by this document.

This design supersedes the two-stage `/ship` design in this file. The user approved `/implement <plan-path>`, an extension-controlled coordinator, three model selections, one execute → simplify → verify round, approvals in the coordinating session, and structured stage outcomes. The user also approved replacing the existing `/ship` work rather than maintaining two coordinators.

Amendment (approved by the user after Task 4): `/implement` repeats the execute → simplify → verify round for each remaining plan slice, in order, until the plan is complete or a round does not end in `VERIFIED`. The user also approved that `/implement` does not run `/systematic-review` or a final whole-feature simplification. The `### Slice loop` section defines this behavior. It replaces the earlier single-round boundary wherever the two conflict.

The sibling `plan.md` describes the superseded implementation. Its completed tasks remain historical evidence, not an implementation plan for this design. Run `/plan` against this design before further execution. In particular, do not follow its prohibition on template changes, fixed model pools, or prose-marker completion contract.

## Alignment brief
### Problem and audience
Matteo uses Pi lifecycle templates to execute approved plans, optionally simplify the result, and independently verify the candidate. Manual handoffs can lose the original requirements and the identities of models that changed the candidate. Fresh stage contexts also need explicit approval routing and completion signals.

### Goal
One `/implement <plan-path>` invocation selects models once and runs each remaining execution unit through execute, simplify, and verify, one unit after another. Each stage has a fresh context. The coordinating session displays progress, asks approval questions, and reports the result. Repairs remain manual.

### Non-goals
- Automatic repair or lifecycle-stage retry loops. A blocked round is never retried, and the loop never skips a blocked slice.
- Running `/systematic-review` or a final whole-feature `/simplify` inside `/implement`.
- A fourth model-driven coordinator or a second simplification agent.
- A general-purpose agent framework, agent discovery system, or parallel stage execution.
- Planless orchestration, saved model presets, or resuming orchestration after a coordinator restart.
- A `/ship` compatibility alias or two maintained coordinator implementations.
- Treating prompt instructions or tool annotations as a security sandbox.

### Confirmed decisions
- Replace the existing `/ship` coordinator contract with `/implement`; reuse suitable code and tests.
- Keep direct `/execute`, `/simplify`, and `/verify` invocations and the execute → verify path.
- Invoking `/implement` is explicit opt-in to simplification, not approval of later scope decisions.
- Execute and simplify may share a model. The selected verifier differs from both selected writer models, even if simplification later makes no changes.
- Route approval requests to the user in the coordinating session. The extension never answers for the user.
- Start the next slice only after the current round ends in `VERIFIED`. Stop after the last slice, or earlier on a blocker, process/protocol failure, `BLOCKED` verdict, or cancellation.
- Continue to the next slice without an extra confirmation dialog. Ctrl-C cancels the run.

## Context reviewed and evidence
### Repository baseline
Discovery of the requested templates used `main` at `b346344d8e50b40dfa056e2bbddf9262bf010a60`. Existing coordinator discovery used `maruina/pi-ship-conductor` at `1028ded`. The existing feature worktree is `/Users/matteo.ruina/.worktrees/dotfiles-pi-ship-conductor`.

Relevant sources:
- `dot_pi/agent/exact_prompts/execute.md`: plan and trivial-prompt input, committed lifecycle documents, approval gates, execution slices, draft PR preparation, and model-bearing verification handoff.
- `dot_pi/agent/exact_prompts/simplify.md`: behavior preservation, test prerequisites, target resolution, clean-start commit policy, push policy, and requirements-source discovery.
- `dot_pi/agent/exact_prompts/verify.md`: requirements baseline, fresh evidence, different-model semantic review, read-only checks, candidate snapshots, and `VERIFIED`/`BLOCKED` verdicts.
- Existing `dot_pi/agent/exact_extensions/ship-conductor/index.ts`, `_conductor.ts`, `_spawn.ts`, `_prompts.ts`, and associated tests: two-stage execution, fixed pools, one-shot JSON subprocesses, handoff-marker parsing, and injected test seams.
- Root `AGENTS.md` and Pi-specific guidance: source-only chezmoi edits, feature worktrees, template ownership of lifecycle policy, and extension placement and validation conventions.

The feature branch contains older lifecycle guidance and an older implementation plan. Planning must reconcile the replacement with the main-branch baseline; this brainstorm does not merge, rebase, or change implementation files.

### Native Pi evidence
Reviewed installed Pi 1.5.0 material under `@earendil-works/pi-coding-agent`:
- `docs/sdk.md`: explicit model and session configuration, native template expansion through `prompt()`, events, disposal, and SDK-specific MCP setup.
- `docs/extensions.md`: session replacement lifecycle, stale-context restrictions, command/template dispatch precedence, and UI modes.
- `docs/cli-integration.md`: one-shot JSON versus bidirectional RPC, and the distinction between prompt acceptance and completion.
- `docs/rpc-extension-ui.md`: blocking dialogs and correlated `extension_ui_response` messages.
- `docs/prompt-templates.md`: shell-like argument quoting and command-name shadowing.
- `examples/extensions/subagent/README.md` and the dispatch implementation in `index.ts`: subprocess isolation, explicit models, progress, and cancellation. Its generic agent chains are not lifecycle policy.
- `examples/rpc-client.ts`, `examples/rpc-extension-ui.ts`, and `dist/modes/rpc/rpc-client.d.ts`: exported client operations and the separate UI protocol example.
- `docs/json.md`: `tool_execution_end` carries structured tool results; `agent_settled` identifies completion of automatic work, unlike a low-level `agent_end`.

The exported `RpcClient` has model, prompt, state, and abort operations but no public UI-response operation. Do not assume it forwards approval dialogs. A small adapter over native RPC, based on the shipped UI protocol example, is required unless a supported interface is verified during planning.

### Advisory learning lookup
The Obsidian learning lookup returned no matching sections for Pi, lifecycle, subagent, and provenance. No advisory guidance was used. Runtime integration has not been prototyped; source inspection establishes available mechanisms, not end-to-end success.

## Smallest user-feedback slice
Implement plan-backed `/implement` with interactive model selection, sequential fresh RPC sessions, structured approvals and outcomes, clean simplification transitions, and a final report.

The user sees the selected models, stage progress, approval questions, and a final summary with a PR link when available. This establishes whether native RPC can preserve the actual approval and commit workflow without duplicating lifecycle policy.

A template-only change is smaller and useful for manual work, but cannot validate the selected experience: isolated child sessions with interaction in the coordinator. A two-stage coordinator already exists; building another two-stage skeleton would not resolve the missing simplification and approval behavior.

Defer automatic repair, restart recovery, planless orchestration, model presets, and aliases. Revisit only after the slice-loop workflow has passed live validation and the user requests additional scope.

## Design overview
### Ownership boundary
The extension owns model selection, stage transport, progress, user interaction, run records, and transition checks. Templates own lifecycle requirements, review depth, test selection, commit policy, approval gates, slice boundaries, and stop conditions.

The coordinator must not decide whether a code change is correct or whether a human gate can be skipped. It must not repair, commit, push, or open a PR itself. Stage agents can perform operations authorized by their templates; verification cannot perform repairs.

### Command contract and preflight
`/implement <plan-path>` accepts exactly one required plan path, with normal quoting for spaces. It does not shadow `/execute`, `/simplify`, or `/verify`.

Before a writer starts:
1. Resolve the absolute committed plan path and its owning feature worktree. Refuse missing or ambiguous targets and unsafe branches.
2. Resolve the approved execution unit from the plan. For grouped plans, select only the eligible current slice. Unresolved prerequisites stop the run.
3. Confirm a clean candidate worktree and committed lifecycle documents. Leave recovery of unexpected state to the user or direct lifecycle commands; do not invent commits.
4. Confirm the required templates and stage bridge are loadable, with no command shadowing.
5. Ask for execution, simplification, and verification models from the configured registry. Validate model identities and required authentication configuration. Registry presence cannot guarantee a later provider request will succeed.
6. Acquire exclusive coordinator ownership for the selected worktree before dispatch. Recheck relevant state after acquisition.

Unavailable models, missing provenance, or invalid selections stop before execution. Never substitute another model silently. Record configured and observed model identities, including provider identity; use stable model IDs for manual handoffs and check known equivalent identities conservatively. Unknown provider aliases cannot establish independence between underlying model services.

### Sequential stage execution
Start one RPC child for execute, then one for simplify, then one for verify. Each child starts with fresh conversation history and the correct worktree as its working directory. Retain normal configured extensions, skills, and MCP capabilities required by the task; do not use blanket extension disabling that breaks model access or required tools.

Dispatch the existing stage command through Pi's native template expansion. Resolve commands to the intended templates and fail on shadowing or unavailable templates rather than silently invoking another command. Do not maintain a parallel copy of template text or lifecycle rules in the extension.

Each child receives only durable references, approved user decisions relevant to its stage, and stage metadata. No previous conversation transcript is copied. The verifier receives requirements and candidate references plus provenance, not the execute or simplify narrative as evidence.

Each round has one fixed execution unit. Simplification is limited to that unit and its immediate context; the branch diff is inspection context, not authorization to modify previous or future slices. If the allowed scope cannot be determined, stop instead of selecting a convenient diff base.

### Structured stage bridge
Expose two narrow capabilities only in orchestrated children:
- Request a user decision, with the stage, question, relevant evidence or proposal, and decision context.
- Submit a final lifecycle outcome with a versioned schema.

Templates conditionally use these capabilities when orchestrated. Direct invocation retains ordinary conversational approvals and manual handoffs. The bridge routes signals; it does not duplicate simplify rules, acceptance criteria, or code-review policy.

Approval requests use Pi's RPC UI request/response mechanism. The coordinator displays the complete decision context, waits for the user, and returns the correlated answer to the requesting child. Rejected approval is not success; the stage must stop or take only the explicitly authorized path. Dismissing an approval dialog cancels the run. A missing decision response never implies approval. Scope or requirements changes that require `/plan` remain blockers, not inline permission to rewrite the baseline.

Final results include run and stage identity, schema version, lifecycle outcome, candidate reference, change/no-change classification when applicable, report reference, and PR/commit references when applicable. The bridge derives observed model and Git identity from runtime state rather than accepting arbitrary identity assertions from the model.

Results are transported through structured tool results or an equivalent supported typed RPC mechanism. Do not parse verdict prose, completion markers, or persisted session logs to drive transitions. Reports remain readable to the user but are not the control protocol.

A schema-valid result is an agent assertion, not proof of correctness. Template compliance and independent verification remain necessary.

### Completion and failure states
Track lifecycle outcome separately from transport state:

| State | Meaning | Action |
|---|---|---|
| Running | Stage has active work | Show progress; do not start another stage |
| Waiting for user | A correlated decision is outstanding | Relay the request; keep the stage paused |
| Success | Valid final result and transition checks passed | Advance to the next stage, or finish |
| Blocked | A lifecycle prerequisite or verification criterion is unmet | Stop and report the blocker |
| Process/protocol failure | Crash, provider error, invalid/missing result, contradictory results, or failed transport | Stop and show bounded diagnostics |
| Cancelled | User cancellation or aborted stage | Stop all progression and report retained state |

Wait for `agent_settled`, not merely prompt acceptance or `agent_end`. Successful process exit is insufficient. Require an unambiguous valid final result, no pending approval, no error or cancellation, and applicable state checks. Revalidate the candidate at the transition; a result submitted before later repository changes cannot authorize the next stage. A run that settles without a result is a protocol failure, not inferred success.

Native provider retries may still occur inside a stage. They do not authorize restarting a lifecycle stage, repairing findings, or advancing while the run remains unsettled.

### Run record and requirements baseline
Keep a small versioned run record outside the candidate worktree in Pi's local state area. It contains:
- Run ID, coordinating session, stage session references, and template identities.
- Absolute worktree and plan paths, branch, starting HEAD, requirements revision, relevant design reference, and selected execution unit.
- Requested and observed models, final candidate commits, stage outcomes, decision records, and report references.
- PR URL when available and verification-attempt count.

Write updates atomically. Bound retained progress, diagnostics, and record storage; choose explicit limits during planning. Do not build a transcript database. Local session/report files support manual investigation, not automated log scraping or restart recovery.

Pin the original requirements reference even though execution and simplification update the plan ledger. Ledger progress does not authorize changing scope or acceptance criteria. Record approved decisions without replacing the requirements baseline with a stage summary.

### Simplification and commit handling
Require a clean worktree before starting orchestrated simplification. `/simplify` itself selects and performs the behavior-preserving changes, runs the required before/after checks, updates the plan ledger when required, commits, and follows its existing push policy.

Before verification:
- A changed simplification must have a successful commit and no remaining candidate worktree changes.
- A no-change simplification succeeds with an unchanged candidate; no empty commit or artificial ledger commit is required.
- Commit failure, required push failure, or unexplained remaining changes stops progression. Report any commit already made; do not roll it back.
- The coordinator does not commit on the stage's behalf or weaken tests to obtain success.

Run fresh verification after a no-change simplification too: execution has not yet received independent closeout verification. Direct `/simplify` may retain its existing statement that an earlier verdict remains valid when the candidate is unchanged; this does not skip verification in `/implement`.

### Manual template handoffs
Update the templates without requiring orchestration:
- `/execute` preserves its direct `/verify` handoff and adds an optional `/simplify` handoff containing the absolute plan path and execution model ID.
- `/simplify` accepts and retains the execution model ID, records its own model ID, and emits `/verify` metadata containing both. Strip metadata before positional target resolution; preserve `--base` behavior.
- Retain `--implemented-by` for existing execute → verify callers. Add explicit simplification provenance, such as `--simplified-by`, rather than overwriting the implementer's identity. Final syntax and quoting are tested in planning and implementation.
- `/verify` rejects matching writer/verifier identities and missing provenance required by the selected path. A simplify handoff cannot silently omit known execution provenance.
- For supported direct planless work, preserve the exact original task as a quoted requirement argument through simplify and verify. Do not reconstruct intent from the diff or a later summary. Ask for missing task or provenance instead of inventing it.

Direct simplify targets such as files, directories, and PRs remain supported. Missing history may require a user-supplied baseline or model identity before an independent verification handoff can be issued.

### Verification independence
Accept either a fresh manual `/new` session or a newly created orchestration verification session with no preceding stage transcript. A linked session reference does not authorize copying history.

Keep `/verify` read-only. It independently reads the baseline, resolves the complete candidate, gathers fresh deterministic evidence, performs semantic review under the distinct model, and compares before/after state. Previous execution output, plan checkboxes, and simplification test reports are not fresh verification evidence.

A verifier result is `VERIFIED` or `BLOCKED`. A process failure or cancellation before a verdict is reported separately. Repairs require manual execution and a completely new verification run.

### Slice loop
The lifecycle order is `/brainstorm` → `/plan` → `/systematic-review <plan>` → `/implement <plan>`. `/systematic-review` reviews the plan before execution, and its fixes require user confirmation, so it stays outside `/implement`.

Inside `/implement`, the coordinator runs one round per execution unit:
1. Select the first slice with incomplete tasks, as `/execute` does. An ungrouped plan has one unit, so the run has one round.
2. Record the current HEAD as the unit base commit, then run execute, simplify, and verify for that unit.
3. When verify returns `VERIFIED`, read the plan again. Continue only when the plan task and slice structure still match the pinned plan, only the finished unit's checkboxes changed, and the newly selected unit is the next slice in plan order. Otherwise, stop as blocked.
4. When no incomplete slice remains, finish the run as verified.

All rounds use the same three models, the same pinned plan and design blobs, and the same worktree ownership. Each stage contract names both the pinned baseline commit (the run start) and the unit base commit (the round start). Execute and simplify use the unit base commit to limit their scope. Verify uses the unit base commit for the slice diff and the pinned baseline commit to reconstruct the cumulative state for the plan's `Final verification` item on the final slice.

The coordinator does not run a final whole-feature simplification. Such a pass would edit slices that already have a `VERIFIED` verdict, so those verdicts would become invalid and another full verification would be necessary. The final report names cross-slice simplification opportunities that simplify stages reported, and the user can run `/simplify <plan> --base <feature-base>` and a fresh `/verify` manually.

Bound one run to at most 20 rounds. Keep progress entries only for the active round; a completed round keeps its stage outcomes, report references, and commits.

### Concurrency and cancellation
Use exclusive ownership keyed by the canonical selected worktree. A second orchestration run must not start writers there. The coordinating session must not perform repository work while the child owns the worktree. This is a cooperative ownership rule, not protection from other editors or arbitrary processes.

On cancellation, stop dispatch, abort the active child, terminate it if graceful shutdown does not complete within a bounded grace period, and confirm termination before releasing ownership. Never release ownership solely because a signal was sent. Do not reset, discard changes, or undo commits. Report retained repository state and manual recovery instructions.

Unexpected external changes stop progression. Do not automatically take over a stale ownership record after a crash; require investigation before another writer starts.

### Final report
Report the overall outcome, per-stage state and model, selected execution unit, candidate and simplification commits, approval decisions, concise changes/findings, and the PR link when available. Absence of a PR is explicit, not replaced with an invented URL.

Report the completed, current, and remaining slices. Show verification attempts per round as zero or one and blocked verification verdicts per round as zero or one; at most one round can have a blocked verdict, because the run stops after it. Process failures before a verdict are separate from verification blockers. Link durable reports and provide the existing manual lifecycle follow-up when blocked. Do not imply that verified work was merged, deployed, or repaired.

## Reuse and alternatives
| Approach | Coverage and merit | Safety, delivery, cost, and validation | Decision |
|---|---|---|---|
| Keep existing two-stage `/ship` | Already has worktree resolution, test seams, model separation, and process helpers | Lowest implementation cost, but fixed pools, no simplify, no approval round-trip, and prose parsing miss approved requirements | Superseded; reuse suitable helpers and tests |
| Template-only changes | Improves manual provenance with little runtime machinery | Smallest delivery surface and easy handoff tests; no coordinated interaction | Included as required template support, not a substitute coordinator |
| Native session replacement | Full native interactive experience with little transport code | Replaces coordinator; extensions and captured contexts are torn down and must be rebound | Deferred; revisit if persistent coordinator is no longer required |
| In-process SDK sessions | Direct typed model/session control | More explicit CLI/MCP capability setup and UI binding; requires integration validation | Deferred; revisit if a supported host makes this simpler than RPC |
| One-shot JSON subprocesses | Existing implementation and shipped subagent pattern | Isolated and easy to dispatch, but no approval answer channel and insufficient lifecycle result contract | Replace transport rather than retain as another mode |
| RPC child sessions | Fresh context, models, progress, cancellation, and user interaction | Selected; adds a bounded adapter and stage protocol with live integration tests | Approved |

Reuse `_worktree.ts` and its tests only after checking them against the supported path and Git contracts. Reuse invocation resolution, dependency injection, and failure-test patterns where correct. Replace marker parsing, fixed pools, and one-shot transport; do not preserve them as parallel policies. Do not extend known cancellation or buffer behavior without validating process termination and bounds.

Accepted downside: the adapter and structured bridge require maintenance across Pi upgrades. This is narrower than an agent framework and avoids a fourth model's cost and judgment. No claim is made that RPC startup or provider latency is negligible.

## Risks, operability, and security
- **Agent omits a structured signal:** stop as a protocol failure; expose the report instead of guessing.
- **Agent requests an approval only in prose:** it cannot authorize advancement. Require structured routing and test real approval behavior.
- **Model changes during a stage:** record observed identity and stop on unapproved changes; do not continue with stale provenance.
- **Dirty or partially committed simplification:** stop before verify and preserve evidence for manual repair.
- **Verification mutates the candidate:** block and report the delta. Prompt instructions are not a security boundary; arbitrary shell access is not sandboxed.
- **Unavailable tools, credentials, or provider:** report the failing prerequisite; do not install packages, refresh credentials, or change requirements automatically.
- **Protocol mismatch or unsupported RPC UI:** fail closed and identify the unsupported operation; no silent approval or default success.
- **Unbounded output or orphan processes:** bound buffers and diagnostics, unsubscribe listeners, stop children, and test shutdown escalation and failure paths.
- **Local privacy:** inherit existing authentication without logging credentials. Launch without shell interpolation. Use stdin RPC messages for task data. Keep local records private; store references rather than duplicate full logs or secrets. Treat child outputs as untrusted data.

Matteo owns this local development tool; no production pager is introduced. Observability consists of stage/model progress, waiting-for-user state, structured outcomes, report references, bounded errors, and a final summary. No new telemetry service or network dependency is required beyond Pi's existing integrations.

## Rollout and rollback
1. Refresh the sibling implementation plan against this design and the supported Pi version. Resolve older main/feature-branch differences before modifying implementation.
2. Replace the existing coordinator, not add a second one. Remove obsolete marker-coupling guidance as part of implementation, with matching tests.
3. Validate pure protocol/state tests, extension integration, template handoffs, and a live disposable-worktree run.
4. Preview and apply only the changed explicit chezmoi targets after implementation verification. Keep the design-only commit separate.

Rollback by reverting the replacement code/template changes and applying the reviewed explicit targets. First stop active orchestration. Keep run records for manual diagnosis; do not reset candidate worktrees. Direct lifecycle commands remain the fallback. The design artifact itself is not a rendered runtime target.

## Testing strategy and observable success
### Handoffs and models
- Execute emits working direct verify and optional simplify commands with an absolute plan path and stable identity.
- Simplify preserves execution identity and adds its own; no metadata is mistaken for a path or base flag.
- Quoted paths and the original planless task survive handoffs without summary-based replacement.
- Verify rejects either writer match, missing required provenance, unknown verifier identity, and unapproved runtime model changes.
- Equal execute/simplify selections work; unavailable selections do not silently fall back.

### Stage protocol and approvals
- Stage results arrive through typed structured data, not prose or session-log parsing.
- Process exit zero, prompt acceptance, and `agent_end` without valid settled completion do not advance.
- Missing, malformed, duplicate/conflicting, stale, and wrong-stage results stop safely.
- Approvals display their context in the coordinator; the answer returns only to the requesting child. Rejection, dismissal, and transport loss cannot authorize continuation.
- A scope-change blocker stays blocked even if the user supplies an answer that belongs in `/plan`.

### Git, slices, and simplification
- Committed clean execution can enter simplify; dirty state cannot.
- Changed simplify passes tests and commits; commit/push failure stops before verification.
- No-change simplify makes no empty commit and still enters fresh verification.
- Each round processes only its selected execution unit; prior and later slices are not simplified or executed in that round.
- A `VERIFIED` round starts the next slice; a non-verified round, a changed plan structure, or an out-of-order next unit stops the loop.
- The last `VERIFIED` round finishes the run; stage configurations and reports for different rounds do not collide.
- Verification snapshots detect tracked and untracked candidate mutation.

### Freshness, ownership, and cancellation
- Every stage has distinct fresh session history and the intended model/worktree.
- Verification receives durable references but no predecessor narrative; it executes fresh checks.
- A second coordinator cannot acquire the same worktree; the parent does not write concurrently.
- Cancellation before dispatch, during work, while waiting for approval, and between stages starts no later stage.
- Graceful abort, forced termination, crash, and stale ownership behavior preserve candidate state and do not release ownership before child termination.
- Progress buffers, diagnostic output, listeners, and record retention have explicit tested bounds.

### Validation layers
Use the existing injected-dependency test style for the state machine and fake RPC processes for transport and failure cases. Adapt useful existing tests rather than copying a second test suite. Test template contracts alongside coordinator behavior.

Run the repository-required focused tests, `npm test`, and `npm run test:all` after implementation. Follow the repository dependency-install and cleanup rules. No runtime tests are claimed for this design-only change.

A live smoke test must use a small committed plan in a disposable feature worktree, all three selected models, an actual approval request, a no-change or committed simplification, fresh verification, and cancellation validation. Mocked transport tests alone cannot establish success. If the live approval round-trip fails, the first slice is blocked; do not fall back to prose parsing.

## Open implementation details
No product decision blocks writing this approved design. Planning must specify exact schema/tool names, provenance flag parsing, supported Pi API calls, thinking-level handling, bounded storage and shutdown limits, and the ownership mechanism. These details must preserve the contracts above. Reopen alignment if evidence requires changing interaction, stage policy, verification independence, or the selected RPC approach.

## Skeptical review
The selected downside is maintenance of a small RPC adapter and explicit lifecycle protocol. Existing-code-only delivery has real merit, but its one-shot transport and prose parsing cannot meet approval routing and structured outcomes. Native replacement and SDK sessions remain useful alternatives, not features to combine into this slice.

Rejected findings:
- Keep `/ship` as a second coordinator or alias: adds an unrequested command contract; the user approved superseding it.
- Let coordinator create a missing simplification commit: violates template ownership and hides stage failure.
- Skip verification after no-change simplify: execution still requires independent closeout.
- Infer lifecycle success from exit code or final text: violates the outcome contract.
- Automatically repair a blocked verification: explicitly deferred by the user; repair remains manual.
- Run `/systematic-review` after the last slice: it would add a writer after the final verification, and `/verify` already performs the independent semantic review.
- Run a final whole-feature simplification: it can remove duplication across slices, but it invalidates every earlier `VERIFIED` verdict and needs another full verification.
- Claim a worktree lease or read-only prompt prevents arbitrary writes: unsupported security claim; ownership is cooperative and verification must detect state changes.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Lifecycle brainstorming | Selected relevant domain and workflow guidance |
| `learning-opportunities` | prompt-required | Brainstorm coaching | Clarified coordination and approval interaction before recommending mechanisms |
| `learning-lookup` | prompt-required | Advisory design lookup | Checked narrow lifecycle terms; recorded no matches |
| `obsidian-cli` | agent-selected | Required access to advisory learning source | Read learning content through Obsidian without modifying the vault |
| `codebase-research` | skill-loader | Existing behavior and unfamiliar extension area | Compared templates, native APIs, and existing coordinator implementation |
| `cli-best-practices` | skill-loader | Command inputs, interaction, and outcomes | Defined explicit input, structured signals, and failure behavior |
| `chezmoi` | skill-loader | Managed source repository | Kept changes in source and avoided broad target application |
| `write` | skill-loader | Design prose | Used precise claims, explicit uncertainty, and concise US English |
| `feature-worktree` | prompt-required | Durable design artifact | Located and reused the owning clean feature worktree; kept main unchanged |
| `diataxis` | skill-loader | Durable design explanation | Separated design rationale, contract reference, and validation strategy |
