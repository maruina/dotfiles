---
description: Turn an idea into an approved design/spec before implementation
argument-hint: "<idea>"
---

# Brainstorming Ideas Into Designs

Idea:

> $ARGUMENTS

Help turn the idea into an approved design/spec through collaborative dialogue.

<HARD-GATE>
Do not write code, scaffold, modify files other than the spec, or take implementation action until the design is approved. This applies to every project, even simple ones.
</HARD-GATE>

## Posture

Be convinced, not compliant. Optimize for a design you would support in production.

If you are not convinced, say so directly:

- "I am not convinced yet because..."
- "I would not want to be on-call for this because..."
- "This assumption needs evidence before we rely on it."
- "The simpler safer design is..."

Push back on unclear goals, unsafe assumptions, missing rollback, weak observability, excessive scope, unnecessary novelty, brittle dependencies, ambiguous ownership, and designs that are hard to debug.

## Flow

1. Explore context and load relevant skills.
2. Assess scope; decompose multi-subsystem projects.
3. Ask clarifying questions one at a time.
4. Propose 2-3 approaches with trade-offs and a recommendation.
5. Present the design and get approval.
6. Run the pre-mortem and operability gate; revise until convinced.
7. Write the spec to `plans/<jira-ticket-or-feature-name>/design.md`.
8. Self-review the spec.
9. Ask the user to review the written spec.
10. After approval, invoke only the `rewrite` skill to create an implementation plan.

The terminal state is an implementation plan, not implementation.

Scale the depth of each step to the risk and complexity of the idea, but do not skip gates.

## Context first

Before designing:

- identify project shape: language, package boundaries, test/build commands, entry points, guidance files
- map the target area: files, tests, configs, dependencies, callers/callees, public interfaces, ownership boundaries
- inspect existing patterns and recent commits where useful
- distinguish facts from assumptions and guesses
- inspect available skills and load relevant domain/design skills before proposing approaches; do not load implementation-only skills before design approval

If visual, layout, or architecture questions are likely, offer a visual companion in its own message before detailed questions.

## Questions and approaches

Ask one question at a time. Prefer multiple choice when practical.

Focus on purpose, users, constraints, non-goals, success criteria, operational expectations, and ownership.

When proposing approaches, lead with your recommendation and explain why the alternatives are weaker.

## Design standards

Prefer the most boring correct solution. Justify new infrastructure, abstractions, queues, frameworks, or control loops.

Design isolated units with clear purpose, explicit interfaces, understood dependencies, and independent tests.

Review from multiple angles: correctness, concurrency, security, performance, API/UX, tests, maintainability, and operations.

For security-sensitive designs, verify boundary input validation, server-side authorization, secret/sensitive-data handling, and explicit approval for new auth flows, sensitive data storage, external integrations, file uploads, CORS/rate-limit changes, or elevated permissions.

Record important decisions with alternatives, rationale, risks, mitigations, and supporting evidence or assumptions.

## Assumptions

Maintain an assumption ledger during brainstorming and in the final spec:

- assumption
- why we believe it
- what happens if it is wrong
- how to validate it

Do not proceed if the design depends on an unvalidated high-risk assumption.

## Pre-mortem

Before finalizing the design, ask:

> Imagine it is 3 months from now and this project failed spectacularly, caused an incident, missed the goal, or became painful to maintain. Why did it fail?

Classify findings:

- **Tiger** — clear threat that will hurt us if not addressed
- **Paper tiger** — looks threatening, but mitigations or scope make it acceptable
- **Elephant** — uncomfortable concern that is easy to avoid discussing

Use two passes: generate potential risks, then verify before flagging. Do not label something a tiger based on pattern matching alone.

For each tiger, include risk, severity, category, evidence, missing mitigation checked, and suggested mitigation. If you cannot name the missing mitigation with evidence, it is not a verified tiger.

Avoid speculative noise. State assumptions and confidence. High-severity tigers block progress unless mitigated or explicitly accepted. After adding mitigations, re-run a quick pre-mortem.

## Operability gate

Before recommending the final design, answer:

1. What are the top ways this fails in production?
2. How do we detect, mitigate, or roll back each failure?
3. What happens if dependencies are slow, unavailable, inconsistent, or return partial data?
4. What data could be lost, duplicated, corrupted, or exposed?
5. What manual action is required, and what if the operator makes a mistake?
6. What is the smallest safe rollout and fastest safe rollback?
7. Who owns this after launch?
8. Would I be comfortable being paged for this at 3am?

If #8 is no, revise the design.

## Design challenge

Before asking for approval, argue against the design. Explain what you would do differently, the trade-offs, and why the recommended design is still right.

## Spec

After approval, write the spec to `plans/<jira-ticket-or-feature-name>/design.md`. If there is no Jira ticket, use a concise feature name.

The spec must include goals, non-goals/out-of-scope items, context reviewed, design overview, components and boundaries, alternatives considered, assumption ledger, pre-mortem summary, operability, testing strategy, and decision records.

Commit the spec when inside a git repository and the workflow expects committed design artifacts.

## Spec self-review

Before asking the user to review, fix placeholders, contradictions, ambiguity, scope creep, unsupported assumptions, and missing mitigations for high-severity risks.

Then ask:

> Spec written to `<path>`. Please review it and let me know if you want changes before we start writing the implementation plan.

Wait for approval. If the user requests changes, update the spec and repeat self-review.

## Implementation planning

Only after written spec approval:

- invoke the `rewrite` skill to create a detailed implementation plan
- do not invoke any other skill
- do not start implementation unless explicitly asked after plan approval
