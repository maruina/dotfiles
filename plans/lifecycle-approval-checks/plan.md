# Lifecycle Approval Checks Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add design-only comprehension review, a reverse plan-to-design decision check, and visible validation limits.
**Smallest user-feedback slice:** The existing lifecycle commands explain and check all three approval requirements without a new extension or command.
**Out of Scope:** Automatic reviewer orchestration, additional lifecycle stages, property-based testing guidance, finding history, and cost reporting.
**Architecture:** Prompt templates own policy. `/systematic-review` gains a design-only mode that runs in a fresh session; ordinary plan review checks hidden material decisions.
**Tech Stack:** Markdown prompt templates and Node.js prompt contract tests.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| skill-loader | agent-selected | Lifecycle prompt changes | Selected applicable guidance. |
| codebase-research | skill-loader | Cross-prompt behavior | Compared prompts, coordinator contracts, and existing tests. |
| write | skill-loader | Prompt prose | Used explicit mechanisms and concise instructions. |
| chezmoi | skill-loader | Managed prompts | Edit source and use explicit target paths. |
| feature-worktree | agent-selected | Source changes | Created a feature worktree from updated origin/main. |

## Scope
The user approved the three numbered recommendations in the preceding comparison with Focus. Keep existing approval gates, code review, and coordinator contracts. A fresh design reviewer reads the design, not code or prior conversation. Its report identifies the reviewed version. Material revisions require another fresh review. If review evidence is missing, stop rather than simulate independence.

## Validation
- GIVEN a Medium or Large/Risky durable design, WHEN final approval or planning is requested, THEN require a fresh design-only comprehension review of the applicable revision.
- GIVEN a design-only review, WHEN code or conversation context could fill a gap, THEN do not use that context or apply the general code/plan review procedure.
- GIVEN a plan with a material decision absent from the approved design, WHEN plan review runs, THEN block implementation pending user approval; routine implementation details do not block.
- GIVEN design and planning alignment briefs, WHEN the user approves them, THEN validation limits state what tests establish, what is untested, and whether the gap blocks delivery or is accepted.
- Contract tests cover these instructions and preserve existing contracts. Run `node --test exact_scripts/lifecycle-prompts.test.mjs`, `npm test`, and `npm run test:all` from `dot_pi/agent` after `npm ci --ignore-scripts`.
- Validation limits: contract tests check prompt instructions, not model compliance. A live fresh-session comprehension review is not established by regex assertions. No coordinator runtime changes are planned.

### Task 1: Add approval checks and regression tests
**Delivers:** All three prompt requirements with manual fresh-session handoffs.
**Blocked by:** None
**Traces to:** All scenarios above
**Files:** `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/systematic-review.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Add focused contract tests and observe failure.
- [ ] Add the smallest prompt changes and adjust explicit context budgets only for added policy.
- [ ] Run focused and full checks; inspect the complete diff.
- [ ] Record validation limits and completion evidence.
- [ ] Apply explicit verified targets, commit with `feat(pi): add lifecycle approval checks`, and push only when safe.

Documentation impact: the changed prompts are the user and agent instructions. No extension or coordinator behavior changes, so no additional AGENTS.md guidance is needed.
