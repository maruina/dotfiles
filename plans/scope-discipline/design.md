# Scope Discipline and Repeatable Slice Execution Design
## Status
Approved in brainstorming on 2026-09-19 with user confirmation of three points: the boundary is the smallest user-feedback slice, each slice ships in one or more pull requests with verification on that slice, and the final slice's verification also validates the whole feature. Amended on 2026-09-19 to make slicing conditional: Small/direct work keeps a single-slice lifecycle, and slice grouping applies only when a plan needs more than one shippable slice.
## Problem
The `brainstorm → plan → systematic-review → execute → verify` lifecycle lets scope grow around alternate designs. A design considers more than one shape, the shapes partially merge or are deferred, and the extra work re-enters during plan and review. Nothing names the smallest user-feedback slice as a boundary, so nothing can reject the extra scope.

Observed evidence:

- `plans/ai-review-gate/design.md` records that it was "Revised ... after three `/systematic-review` passes." A fourth revision moved the verdict engine from a bash script to the Go command `cmd/ai-review`. The design now marks its earlier tool references "superseded," and `plans/ai-review-gate/plan.md` is 62,584 bytes with 20 acceptance scenarios in 4 tasks. The scope grew through design and review passes.
- `plans/openclaw-media-capture/design.md` has five revision markers and two supersession markers.
- Across 13 new-style design and plan pairs, only 4 plans mention "smallest" or "first slice" anywhere, and none require it. Planning has no anchor to reject extra scope against.
- `dot_pi/agent/exact_prompts/brainstorm.md` requires every considered alternative to "name a genuine merit" but has no rule to select the design with the fastest user feedback and defer the rest.
- `dot_pi/agent/exact_prompts/systematic-review.md` checks that "the plan does not invent behavior beyond the source of truth." When the design itself is oversized, this check passes the creep through.
- The user reports that `/execute` rarely adds scope. The artifact review agrees: the growth concentrates at design, plan, and review.

Second gap: the lifecycle treats one plan as one execute and one verify. Re-entering for a deferred slice costs a full cycle, so bundling the slice into the current work is the rational local choice. Deferral is only cheap when a committed plan can be executed again, slice by slice.
## User and audience
The primary user is Matteo, running the Pi lifecycle prompts on real work. Future Pi sessions are the consumer: `/brainstorm`, `/plan`, `/systematic-review`, `/execute`, and `/verify` read these rules at invocation. The design must stand alone without this conversation.
## Goals
- Make the smallest user-feedback slice the binding boundary at design, plan, and review.
- Require a design to select one shape when alternatives exist, and to record every non-selected shape as a non-goal or a deferred item with a revisit trigger.
- Require every plan to name the smallest user-feedback slice and to push scope beyond it to a follow-up. When a plan has more than one shippable slice, the smallest slice is slice 1.
- Keep Small/direct work on a single-slice lifecycle: the boundary field applies, but slice grouping is optional and added only when needed.
- Make a multi-slice committed plan executable more than once: one `/execute` run completes the next incomplete slice, then stops for feedback.
- Make each slice shippable in one or more pull requests, with `/verify` run on the slice.
- For a multi-slice plan, require the final slice's `/verify` to also validate the whole feature against feature-level acceptance criteria carried by the plan.
- Keep prompt additions minimal and inside the existing context budgets.
## Non-goals
- Concurrent or parallel `/execute` runs on one plan. The shared worktree, branch, and ledger have no locking.
- New lifecycle stages, tools, or a slice registry. The plan is the ledger.
- Changes to the `/execute` branch-safety gate or the `/verify` model-separation and read-only contracts.
- Auto-merge or any change to `reviewable-pr-workflow` policy.
- A new deferred-work artifact. Reuse `Out of Scope` and the plan's slice list.
- Mandatory multi-slice plans. Small/direct work keeps the concise plan shape and one execution unit.
## Context reviewed
- `dot_pi/agent/exact_prompts/brainstorm.md`: the first-response format, the First slice section, the alignment brief, the design artifact contract, and the self-review rule for alternatives.
- `dot_pi/agent/exact_prompts/plan.md`: the planning alignment brief, the durable plan header, the task contract, the learning-candidate duty, and the final review checklist.
- `dot_pi/agent/exact_prompts/systematic-review.md`: the plan review checklist and the method.
- `dot_pi/agent/exact_prompts/execute.md`: input handling, the workflow, the plan-ledger duties, the stack-split check, and the stop conditions.
- `dot_pi/agent/exact_prompts/verify.md`: target resolution, risk classification, requirement traceability, and the final verdict.
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`: required markers and the byte budgets for `brainstorm.md` (14,000) and `plan.md` (18,000).
- `plans/learn-lifecycle-integration/design.md` and `plans/pi-lifecycle-model-recommender-pool/design.md`: repository design-document structure and depth.
- New-style design and plan pairs under `~/src/.worktrees/malazan.xyz/maruina-ai-review-gate/plans/` and `~/src/.worktrees/trygalle/maruina-pi-runtime-rpc/plans/`: alternative handling, revision counts, and plan sizes.
### Advisory learning lookup
Read the complete `Datadog/Learnings.md` through `obsidian-cli` on 2026-09-19 and piped it through `learn-evidence.mjs learning-sections` with terms `scope creep`, `smallest slice`, `vertical slice`, `feedback`, `incremental`, and `prompt`. One section matched, "Render piped chezmoi templates against an initialized config, not `--init`"; it concerns template rendering and does not apply to this design. No material guidance applied.
### Unavailable or deferred evidence
- No measurement exists of how often plans currently grow relative to their design. The revision markers and plan sizes are a sample, not a rate. Effectiveness is validated by observation over the next work cycles.
- No data exists on the right slice size. The design sets a rule, not a number.
## Current behavior
- `/brainstorm` produces a design with a First slice and an alternatives list. It requires each alternative's merit but does not require selecting one shape or deferring the rest.
- `/plan` proposes slices in the alignment brief, but the durable plan is a flat `### Task N` list with no durable slice grouping, so `/execute` cannot tell where a slice ends.
- `/systematic-review` reviews a plan against the design as the source of truth.
- `/execute` runs tasks in order, requires all tasks complete at the end, and hands off to `/verify` after a full run. It has no "run one slice, then stop" mode.
- `/verify` traces every acceptance scenario in the plan. A slice with later scenarios unimplemented cannot pass today.
## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| Growth concentrates at design, plan, and review, not execution | User observation plus the artifact review; `ai-review-gate` grew across review passes | Effort is spent on the wrong prompts | Observe the next few cycles for execute-stage scope additions |
| A plan is the right place for durable slice grouping | The plan is already the progress ledger and the source of truth for execution | A separate slice artifact would drift from the plan | First re-executed plan with two or more slices |
| An alternate design is the main re-entry path | `ai-review-gate` bash-to-Go revision; `openclaw-media-capture` supersessions | The selection rule misses the real path | Review the next design with alternatives for merged scope |
| Final whole-feature verification is reconstructable | Slices ship as ordered pull requests; the plan can record the feature base and slice order | The final verify cannot see earlier merged slices | First plan whose slices merge separately |
| Prompt additions change behavior | The existing gates already use binding fields and checklists | More prose without behavior change | Observe the next real cycle; iterate wording if needed |
| Additions fit the context budgets | `plan.md` is 16,650 of 18,000 bytes and `brainstorm.md` is 11,073 of 14,000 | A budget increase is needed | Run the marker tests and compare byte counts |
## Design overview
Five coordinated prompt mechanisms, all text changes in chezmoi-managed prompt files, plus test markers.
### 1. Boundary at design
`brainstorm.md` gains a selection rule and a required field.

- The alignment brief's `First slice:` becomes `Smallest user-feedback slice:` and must state what a user sees, what the team learns, and why no smaller slice produces that feedback.
- When more than one design or approach is viable, `/brainstorm` selects the one whose smallest slice produces user feedback fastest. Every non-selected design becomes a non-goal or a deferred item with a revisit trigger. Do not merge designs to satisfy more stakeholders.
- State the rule directly: a better long-term design is not a reason to widen the first slice.
- The design artifact contract requires the smallest user-feedback slice and the deferred alternatives.
- The design self-review checks that the first slice produces user feedback and that non-selected alternatives are deferred rather than merged.

The rationale is the user-supplied value statement: a smaller portion reaches users sooner; 80% of a feature often takes 20% of the time, so early integration tests whether the final 20% earns its cost; early release exposes wrong assumptions before heavy investment; and real usage produces feedback that internal testing cannot.
### 2. Boundary at plan
`plan.md` gains a required field. Multi-slice grouping is conditional.

- The planning alignment brief and the durable plan header gain `Smallest user-feedback slice:` for every plan.
- Slice grouping is added only when a plan needs more than one shippable slice: Medium or Large/Risky work, or work with deliberately deferred scope. Such a plan groups tasks under `### Slice N: <title>` headings, and each heading names the user feedback it delivers. Slice 1 is the smallest user-feedback slice.
- Small/direct work keeps the existing concise `## Scope` and `## Validation` shape with no slice headings. Such a plan has one slice by definition: its smallest user-feedback slice.
- When slice grouping exists, a task that does not serve the current slice is a follow-up, not plan scope. Deferred work appears under `Out of Scope` or as a later slice with a blocking edge.
- The existing requirement-to-task traceability is retained. When slices exist, each acceptance scenario maps to a slice through its task, which lets `/verify` select the scenarios for one slice and the full set for the final slice.
- A multi-slice plan records a `Final verification` item naming the feature-level acceptance criteria that only the completed feature can satisfy.
- The final review checklist adds: is slicing used only when needed, and is any scope beyond the smallest slice explicitly deferred?
### 3. Review challenge against the smallest slice
`systematic-review.md` plan-review checklist gains these items:

- The smallest user-feedback slice is named and is slice 1.
- No requirement or task entered without a mapping to a slice, unless it is explicitly deferred.
- Any scope that re-entered from an alternative design or a prior review is deferred with a revisit trigger.
- The plan carries enough feature-level criteria for the final verification.

The review challenges against the smallest user-feedback slice, not only against the design, because the design can carry the creep. When scope exceeds the smallest slice, the review recommends deferral by default.
### 4. Repeatable slice execution
`execute.md` keeps the single-slice path and adds a multi-slice unit.

- For a plan with no slice grouping, execute all tasks as today and hand off once. The single-slice path is unchanged.
- For a plan with slice headings, read the plan, find the first slice with incomplete tasks, and execute only that slice.
- After the slice's verification passes and its ledger is updated, stop and hand off. Do not auto-run the remaining slices.
- A later `/execute` on the same plan resumes at the next incomplete slice.
- If the user names a slice in the extra instructions, execute that slice when it has no incomplete blockers.
- A slice may ship as one or more pull requests; the existing stack-split check applies to the slice.
- For a multi-slice plan, the terminal state becomes one verified slice increment with the plan updated as the ledger.
### 5. Slice-aware and final verification
`verify.md` keeps the single-slice path and adds slice awareness for multi-slice plans.

- For a plan with no slice grouping, verify every acceptance scenario as today. There is no separate final pass.
- For a plan with slice grouping, when the plan resolves, read its slice grouping and the current slice.
- Verify the acceptance scenarios whose tasks belong to the current slice. Record scenarios that belong to later slices as `deferred to slice N`; they do not block.
- When the current slice is the final slice, also verify the feature-level criteria from the plan's `Final verification` against the design goals. For this pass, reconstruct the cumulative feature state from the feature base, the merged slices, and the current candidate, and record the reconstruction method. If the state cannot be reconstructed from available evidence, return `BLOCKED` instead of guessing.
- The verdict stays `VERIFIED` or `BLOCKED`. A multi-slice verdict says which slice it covers.
## Components and boundaries
| Component | File | Responsibility |
|---|---|---|
| Design boundary | `dot_pi/agent/exact_prompts/brainstorm.md` | Smallest user-feedback slice field, alternate-design selection and deferral rule, design contract, self-review |
| Plan boundary and slicing | `dot_pi/agent/exact_prompts/plan.md` | `Smallest user-feedback slice` field for every plan; conditional `### Slice N` grouping for multi-slice work, deferral rule, slice-scenario mapping, final-verification item, final-review check |
| Review challenge | `dot_pi/agent/exact_prompts/systematic-review.md` | Plan-review items that challenge scope against the smallest slice, require deferral, and check that slicing is used only when needed |
| Repeatable execution | `dot_pi/agent/exact_prompts/execute.md` | Single-slice plan executes as today; multi-slice plan runs the next incomplete slice, stops and hands off, resumes on a later run, slice-scoped stack check |
| Slice and final verification | `dot_pi/agent/exact_prompts/verify.md` | Single-slice plan verifies as today; multi-slice plan verifies slice-scoped scenarios, marks deferred scenarios, and runs the final whole-feature pass |
| Structural enforcement | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Marker assertions for the fields, slice grouping, review items, and final verification |
| Unchanged | `dot_pi/agent/exact_prompts/simplify.md`, `pr-*.md`, `learn.md`, `resolve-worktree`, `learn-evidence.mjs` | No changes |
## Alternatives considered
### Enforce the boundary only in `plan.md` and `systematic-review.md`
Merit: fewer files change and `brainstorm.md` stays lean. Rejected: an alternate design first appears in brainstorm, and without a selection rule it reaches the plan already merged, where the review is the only defender.
### A `--slice <n>` flag on `/execute`
Merit: explicit control over which slice runs, with no ambiguity about the next slice. Deferred: the default next-incomplete slice covers the common path, and a flag adds input surface with no proven need. Add it only if the default proves insufficient.
### Concurrent `/execute` runs from one plan
Merit: parallel slices would shorten wall-clock time when slices are independent. Rejected: runs share one worktree, branch, and ledger with no locking, so the ledger and git state would race. A worktree-per-slice design is a separate proposal.
### One plan-wide verify only at the end
Merit: one cross-model verify session per plan, which is cheaper. Rejected: the goal is to put each slice in front of users and verify it. A slice that reached users unverified defeats the purpose.
### A standalone slice artifact
Merit: slices would be easier to read than headings inside a long plan. Rejected: the plan is already the ledger and the source of truth for execution; a second artifact duplicates it and will drift.
## Risks and mitigations
| Risk | Mitigation |
|---|---|
| The final verify cannot see earlier slices that merged separately | The plan records the feature base and the ordered slice list; the verifier reconstructs the cumulative state and records the method; an unreconstructable state is `BLOCKED` |
| `plan.md` exceeds its 18,000-byte budget | Measure after the edit; raise the budget only with justification, otherwise tighten wording |
| More prompt prose does not change behavior | Marker tests enforce structure; observe the next real cycle and iterate the wording |
| Per-slice verify cost: one cross-model session per slice | Accepted; this is the cost of verified, feedback-bearing slices. Slices that share a branch still verify once per run |
| Slice grouping fragments work too finely | The rule targets the smallest feedback-bearing slice, not the smallest possible change; the review challenges an over-fragmented plan |
| Small work gains slice ceremony | Slice grouping is conditional; Small/direct plans keep the concise shape and one execution unit, and the review asks whether slicing is needed |
| A slice is not independently shippable because of a hidden dependency | The plan's `Blocked by` edges and the review's blocking-edge check surface it before execution |
## Operability and maintenance
A local agent workflow, not a service. Observable artifacts: committed plans with a `Smallest user-feedback slice` field; multi-slice plans also carry `### Slice N` headings, per-slice `/verify` reports, and the final feature-level verdict. Maintenance is self-contained in the prompt files and their marker test. Ownership is chezmoi-managed by Matteo.
## Rollout and rollback
Rollout: one pull request to `maruina/dotfiles`. Before `/verify`, validate the source prompts with `pi --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"` and inspect targeted `chezmoi --source "$PWD" diff` output without applying. After a fresh `VERIFIED` result, apply all changed prompt and test-script targets. Prompts are read at invocation, so there is no migration concern.
Rollback: `git revert`, inspect the same targeted diff, and apply the reverted targets.
## Security and data handling
No secrets, credentials, or personal data. The changes add prompt text and test markers. The `/verify` read-only contract and the `/execute` branch-safety gate are unchanged. Verification of the cumulative feature still runs only read-only checks.
## Testing strategy
Prompt behavior and marker tests change; application code is not touched.

1. Structural markers in `lifecycle-prompts.test.mjs`: `brainstorm.md` names the smallest user-feedback slice and the alternate-design deferral rule; `plan.md` names the field in the brief and the header and states that `### Slice N` grouping is conditional on multi-slice work; `systematic-review.md` lists the scope-challenge items; `execute.md` states the next-incomplete-slice unit for multi-slice plans and the unchanged single-slice path; `verify.md` states slice-scoped and final whole-feature verification.
2. Context budgets: `npm run test:prompts` passes, and the byte counts stay within the existing budgets or the budget change is recorded.
3. Handoff integrity: the existing `## Handoff` assertions continue to pass.
4. Controlled dry run before `/verify`, using the source prompt directory: run `/brainstorm` on a request with two viable designs and confirm one is selected and the other is deferred; run `/plan` and confirm slice 1 is the smallest user-feedback slice; run `/systematic-review` and confirm it challenges scope against that slice.
5. Small-path dry run: run `/plan` on a Small/direct request and confirm it has no `### Slice N` headings and one execution unit.
6. First real cycle: run `/execute` on a multi-slice plan, confirm it stops after the first slice, then run it again for the next slice, and confirm the final run's `/verify` covers the whole feature.

The implementation pull request itself follows `/execute` → `/verify`; prompt changes are behavior-bearing per `/verify`'s risk classification.
## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Repository guidance requires it before planning changes | Identified `chezmoi` and `write` for the drafting step and confirmed only `brainstorm.md` and `plan.md` have byte budgets |
| `chezmoi` | `agent-selected` | The changes target chezmoi source files under `dot_pi/agent/exact_prompts/` | Kept edits in the source tree, planned source-prompt validation before `/verify`, and targeted `chezmoi diff` inspection |
| `write` | `agent-selected` | The design and the prompt rules are prose read by humans and models | Applied short literal sentences, active voice, one path for the common case, and a benefit-first statement for each rejected alternative |
## Self-review notes
Reviewed skeptically as a staff engineer.
- Accepted downside of the chosen direction: the fix is more prompt prose, and prose has no guaranteed effect on model behavior. The mitigation is mechanical: marker tests plus the next cycle's observation. If behavior does not change, the field and checklist were still the right structure to iterate on.
- Accepted cost: per-slice verification spends one cross-model session per slice. This is intended, because an unverified slice that reaches users is worse than the extra session.
- Rejected finding: enforce the boundary only in `plan.md` and `systematic-review.md`. Brainstorm is where an alternate design first enters; deferring the rule to plan leaves the merge to be caught late.
- Accepted concern: the design could push every plan into slicing and add ceremony to small work. The rule is conditional and the review asks whether slicing is needed; the residual risk is a model that slices a small plan anyway. The small-path marker and dry run catch it.
- Rejected finding: mandatory slice grouping for every plan. It adds ceremony to Small/direct work and contradicts the smallest-slice goal.
- Rejected finding: a `--slice <n>` flag now. The default next-incomplete slice covers the common path; a flag is speculative.
- Named limitation: the final whole-feature verification depends on reconstructing the cumulative state when slices merge separately. The design requires the plan to record the base and order, and requires `BLOCKED` when reconstruction is impossible. This is the weakest part of the design and the first candidate for tightening after a real multi-slice run.
## Decision records
- Decision: the smallest user-feedback slice is the binding boundary. Rationale: it is the one scope statement that returns real feedback fastest and gives review something concrete to reject extra scope against.
- Decision: alternate designs are selected, not merged; non-selected designs are deferred with a revisit trigger. Rationale: the artifact review shows merged or re-entered alternatives as the growth path.
- Decision: the review challenges against the smallest slice, not only against the design. Rationale: the design can carry the creep, so a design-as-source-of-truth check is self-approving.
- Decision: slice grouping is conditional; Small/direct work keeps a single execution unit. Rationale: the lifecycle must stay small for small work; slicing is a response to deferred or multi-pull-request scope, not a default.
- Decision: a multi-slice plan groups tasks under `### Slice N` and the smallest slice is slice 1. Rationale: `/execute` needs a durable execution unit that spans runs; the plan is already the ledger.
- Decision: `/execute` runs one slice and stops. Rationale: this makes deferral cheap and matches the feedback loop the user wants.
- Decision: each slice ships in one or more pull requests and is verified on the slice; the final run also verifies the whole feature. Rationale: verified feedback per slice, with one holistic check that the feature meets its goals.
- Decision: no concurrency. Rationale: a shared worktree and ledger race without locking; a parallel design is separate.
