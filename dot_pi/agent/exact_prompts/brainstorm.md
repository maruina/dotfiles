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
1. Inspect relevant guidance, existing patterns, recent commits, tickets, prior plans, architecture decision records, and design skills. Load design skills before proposing approaches.
2. Define goals, non-goals, users, constraints, success criteria, ownership, and operational expectations.
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
- context reviewed
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
After saving the spec, say:

> Spec written to `<path>`. Please review it and let me know if you want changes before we start writing the implementation plan.
