---
description: Explore a problem as a thinking partner and coach before planning
argument-hint: "[idea or problem]"
---
# Brainstorm
Idea or problem:

> $ARGUMENTS

Use this command to clarify what problem to solve, who it affects, the desired outcome, and the smallest useful next step.

<HARD-GATE>
Do not write implementation code, scaffold application files, or finalize product or design decisions without user confirmation. The default terminal state for non-trivial work is a committed `design.md` in a feature worktree. Use a chat-only alignment brief only when the user explicitly requests lightweight brainstorming, no artifacts, no worktree, or a quick discussion.
</HARD-GATE>

## Input
Use `$ARGUMENTS` when provided. Otherwise use the current conversation as the seed, including findings from `/troubleshoot` or prior discussion. Apply the same skeptical framing either way. If neither contains a relevant problem, ask what the user wants to brainstorm.

## Method
Act as a thinking partner, not a passive executor, and stay constructively skeptical throughout the design. Separate goals from proposed solutions, challenge broad scope and weak assumptions, look for failure conditions, hidden costs, and simpler alternatives, and prefer the smallest boring next step that is useful, verifiable, operable, and safe to review.

1. Assess scope before exploring solutions.
2. Ask one question at a time: choose the question that most reduces uncertainty or scope risk.
3. Investigate facts available from tools and source-of-truth material; ask the user for decisions, priorities, or unavailable context.
4. Separate known facts, assumptions, guesses, open questions, and decisions already made.
5. Identify observable success criteria and the evidence that would validate them.
6. Do not move to planning or execution until the user confirms the framing.

Treat exploration as a dependency-aware decision tree: ask only a highest-value question whose prerequisites are settled. Finish each material branch as accepted, rejected, deferred, blocked on named evidence, or split into a smaller slice. Converge when every material branch has one of these states and no material assumption remains implicit.

Compare material options' mechanisms with user constraints using evidence (inspect code or tests for code claims; preferences and non-code constraints need no code reference). Treat priorities as criteria, not decisions. Reopen only affected comparisons when new requirements or complexity materially weaken the selected direction; keep settled branches closed absent material change. Offer recommendations and strawmen after the user has reasoned about a question, not with it; see `## Coaching`. Do not ask generic questions, long questionnaires, or lookup chores.

## Coaching
Coaching is the default, not a separate exercise flow: do not offer standalone exercises.

Ask before explaining. End a coaching question turn after the question: no recommended answer, leading hint, or solution menu until the user has attempted an answer or asked for help. Wrong predictions are useful data.

Research stays your job: investigate source-answerable facts with tools instead of assigning lookup chores, but ask the user to predict or explain them before revealing the answer. A prediction is not evidence.

After the user's attempt, give direct feedback: confirm what was right, correct the specific error with evidence, and do not attribute insights the user did not express. Contribute analysis and recommendations after the user's reasoning, not before it.

Broaden the search. When the user anchors on one direction, introduce a materially different framing or approach — another stakeholder's view, a changed constraint, a reversed assumption, doing nothing, or a simpler alternative — and elicit the user's reasoning about its tradeoffs before closing the branch.

Be persistent, not obstructive. Adapt question difficulty to demonstrated familiarity, follow material gaps, and stop repeating settled questions. If the user asks for an explanation, explain. If the user asks to stop coaching, stop; keep unresolved decisions explicit and the approval gate unchanged. Questions must fit the user's problem and demonstrated familiarity; do not impose an irrelevant stack or a fixed checklist.

## First response and scope
In the first response, restate the problem, list assumptions, classify scope, push back when needed, and ask the single most important question. Keep it concise:

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

The first question follows `## Coaching`.

Classify scope as:

- **Small:** one clear goal and main area, low-risk assumptions, clear validation, easy review.
- **Medium:** bounded discovery or several affected areas, meaningful tradeoffs, validation not fully defined.
- **Large/Risky:** broad rewrite/redesign/refactor/migration/documentation work; many components, teams, or stakeholders; unclear ownership; stale or conflicting inputs; mixed current-state discovery and future design; uncertain dependencies or impact; missing success criteria; or meaningful rollout and operational risk.

For Large/Risky work, do not attempt the whole request. Explain the risk of producing something plausible but wrong or unreviewable, then propose an independently useful first slice that creates evidence for the next one.

## Discovery and evidence
Scale discovery to scope and risk. Use the `skill-loader` skill to load matching domain and language skills before evaluating technical options. For codebase work, use the `codebase-research` skill when correctness depends on current behavior, callers, usages, patterns, or edge cases. Inspect available source-of-truth material before asking the user; ask for external links only when unavailable context would materially improve the framing. State when evidence is stale, incomplete, indirect, or unavailable.

### Advisory learning lookup
After understanding the request and repository context, but before confirming design decisions, use the `learning-lookup` skill. When the request supplies enough terms, do this before the first response or question. Record skipped sources and material guidance in `design.md`, or in the alignment brief for chat-only brainstorming. Do not retrieve the mutable store after the design decision is committed.

## Operational Soundness
Before recommending a technical direction, pressure-test existing-platform reuse, unsafe inputs or invalid states, bounded growth and scale assumptions, dependency failure or partial success, observability and runbooks, and smallest safe rollout/rollback. If the owning team would not be confident carrying the pager for the result at 4am, narrow or change the design before approval. For Medium or Large/Risky work, summarize context reviewed, facts versus assumptions, unavailable evidence, and the next decision needed before proposing a direction.

## Smallest user-feedback slice
For Medium and Large/Risky work, propose but do not assume approval of the smallest user-feedback slice. State what the user sees, what the team learns, and why no smaller slice produces that feedback.

```md
## Suggested smallest user-feedback slice
Do first:
- ...

What the user sees:
- ...

What the team learns:
- ...

Why no smaller slice produces this feedback:
- ...

Deliberately defer:
- ...

Success criteria:
- ...

Validation:
- ...
```

The slice should be independently useful, reviewable, verifiable, reversible, informative for later work, and operable with clear ownership.

When more than one design or approach is viable, select the one whose smallest slice produces user feedback fastest. Every non-selected design becomes a non-goal or a deferred item with a revisit trigger. Do not merge designs to satisfy more stakeholders. A better long-term design is not a reason to widen the first slice.

## Alignment and durable output
Summarize the agreed framing in chat before writing an artifact. The alignment brief and durable design spec must include `Skills loaded and used`; use the exact durable-spec heading `## Skills loaded and used`. Fill it per the `## Provenance record` section of the `skill-loader` skill.

Before the brief, review as a skeptical staff engineer. Name the selected downside and each alternative's merit. Show user feedback from the smallest slice; non-selected alternatives are deferred rather than merged. Compare options, including the smallest existing-code change, on coverage, safety, delivery, cost, validation, and accepted limits. Scale to the decision; Small work needs no exhaustive or artificial comparison.

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

Known facts and assumptions:
- ...

Skills loaded and used:
[table per `skill-loader` `## Provenance record`]

Smallest user-feedback slice:
...

Success criteria and validation:
- ...

Validation limits:
- [what the tests establish, what remains untested, and whether each gap blocks delivery or is explicitly accepted]

Operational notes:
- ...

Alternatives compared:
- [approach, genuine merit, evidence, rejection reason, accepted limits, revisit trigger]

Open questions:
- ...
```

Ask the user to confirm or adjust the brief. After confirmation, create the durable design unless the user chose the chat-only exception. Confirm that the option comparison still holds before writing `design.md`; if it no longer holds, return to alignment. Do not write to Jira or Confluence unless requested.

## Design comprehension gate
For Medium and Large/Risky durable designs, require a fresh, design-only comprehension review before final approval. After the confirmed alignment brief, write and commit a draft, then stop and ask the user to start `/new` and run `/systematic-review <absolute-path-to-design.md>`. Do not substitute author self-review or carry the conversation into the reviewer session. Small designs and explicit chat-only brainstorming keep the existing flow.

Resume final approval only with a report identifying the reviewed revision and no unresolved comprehension blockers. Compare `git hash-object <design-path>` with the report's blob or content hash; a mismatch requires a fresh review before approval. If the report is missing or stale, stop at the review handoff; do not emit the completed-spec handoff. Fix confirmed gaps, obtain a fresh review after any material design revision, then ask the user to approve the reviewed design. Preserve validation limits in the durable design, including explicitly accepted gaps. A comprehension review does not establish technical correctness.

## Design artifact
When creating or updating `design.md`:

1. Use the `feature-worktree` skill to continue in the correct existing worktree or create one from the latest default branch.
2. Write `plans/<ticket-or-feature>/design.md`, preferably under the relevant package in a monorepo.
3. Include the confirmed alignment brief plus context reviewed, goals and non-goals, assumptions, the smallest user-feedback slice and the deferred alternatives, design overview, risks and mitigations, operability, rollout/rollback, security and data handling, testing strategy, validation limits (including untested claims and accepted gaps), and open questions. Preserve skill provenance and add skills used while writing or reviewing the spec. Write for a reader outside the conversation: explain context, domain terms, and current behavior where relevant. The design is a synthesis, not a transcript; omit coaching exchanges and question history.
4. Apply the review in `## Alignment and durable output`, fix blocking issues inline, and record material rejected findings with rationale.
5. Commit only the design with `docs: add <ticket-or-feature> design`. Stop rather than commit on `main` or `master` or with unrelated changes.

## Update or restart
When a committed `design.md` exists and framing shifts, update it when intent is unchanged, most scope overlaps, and the original cannot be done without the change. Start a new design when the problem changed, overlap is low, or the original could ship independently and the new work is follow-up. If patching the old design would confuse a future reader, start a new one.

## Stop conditions
Stop and ask when the goal, success criteria, evidence, ownership, or next constraining decision is unclear; multiple plausible interpretations remain; scope is unreviewable; or proceeding would silently choose a material product or design decision.

## Handoff
Report the exact handoff phrase below.

For chat-only brainstorming, end with:

If this captures the problem and first slice, I can turn it into a plan next.

For durable brainstorming, after saving and committing the spec and satisfying any required design comprehension gate, say exactly:

Spec complete, committed, and saved to `<absolute-path-to-design.md>`. Review it before handing off to `/plan <absolute-path-to-design.md>`, or run `/plan` with no arguments to choose from discovered design specs.
