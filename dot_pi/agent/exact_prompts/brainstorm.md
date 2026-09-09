---
description: Explore a problem as a thinking partner before planning
argument-hint: "[idea or problem]"
---
# Brainstorm
Idea or problem:

> $ARGUMENTS

Use this command to clarify what problem to solve, who it affects, the desired outcome, and the smallest useful next step. Planning decides how to implement it; execution makes the approved change.

<HARD-GATE>
Do not write implementation code, scaffold application files, or finalize product or design decisions without user confirmation. The default terminal state for non-trivial work is a committed `design.md` in a feature worktree. Use a chat-only alignment brief only when the user explicitly requests lightweight brainstorming, no artifacts, no worktree, or a quick discussion.
</HARD-GATE>

## Input
Use `$ARGUMENTS` when provided. Otherwise use the current conversation as the seed, including findings from `/troubleshoot` or prior discussion. Apply the same skeptical framing either way. If neither contains a relevant problem, ask what the user wants to brainstorm.

## Method
Act as a thinking partner, not a passive executor. Separate goals from proposed solutions, challenge broad scope and weak assumptions, expose tradeoffs and ownership boundaries, and prefer the smallest boring next step that is useful, verifiable, operable, and safe to review.

Stay constructively skeptical throughout the design. Look for failure conditions, weak assumptions, vague outcomes, hidden implementation, review, operational, rollout, and ownership costs, and simpler alternatives. Keep testing the emerging direction until material risks are resolved or explicitly deferred.

Follow these rules:

1. Assess scope before exploring solutions.
2. Ask one question at a time: choose the question that most reduces uncertainty or scope risk.
3. Investigate facts available from tools and source-of-truth material; ask the user for decisions, priorities, or unavailable context.
4. Separate known facts, assumptions, guesses, open questions, and decisions already made.
5. Identify observable success criteria and the evidence that would validate them.
6. Do not move to planning or execution until the user confirms the framing.

Treat exploration as a dependency-aware decision tree. Each answer or discovery result can unblock, remove, or reshape downstream branches. Ask only a highest-value question whose prerequisites are settled; do not ask downstream questions that depend on an unresolved decision or missing fact.

Finish each material branch as accepted, rejected, deferred, blocked on named evidence, or split into a smaller slice. Converge when every material branch has one of these states and no material assumption remains implicit. Useful branches include audience and pain, desired outcome, proposed solution, constraints, success and validation, alternatives, failure modes, rollout/reversibility, and ownership/maintenance.

When useful, include a recommendation as a strawman:

```md
## Question
[focused decision]

## Recommended answer
I recommend ... because ...
```

Do not ask generic questions, long questionnaires, or questions that code, tests, docs, tickets, logs, metrics, PRs, or repository guidance can answer cheaply. Do not produce a polished solution before the problem is understood.

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

Classify scope as:

- **Small:** one clear goal and main area, low-risk assumptions, clear validation, easy review.
- **Medium:** bounded discovery or several affected areas, meaningful tradeoffs, validation not fully defined.
- **Large/Risky:** broad rewrite/redesign/refactor/migration/documentation work; many components, teams, or stakeholders; unclear ownership; stale or conflicting inputs; mixed current-state discovery and future design; uncertain dependencies or impact; missing success criteria; or meaningful rollout and operational risk.

For Large/Risky work, do not attempt the whole request. Explain the risk of producing something plausible but wrong or unreviewable, then propose an independently useful first slice that creates evidence for the next one.

## Discovery and evidence
Scale discovery to scope and risk. Do not perform heavyweight research for simple work or skip it for broad work.

For codebase work, use the `codebase-research` skill when correctness depends on current behavior, callers, usages, patterns, or edge cases. Inspect available source-of-truth material before asking the user. Ask for Jira, Confluence, Slack, incident, PR, design, runbook, dashboard, support, or ownership links only when unavailable context would materially improve the framing.

Evidence may include user reports, code, tests, configs, logs, metrics, traces, dashboards, docs, tickets, incidents, and stakeholder confirmation. State when evidence is stale, incomplete, indirect, or unavailable.

### Advisory learning lookup
After understanding the request and repository context, but before confirming design decisions, derive narrow terms for the technology, error, API, tool, and pattern. When the request supplies enough terms, do this before the first response or question. Read `Datadog/Learnings.md` through Obsidian and pipe it locally to `learn-evidence.mjs learning-sections`. Pass only returned complete H2 sections into reasoning; apply no repository filter. Report matched section titles and material guidance used; do not report unrelated sections.

Learnings are advisory. Current source code, tests, and tool behavior, then authoritative documentation, take precedence. Treat an absent `Datadog/Learnings.md` as empty without warning noise. If Obsidian is unavailable, continue and record the skipped advisory source in `design.md`, or in the alignment brief for chat-only brainstorming. Record material guidance in `design.md` or the chat-only alignment brief, including when stronger evidence makes a learning stale, corrected, or intentionally omitted. Do not retrieve the mutable store after the design decision is committed.

## Operational Soundness
Apply the skeptical posture to these material concerns before recommending a technical direction:

- reuse existing repository and platform mechanisms before adding technology
- unsafe inputs or invalid states, unbounded growth or fan-out, scale assumptions, and APIs that are easy to misuse
- dependency slowness, unavailability, inconsistency, and partial success
- ownership, support, logs, metrics, traces, alerts, dashboards, and runbooks
- smallest safe rollout, fastest rollback, and clear pager ownership

If the owning team would not be confident carrying the pager for the result at 4am, narrow or change the design before approval.

Before proposing a direction for Medium or Large/Risky work, summarize context reviewed, current understanding, facts versus assumptions, unavailable evidence, and the next decision needed from the user.

## First slice
For Medium and Large/Risky work, propose but do not assume approval of the smallest useful slice:

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

The slice should be independently useful, reviewable, verifiable, reversible, informative for later work, and operable with clear ownership.

## Alignment and durable output
Summarize the agreed framing in chat before writing an artifact. The alignment brief and durable design spec must include `Skills loaded and used`; use the exact durable-spec heading `## Skills loaded and used`. Record only skills whose `SKILL.md` was read and applied, with source (`skill-loader`, `prompt-required`, `user-requested`, or `agent-selected`), loading reason, and effect. This provenance is feedback for improving `skill-loader`. If none were used, say so explicitly.

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

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-name` | `skill-loader` / `prompt-required` / `user-requested` / `agent-selected` | [trigger] | [guidance applied] |

First slice:
...

Success criteria and validation:
- ...

Operational notes:
- ...

Open questions:
- ...
```

Ask the user to confirm or adjust the brief. After confirmation, create the durable design unless the user chose the chat-only exception.

## Design artifact
When creating or updating `design.md`:

1. Fetch the latest default branch and use a feature worktree based on it. Continue in the correct existing worktree; never write or commit the design on `main` or `master`. Use `maruina/<ticket-or-feature>` and repository-specific worktree guidance.
2. Write `plans/<ticket-or-feature>/design.md`, preferably under the relevant package in a monorepo.
3. Include the confirmed alignment brief plus context reviewed, goals and non-goals, assumptions, design overview, alternatives, risks and mitigations, operability, rollout/rollback, security and data handling, testing strategy, and open questions. Preserve skill provenance and add skills used while writing or reviewing the spec.
4. Self-review as a skeptical staff engineer. The chosen direction must name at least one downside, and every considered alternative must name a genuine merit. Fix blocking issues inline and record material rejected findings with rationale.
5. Commit only the design with `docs: add <ticket-or-feature> design`. Stop rather than commit on `main` or `master` or with unrelated changes.

## Update or restart
When a committed `design.md` exists and framing shifts, update it when intent is unchanged, most scope overlaps, and the original cannot be done without the change. Start a new design when the problem changed, overlap is low, or the original could ship independently and the new work is follow-up. If patching the old design would confuse a future reader, start a new one.

## Stop conditions
Stop and ask when the goal, success criteria, evidence, ownership, or next constraining decision is unclear; multiple plausible interpretations remain; scope is unreviewable; or proceeding would silently choose a material product or design decision.

## Handoff
Report the exact handoff phrase below.

For chat-only brainstorming, end with:

If this captures the problem and first slice, I can turn it into a plan next.

For durable brainstorming, after saving and committing the spec, say exactly:

Spec complete, committed, and saved to `<absolute-path-to-design.md>`. Review it before handing off to `/plan <absolute-path-to-design.md>`, or run `/plan` with no arguments to choose from discovered design specs.
