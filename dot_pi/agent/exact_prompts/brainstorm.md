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

## Workflow
1. Gather context before proposing solutions. Assume you do not know this area of code well: go up one layer of abstraction, build a domain map, inspect relevant guidance and history, and summarize what you learned before asking design questions or recommending a direction. Load design skills before proposing approaches.
2. Clarify the real objective before accepting the proposed implementation path. Ask what the user is trying to accomplish and why, what triggered the request, whether this is one-off recovery or durable behavior, and whether non-code options could solve it more safely. Then define goals, non-goals, users, constraints, success criteria, ownership, and operational expectations.
3. Classify complexity as simple, medium, or complex based on blast radius, novelty, component count, operational risk, and reversibility. Scale discovery to that risk.
4. Keep an assumption ledger: assumption, evidence, impact if wrong, and validation path. Stop on unvalidated high-risk assumptions.
5. Ask clarifying questions one at a time. Prefer multiple choice when practical.
6. Recommend one approach, then compare 1-2 alternatives and explain why they are weaker.
7. Run a pre-mortem, operability review, and security review scaled to risk. Mitigate real risks before approval.
8. Get user approval for the design direction before writing the spec.
9. If in a git repository, write the spec in a branch or worktree, not directly on `main` or `master` unless the user explicitly approves.
10. Write `plans/<ticket-or-feature>/design.md`.
11. Review the spec as a skeptical staff engineer. Fix blocking issues inline; record rejected findings with rationale.
12. Ask the user to review the written spec before handing off to `/plan`.

## Context Discovery
Scale discovery to complexity and risk, but start with evidence before design. Do not propose a design from a narrow reading of the target file.

Go up one layer of abstraction before reasoning locally. Build a map of the relevant domain using the project’s vocabulary, not invented terms. If you cannot name the relevant domain concepts, owners, callers, and boundaries using the project’s own vocabulary, keep gathering context.

When applicable, review:

- repository guidance: `README*`, `AGENTS.md`, `CLAUDE.md`, contributor docs, architecture docs, and ADRs
- relevant skills, prior plans, tickets, incidents, dashboards, and runbooks
- files, packages, APIs, configs, tests, owners, and interfaces likely to be touched
- existing implementation and test patterns near the likely change
- callers, dependencies, downstream consumers, data flow, control flow, lifecycle, and ownership boundaries
- recent history for the touched area, including recent commits and the last 10 merged PRs when available

Use repository glossary, type names, API names, comments, docs, and tests as vocabulary sources.

Ask for source-of-truth links when they are not provided and would materially improve context: Jira issue or epic, Confluence page, Slack thread, incident, PR, design doc, runbook, dashboard, workflow execution, service ownership page, or other system of record. If the user does not have them, continue with repository evidence and clearly mark the gap.

Separate the user’s proposed solution from the underlying problem. Identify the desired outcome, why it matters now, the triggering event or failure mode, who or what is blocked, whether this is one-time recovery, migration, cleanup, mitigation, or durable behavior, and what operational, configuration, restoration, rollback, reconciliation, or process options exist before proposing code changes.

Before proposing approaches, summarize:

- the domain map
- the context reviewed
- what is known versus assumed
- what could not be verified

If a source is unavailable, expensive, or irrelevant, say so briefly rather than pretending it was reviewed.

## Design Checks
Answer these before approval:

- How does this fit existing architecture and repository patterns?
- What are the main failure modes, and how do we detect, mitigate, and roll back each one?
- Are logs, metrics, traces, alerts, and runbooks sufficient for diagnosis?
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
After saving the spec, say exactly:

> Spec complete and saved to `plans/<ticket-or-feature>/design.md`. Review it before handing off to `/plan`.
