---
description: Turn an idea into an approved design spec before implementation
argument-hint: "<idea>"
---
# Brainstorm an Approved Design
Idea:

> $ARGUMENTS

Turn the idea into an approved design spec through skeptical, collaborative discovery.

Lifecycle: `/brainstorm` creates an approved design spec, `/plan` creates an approved implementation plan, and `/execute` implements verified changes.

<HARD-GATE>
Do not write implementation code, scaffold files, or change files outside the design spec. The terminal state is an approved `design.md`.
</HARD-GATE>

## Posture
Be convinced, not compliant. Prefer the smallest boring design that is safe to operate.

Push back on unclear goals, unsafe assumptions, excessive scope, unnecessary novelty, brittle dependencies, weak observability, missing rollback, and ambiguous ownership.

Surface scale assumptions early. Ask enough sizing questions to understand the order of magnitude: users, requests per second, data volume, growth rate, and operational limits. Prefer an incremental design that solves the current scale well, leaves clear extension points for the next order of magnitude, and identifies which optimizations can wait.

## Workflow
1. Gather context before proposing solutions. Use the `codebase-research` skill: zoom out one abstraction layer, build a domain map, inspect relevant guidance and history, analyze current behavior, and find existing patterns. Before asking any design question, state aloud what you found and what you assumed — covering domain concepts, owners, boundaries, and key callers. Do not ask design questions or recommend a direction until you have done this. Load design skills before proposing approaches.
2. Separate the proposed solution from the underlying problem. Ask what the user is trying to accomplish and why, what triggered the request, whether this is one-off recovery or durable behavior, and whether non-code options could solve it more safely. Define goals, non-goals, users, constraints, success criteria, ownership, and operational expectations.
3. Classify complexity as simple, medium, or complex based on blast radius, novelty, component count, operational risk, and reversibility. Scale discovery to that risk.
4. Keep an assumption ledger: assumption, evidence, impact if wrong, and validation path. Stop on unvalidated high-risk assumptions.
5. Ask clarifying questions one at a time. Prefer multiple choice when practical.
6. Recommend one approach, then compare 1-2 alternatives and explain why they are weaker.
7. Run a pre-mortem, operability review, and security review scaled to risk. Mitigate real risks before approval.
8. Get user approval for the design direction before writing the spec.
9. Create an isolated worktree before writing the spec:
   - Fetch the latest default branch.
   - Branch from the latest default branch, not from the current HEAD.
   - Branch naming: `maruina/<ticket-or-feature>` unless repository guidance specifies otherwise.
   - Worktree path: follow repository guidance. For Datadog repositories, use `~/dd/.worktrees/<repo-name>-<branch-slug>`.
   - If the default branch, branch name, or worktree location is ambiguous, ask before creating.
   - Move any already-written uncommitted design spec into the worktree and remove it from the original checkout.
10. Write `plans/<ticket-or-feature>/design.md` in the worktree, relative to the relevant package directory in monorepos (e.g. `domains/compute/apps/<app>/plans/<ticket-or-feature>/design.md`). Record its absolute path for the handoff.
11. Review the spec as a skeptical staff engineer. Fix blocking issues inline; record rejected findings with rationale.
12. Commit only the design spec: `docs: add <ticket-or-feature> design`. Do not include unrelated changes.
13. Ask the user to review the spec before handing off to `/plan`.

## Context Discovery
Scale discovery to complexity and risk. Start with evidence before design — do not propose from a narrow reading of the target file.

Use the `codebase-research` skill before proposing approaches. For design work, additionally review when applicable:

- repository guidance: `README*`, `AGENTS.md`, `CLAUDE.md`, contributor docs, architecture docs, ADRs
- relevant skills, prior plans (`**/plans/*/design.md`), tickets, incidents, dashboards, runbooks
- files, packages, APIs, configs, tests, owners, and interfaces likely to be touched
- existing implementation and test patterns near the likely change
- callers, dependencies, downstream consumers, data flow, control flow, lifecycle, and ownership boundaries
- recent history: recent commits and the last 10 merged PRs when available

Use repository glossary, type names, API names, comments, docs, and tests as vocabulary sources.

Ask for source-of-truth links when they would materially improve context: Jira epic, Confluence page, Slack thread, incident, PR, design doc, runbook, dashboard, or service ownership page. If the user does not have them, continue with repository evidence and mark the gap.

Before proposing approaches, summarize: the domain map, context reviewed, current behavior, existing patterns, what is known vs. assumed, and what could not be verified. If a source is unavailable or irrelevant, say so briefly.

## Design Checks
Answer these before approval:

- How does this fit existing architecture and repository patterns?
- What are the main failure modes, and how do we detect, mitigate, and roll back each one?
- Are existing logs, metrics, traces, alerts, and runbooks sufficient, or does this design need new ones?
- What happens when dependencies are slow, unavailable, inconsistent, or partially successful?
- What data could be lost, duplicated, corrupted, or exposed?
- What is the smallest safe rollout and fastest safe rollback?
- Would I be comfortable being paged for this at 3am?

If the last answer is no, revise the design.

## Spec Requirements
The spec must include:

- goals and non-goals
- context reviewed, including unavailable or skipped sources with rationale
- assumption ledger
- design overview
- components, boundaries, and interfaces
- alternatives considered and rationale
- pre-mortem risks and mitigations
- operability, rollout, and rollback
- security and data-handling considerations
- testing strategy
- decision records

Before asking for review, remove placeholders, contradictions, unsupported assumptions, scope creep, and vague mitigations.

## Handoff
After saving and committing the spec, report its absolute path and hand off with that exact path, saying:

> Spec complete, committed, and saved to `<absolute-path-to-design.md>`. Review it before handing off to `/plan <absolute-path-to-design.md>`, or run `/plan` with no arguments to choose from discovered design specs.

Lead with the full absolute path so `/plan` resolves the spec directly instead of searching every worktree, which in a monorepo lists every committed `plans/*/design.md` copy across worktrees. Keep the no-argument form as a fallback for when the path is not at hand.
