# Separate requirements from implementation suggestions in `/plan`
A fresh `/execute` agent must know what it can change without reopening a plan. Keep every observable acceptance case, safety boundary, and agreed design decision binding. Let the agent choose routine implementation details.

## Evidence
- In `dot_pi/agent/exact_prompts/plan.md` at `ba51ff7`, the task template requires exact edit paths. Final review rejects “pre-written implementation choreography,” but neither instruction says whether `/execute` may use a different path.
- In the Stage Runner publication plan at `030cad3`, Slice 1 initially stopped over a perceived conflict between interactive `gh` account selection and subprocess authentication. The rules applied to different callers. The run's `execute-1/accepted.json` records operator acceptance. This is not evidence that either authentication boundary should be relaxed.
- Slice 2 required deferred discovery of Agentic Review Platform (ARP) operations, but its guard denied every tool except three operations that were not yet discoverable. `execute-2/handoff.json` records a stop before edits or tests. This was a contradiction in the plan, not an observed unauthorized call.
- [OpenSpec’s spec-driven schema](https://github.com/Fission-AI/OpenSpec/blob/0c737dc1b543249b38b0f4716816fcf493d894dd/schemas/spec-driven/schema.yaml) separates testable requirements from technical decisions but permits prescriptive tasks. [Matt Pocock’s ticket guidance](https://github.com/mattpocock/skills/blob/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/to-tickets/SKILL.md) favors observable slices and avoids paths that can go stale. The advisory lookup in `Datadog/Learnings.md` returned no matching section.

## Change and limits
1. Clarify the existing task contract. Keep exact repo-relative paths useful for navigation, but label proposed files and mechanisms as suggestions. When a path or mechanism is binding, name the requirement, safety constraint, or agreed design decision that fixes it. `/execute` may vary a suggestion without waiving any acceptance case or changing scope.
2. In final review, trace one allowed scenario through the controls that apply to it, including its prerequisites. If the controls prevent the outcome, resolve the contradiction before committing the plan. Keep the observable scenario, not a mandatory sequence of implementation steps. This check supplements all distinct happy, edge, failure, and negative cases; it does not replace them.

Keep the existing task format and verification requirements. A ban on paths would avoid accidental prescriptions but remove useful starting points. Leaving the prompt unchanged would avoid a contract update but leave the existing ambiguity. A mandatory walkthrough section would make the check visible but could turn one possible path into a second task list. Revisit that option only if plan reviews still miss contradictions after the clarification.

## Acceptance and validation
The first useful slice is the two clarifications in `/plan` and their prompt-contract coverage. Read a candidate plan as a fresh executor: it must be possible to identify which choices can change and to explain why a permitted operation remains reachable. Use the historical Slice 2 contract as a read-only counterexample:

- Discovery must work without granting invocation permission. An authorized child must be able to discover the permitted operations and read status for the exact owner, repository, PR, and expected head SHA. The plan need not select the discovery mechanism.
- Preserve each original case, not just that walkthrough. Keep work-profile and phase authorization, operation and argument checks, matching GitHub and ARP heads, one permitted silent request per head, observing an active review without requesting again, and terminal status with complete findings for the matching SHA.
- Retain the negative and stop cases: wrong target or SHA, forbidden operations including finding writes, duplicate sibling requests, stale ingestion, ambiguous request outcomes, unavailable access, deadline expiry, and cancellation. Require evidence that denied calls never reach ARP; an error message alone does not prove non-dispatch. Do not retry an uncertain write or report an unverified clean review.

Update `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` and run the prompt checks and Stage Runner integration suite when implementing. Those checks can detect a missing prompt instruction or a workflow regression. They cannot prove that every generated plan is consistent; the case comparison tests the intended reading, not live ARP enforcement.

## Rollout and scope
Apply the verified prompt to future plans only. Reverting the prompt and its contract test restores the previous guidance. No runtime enforcement, `/execute` change, new plan format, external call, credential handling, or migration of pinned plans is needed. Do not modify the publication worktree or its run evidence. No open design decisions remain.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Route discovery | Selected codebase and prose guidance. |
| `feature-worktree` | `prompt-required` | Isolate writes | Created a clean feature worktree from `origin/main`. |
| `codebase-research` | `skill-loader` | Check the reported conflict | Compared the prompt, pinned plan, and run handoffs. |
| `learning-lookup` | `prompt-required` | Check prior guidance | Searched the advisory store before selecting a direction. |
| `repo-checkout` | `agent-selected` | Locate OpenSpec | Confirmed its local checkout and remote before reading the upstream revision. |
| `explain` | `agent-selected` | Compare workflows | Compared specification, task, and implementation responsibilities separately. |
| `chezmoi` | `skill-loader` | Respect source and target boundaries | Kept the design in the source worktree and did not apply a target. |
| `write` | `skill-loader` | Write the design | Distinguished requirements from suggestions and named the evidence for each stop. |
