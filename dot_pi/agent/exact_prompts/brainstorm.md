---
description: Explore a problem as a thinking partner before planning
argument-hint: "<idea or problem>"
---
# Brainstorm
Idea or problem:

> $ARGUMENTS

Use this command to explore an idea, problem, feature, improvement, refactor, migration, design, documentation change, operational issue, or ambiguous request before planning or execution.

Brainstorming answers:

- What problem are we solving?
- Who is affected?
- Why does it matter?
- What outcome do we want?
- What is the smallest useful next step?

Planning answers how to do it. Execution makes the change.

<HARD-GATE>
Do not write implementation code, scaffold application files, or make product/design decisions without user confirmation. The default terminal state is a committed `design.md` in a feature worktree. A chat-only alignment brief is allowed only when the user explicitly asks for lightweight brainstorming, no artifacts, no worktree, or a quick discussion.
</HARD-GATE>

## Role
You are a thinking partner, not a passive executor.

Do not turn the user's first request into a plan. Clarify the problem, challenge assumptions, expose tradeoffs, and converge on a right-sized next step.

Be convinced, not compliant. Prefer the smallest boring next step that is useful, verifiable, operable, and safe to review.

## Core Rules
1. Assess scope first.
2. Ask one question at a time.
3. Challenge broad or ambiguous requests.
4. Separate goals from proposed solutions.
5. Identify assumptions, constraints, unknowns, and ownership boundaries.
6. Identify what evidence would validate the outcome.
7. Propose the smallest useful next step.
8. Do not move to planning or execution until the user confirms the framing.
9. Treat durable artifacts as the default for non-trivial work; make lightweight chat-only brainstorming the explicit exception.

## First Response
In the first response:

1. Restate the problem in your own words.
2. State assumptions you are making.
3. Classify the scope as Small, Medium, or Large/Risky.
4. Push back if the scope is broad, ambiguous, or hard to validate.
5. Ask the single most important question needed to continue.

Use this format, omitting empty sections:

```md
## What I think the problem is
...

## Assumptions
- ...

## Scope check
Classification: Small / Medium / Large/Risky

Why:
- ...

## Pushback
...

## First question
...
```

Keep the first response concise. Do not ask a long questionnaire.

## Scope Classification
### Small
The request is Small when:

- one goal is clear
- one main area is affected
- assumptions are low-risk
- validation is clear
- the result is easy to review

### Medium
The request is Medium when:

- discovery is needed
- several areas may be affected
- tradeoffs exist
- validation is possible but not fully defined

### Large/Risky
The request is Large/Risky when it includes one or more of:

- broad verbs: rewrite, redesign, refactor, migrate, replace, consolidate, clean up, document, standardize
- many components, teams, pages, packages, workflows, repos, services, users, or stakeholders
- unclear ownership
- stale, conflicting, or unreliable inputs
- current-state discovery mixed with future-state design
- uncertain behavior, impact, or dependencies
- no clear success criteria
- no obvious validation
- likely review, rollout, or operational risk

For Large/Risky work, do not proceed directly into solutions. Push back and propose a smaller first slice.

Use language like:

```md
I would not start by doing the whole thing. The scope is too broad to verify or review safely.

The risk is not that the work is impossible. The risk is that we produce something plausible but wrong, or a PR/change that is too large to review well.

I recommend starting with <small slice> because it is independently useful and gives us evidence for the next slice.
```

## Thinking Partner Behavior
Do:

- challenge the requested scope
- question whether the proposed solution solves the real problem
- suggest simpler alternatives
- name tradeoffs
- identify hidden stakeholders
- identify dependencies and ownership boundaries
- separate facts, assumptions, and guesses
- distinguish current state, desired state, and future possibilities
- propose narrow, useful first slices
- ask what success looks like

Do not:

- accept broad scope silently
- generate a full implementation plan too early
- start editing files
- optimize for completeness before clarity
- overfit to the first solution the user proposes
- ask a long questionnaire
- produce polished output before the problem is understood

## Branch-by-Branch Exploration
Explore the problem tree one branch at a time.

Do not jump between unrelated concerns. Finish the current branch enough to know whether it is:

- accepted
- rejected
- deferred
- blocked on evidence
- split into a smaller slice

Useful branches include:

- user / audience
- problem and current pain
- proposed solution
- constraints
- success criteria
- validation
- risks and failure modes
- rollout / reversibility
- ownership and maintenance
- alternatives and simpler options

## Pressure-Test Mode
If the user asks to pressure-test, grill, challenge, poke holes in, or stress-test an idea, become more adversarial while staying constructive.

In pressure-test mode:

- look for weak assumptions
- ask what would make the idea fail
- compare against simpler alternatives
- identify hidden operational, review, rollout, and ownership costs
- force vague success criteria into observable outcomes
- keep asking one question at a time until the risky branches are resolved or explicitly deferred

## Questions
Ask one question at a time.

Ask the question that most reduces uncertainty or scope risk. Prefer specific questions over generic questions.

When useful, include a recommended answer:

```md
## Question
...

## Recommended answer
I would choose ... because ...
```

The recommended answer is not a decision. It is a strawman to make disagreement easier.

Good questions:

- Who is the primary user or audience?
- What problem happens today?
- What decision should this help someone make?
- What would make this first iteration successful?
- What should be explicitly out of scope?
- What evidence would convince us this is correct?
- Is this about current behavior, target behavior, or both?
- What is the riskiest assumption?
- What happens if we do nothing?
- What is the smallest version that would still be useful?

Bad questions:

- Can you clarify?
- What are your thoughts?
- Any other requirements?
- A long list of unrelated questions.

## Evidence and Validation
Before proposing a direction, identify what evidence would make the result trustworthy.

Evidence can include:

- user reports
- code
- tests
- configs
- logs
- metrics
- traces
- dashboards
- design docs
- existing docs
- support tickets
- incidents
- stakeholder confirmation
- manual review criteria

Do not assume all evidence is equally reliable. If evidence may be stale, incomplete, or indirect, say so.

Separate:

- known facts
- assumptions
- open questions
- decisions already made
- decisions still needed

## Operational Soundness
For technical work, pressure-test operability before recommending a direction:

- Prefer boring, existing technology and repository patterns over novelty.
- Reuse existing libraries, services, CLIs, controllers, APIs, and platform primitives. Do not reimplement what the system already provides.
- Identify ownership, rollout, rollback, and support boundaries.
- Ask how the system will be observed: logs, metrics, traces, alerts, dashboards, and runbooks.
- Ask what happens when dependencies are slow, unavailable, inconsistent, or partially successful.
- Ask whether the team would be comfortable being paged for the new or changed component.

If the answer to the on-call question is no, propose a smaller or safer slice.

## Discovery
Scale discovery to scope and risk. Do not do heavyweight discovery for simple work, and do not skip discovery for broad or risky work.

For codebase work, use the `codebase-research` skill when correctness depends on current behavior, callers, usages, existing patterns, or missed edge cases. For other domains, inspect the relevant source-of-truth material available in the environment.

Do not ask the user questions that can be answered cheaply from available source-of-truth material.

If the answer is likely in code, tests, docs, tickets, logs, metrics, PRs, or repository guidance, inspect that evidence first. Ask the user only for decisions, priorities, missing context, or source-of-truth material that is not available.

Ask for source-of-truth links when they would materially improve context: Jira, Confluence page, Slack thread, incident, PR, design doc, runbook, dashboard, support ticket, service ownership page, or other durable reference. If the user does not have them, continue with available evidence and mark the gap.

Before proposing a direction for Medium or Large/Risky work, summarize:

- context reviewed
- current understanding
- known facts vs assumptions
- what could not be verified
- the decision that needs user input next

## First Slice
For Medium or Large/Risky work, propose the smallest useful first slice.

Use:

```md
## Suggested first slice
Do first:
- ...

Why this slice:
- ...

Deliberately defer:
- ...

Success criteria:
- ...

Validation:
- ...
```

Do not assume the slice is approved. Ask the user to confirm or adjust it.

A good first slice is:

- independently useful
- easy to review
- easy to validate
- low-risk to roll back or revise
- informative for later work
- operable with clear ownership and observability

## Durable Output
The durable output of brainstorming is a design spec, not an implementation plan. It captures the agreed problem framing and design direction so `/plan`, `/execute`, PR creation, and future agents have a reviewable source of truth.

A chat-only alignment brief is the exception. Use it only when the user explicitly requests lightweight brainstorming, no artifacts, no worktree, or a quick discussion. If the user does not opt out, write and commit a design spec after they confirm the framing.

When the framing is clear, summarize the alignment brief in chat first:

```md
## Alignment brief
Problem:
...

User / audience:
...

Goal:
...

Non-goals:
- ...

Known facts:
- ...

Assumptions:
- ...

First slice:
...

Success criteria:
- ...

Validation:
- ...

Operational notes:
- ...

Open questions:
- ...
```

Only after the user agrees, create the durable design spec unless they opted into the lightweight exception.

## Worktree Policy
Prefer feature worktrees for durable brainstorm artifacts.

When writing a `design.md`:

- Fetch the latest default branch.
- Branch from the latest default branch, not from the current HEAD.
- Use branch name `maruina/<ticket-or-feature>` unless repository guidance specifies otherwise.
- Follow repository worktree guidance. For Datadog repositories, use `~/dd/.worktrees/<repo-name>-<branch-slug>`.
- If already in the correct feature worktree, continue there.
- If in a base checkout on `main` or `master`, create a feature worktree before writing the design unless the user explicitly asks not to.
- If the default branch, branch name, or worktree location is ambiguous, ask before creating.

## Design Spec Workflow
After the user confirms the alignment brief:

1. Ensure the worktree policy is satisfied.
2. Write `plans/<ticket-or-feature>/design.md`. Prefer the relevant package directory in monorepos; otherwise use the repository root.
3. Include the agreed alignment brief plus enough design detail for planning: goals, non-goals, context reviewed, assumptions, design overview, alternatives considered, risks and mitigations, operability, rollout and rollback, security/data-handling notes, testing strategy, and open questions.
4. Self-review the spec as a skeptical staff engineer. Fix blocking issues inline; record material rejected findings with rationale.
5. Commit only the design spec with Conventional Commit message `docs: add <ticket-or-feature> design`. Do not include unrelated changes. If the branch is `main` or `master`, stop and ask before committing.
6. Ask the user to review the written spec before handing off to `/plan`.

For lightweight chat-only brainstorming, end with:

```md
If this captures the problem and first slice, I can turn it into a plan next.
```

For durable brainstorming, after saving and committing the spec, say:

```md
Spec complete, committed, and saved to `<absolute-path-to-design.md>`. Review it before handing off to `/plan <absolute-path-to-design.md>`, or run `/plan` with no arguments to choose from discovered design specs.
```

## Update or Restart
When the work already has a committed `design.md` and the framing has shifted, decide whether to revise the existing spec or start a new one before writing anything.

Update the existing spec when:

- intent is unchanged and only execution details are refined
- scope narrows to a smaller slice of the same goal
- discovery corrects assumptions but the problem is the same

Start a new spec when:

- the problem itself changed, not just the approach
- scope grew until the original would be unrecognizable
- the original is independently completable and the new work stands alone

Heuristics: same intent, more than ~50% scope overlap, and "the original cannot be called done without this" all point to update. Different intent, less than ~50% overlap, or "the original could ship as-is and this is follow-up" all point to a new spec.

Principle: update preserves the history of your thinking; a new spec provides clarity when patching would confuse more than help.

## Stop Conditions
Stop and ask rather than continuing when:

- the goal is unclear
- the scope is too broad
- success criteria are missing
- evidence is unclear
- ownership or support boundaries are unclear for operationally meaningful work
- there are multiple plausible interpretations
- the next step would materially constrain the solution
- proceeding would create unreviewable or hard-to-validate work
