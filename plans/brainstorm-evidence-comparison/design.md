# Brainstorm evidence comparison design
## Problem and goal
`/brainstorm` must evaluate a simpler existing-code solution before user confirmation makes a design durable. In a computecla provisioning investigation, the agent found the existing step wrapper but rejected logging with unsupported risks. It then designed a history exporter and wrote five Jira tasks. A teammate reopened the comparison and proposed logging in the wrapper, which the user accepted.

The goal is to make the comparison concrete and visible before approval. The agent must evaluate the selected approach and the smallest existing-code approach against the same user constraints. A user priority is an evaluation criterion, not evidence that an option fails it.

The audience is engineers who use lifecycle prompts to turn investigation into approved work. Success is better-supported decisions, not an automatic preference for fewer lines or a longer alternatives list.

## Confirmed scope
The user approved this framing and confirmed that an evidence-based comparison is sufficient. An independent reviewer is not required.

The implementation slice changes only:
- `dot_pi/agent/exact_prompts/brainstorm.md`.
- Focused contract tests in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

Use `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` as a regression check; no change is expected there.

This artifact defines the design only. It does not implement prompt or test changes.

## Context reviewed
Repository: `maruina/dotfiles`, managed through chezmoi. Initial discovery used `d3515e2`. The feature worktree starts at fetched `origin/main`, `af5e969`; the intervening commit changes only `pr-validate.md`. The prompts and tests relevant to this design are unchanged.

Reviewed sources:
- `dot_pi/agent/exact_prompts/brainstorm.md`: branch closure, coaching, operational checks, alignment brief, and design-file self-review.
- `dot_pi/agent/exact_prompts/plan.md`: mechanism evidence, validation paths, and final review.
- `dot_pi/agent/exact_prompts/systematic-review.md`: design challenge, existing-pattern reuse, and smallest-slice scope checks.
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`: required phrases and byte budgets.
- `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`: advisory learning and lifecycle contracts.
- `codebase-research`, `skill-loader`, `learning-opportunities`, and `write` skills.
- Commit `8466574`: shared contracts were extracted into skills when several prompts repeated them.
- The thinking-coach history and relevant references under `plans/brainstorm-thinking-coach/`.
- Pi session `01a11fd9-1c24-707c-a179-45d7186e1efa`, including the relevant source-reading results, chat decisions, Jira writes, and later correction.
- [Baptiste's Slack review](https://dd.slack.com/archives/G01JKB7KKNF/p1791540078186819?thread_ts=1791539174.850719&cid=G01JKB7KKNF), including all replies.

Advisory lookup of `Datadog/Learnings.md` through Obsidian timed out. No guidance from that store informed this design.

## Current behavior and failure evidence
The prompt already requires skepticism, simpler alternatives, reuse of repository mechanisms, and selection of the approach whose smallest slice produces user feedback fastest. The problem is not a complete absence of these principles.

The original session shows:
1. Before its first framing response, research displayed the complete `runStep` wrapper at `domains/compute/apps/computecla/worker/account/provisioning/skip.go:26` and counted 38 textual matches for `runStep` in provisioning Go files. The function checks the skip key, logs a skipped step, and otherwise returns `fn()`.
2. The agent stated that log-only changes do not add recorded Temporal commands and that workflow logging is suppressed during replay. Those facts were already part of its reasoning before it selected export.
3. It asked the user to compare forgotten exports with wrongly named or incomplete instrumentation shipped before provisioning. The user answered that wrong data was worst. The agent later called worker logging the option the user had rejected.
4. The exporter acquired scheduling, deduplication, child-history traversal, input allowlisting, limits, and analysis work. The estimate reached about 400 production and 400 test lines. These were estimates, not implemented changes.
5. The alignment brief made provisioning-code changes a non-goal without exposing an evidence-based comparison with wrapper logging. The user later requested alternatives in Jira. The epic included an alternatives table, but its logging rejection still relied on generic critical-path and incorrect-data risks.
6. Jira creation bypassed the explicit self-review in the prompt's `Design artifact` section. There is no observable comparative review before the ticket writes; the record cannot prove what internal consideration occurred.
7. Baptiste questioned the amount of change and connected duration and failure reporting directly to the existing wrapper. The agent then acknowledged that its earlier objections were weaker than stated. The user requested additional wait logs, and the smaller design retained separate wait visibility.

Logging executes inside workflow code; it is not outside Temporal altogether. The relevant distinction is that logger calls do not introduce Temporal commands or remote activities. The proposed instrumentation still needs to preserve return values and avoid new blocking dependencies. SDK behavior described above is evidence from the original investigation, not a fresh technical validation of computecla in this session.

The failure is both an agent-execution failure and a prompt gap. Existing rules were not applied consistently. The prompt also lacks an explicit evidence requirement for material alternative decisions, and its named self-review is tied to one output format.

## Smallest user-feedback slice
Do first: revise the branch-evaluation rule, reuse the existing skeptical review before confirmation, and make its comparison visible in the brief. Add focused contract tests without increasing the context budget.

What the user sees: a concise comparison that explains what each material approach provides, what it costs, what evidence supports its safety and feasibility, and which limits the selected approach accepts.

What the team learns: whether the prompt exposes unsupported rejection reasons before approval and reopens a comparison when the selected approach loses its advantage.

Why no smaller slice is sufficient: a comparison field alone can display the same unsupported rejection, as the original Jira table did. An evidence rule alone can remain invisible to the user or be bypassed when the requested output is not `design.md`. The rule and its pre-confirmation application form one useful slice.

Deliberately defer independent review, shared-skill extraction, downstream prompt changes, and a general evaluation harness.

## Design overview
### 1. Evaluate alternatives with concrete evidence
Extend the existing branch-closure guidance rather than add another general search checklist.

For material alternative decisions:
- Evaluate the concrete mechanism against the user's constraints. For code-dependent claims, inspect the relevant code or tests; naming a file is not sufficient evidence.
- Distinguish established risks from hypotheses. Investigate a generic risk or leave the branch explicitly unresolved or deferred; do not present it as a demonstrated rejection reason.
- Treat a user's priority as a criterion to apply to options. Explicit user selection or exclusion remains a valid decision; do not infer it from a priority answer.
- Reopen the comparison when requirements or complexity materially weaken the reason for selecting the current direction. Do not use a fixed line-count threshold or reconsider every settled alternative after every question.

Evidence can be source behavior, tests, measurements, platform documentation, or an explicit stakeholder decision. The rule must not require a code reference for a preference or a non-code constraint.

### 2. Apply the existing review before confirmation
Move the skeptical staff-engineer review out of the design-file-only procedure and apply it before presenting the alignment brief. Preserve its useful requirements: a downside for the selected direction, a genuine merit for considered alternatives, user feedback from the smallest slice, and deferred rather than merged alternatives.

Add the concrete comparison with the smallest existing-code change that could meet the success criteria. Compare material data or behavior coverage, safety, delivery time, implementation and operating cost, validation, and accepted limits. Scale the presentation to the decision; do not require an exhaustive table or artificial alternative for trivial work.

Record the comparison and material rejection reasons in the brief. Include a revisit trigger for an alternative deferred because of a stated limit or unresolved risk. A brief cannot silently turn an assumption into a user-approved fact.

Before writing any durable output, verify that the confirmed comparison still holds. This includes `design.md` and user-requested substitutes such as Jira tickets. If it does not hold, return to alignment rather than silently change the design. If nothing material changed, do not repeat the full review or require another approval.

The design-file procedure references the same review rather than duplicate it. This design does not authorize Jira or Confluence writes without the user's explicit request, and it does not expand the normal artifact workflow.

## Alternatives and why not selected
| Alternative | Genuine merit | Why not selected | Revisit trigger |
|---|---|---|---|
| No prompt change; enforce existing instructions | No context cost; existing principles cover reuse and skepticism | The review remains output-specific, and the brief lacks an explicit evidence-based comparison | Behavioral evaluation shows the targeted revision adds no useful effect |
| Add only an alternatives field | Small and visible | The original epic already had such a table, with an unsupported rejection | Not selected independently; use the field as part of the approved slice |
| Add another search rule for wrappers and helpers | Can expose an overlooked extension point | This session had already displayed the wrapper before selecting export | Repeated failures show extension points are not found rather than incorrectly evaluated |
| Mandatory fresh-context reviewer | Independent judgment can reopen a biased comparison | The user confirmed that visible evidence-based comparison is sufficient; review adds latency and tool dependence | Evaluation repeatedly fails despite correct application of the comparison rule |
| Extract a shared review skill | One owner can prevent drift across prompts | No repeated contract needing extraction was established; plan and review already have stage-specific checks | A second lifecycle stage needs the same comparison contract |
| Raise the byte budget or apply all six candidate changes | More room for explicit instructions | Available space and reuse of the existing review support a smaller change; no evidence justifies all six additions | A readable minimal implementation cannot fit without losing required behavior; stop for approval rather than compress or raise the limit silently |

## Constraints and validation
Baseline at `af5e969`:
- `brainstorm.md` is 12,744 bytes; its limit is 14,000 bytes, leaving 1,256 bytes.
- Both requested test files pass: 53 tests total.
- Preserve tested wording, including `non-selected alternatives are deferred rather than merged`, `select the one whose smallest slice produces user feedback fastest`, and the branch-convergence wording checked by the suite.
- Preserve coaching, user control, skill provenance, learning lookup, smallest-slice selection, and lifecycle handoff contracts.

Run the narrow regression command from `dot_pi/agent/exact_scripts`:

```sh
node --test lifecycle-prompts.test.mjs learn-prompts.test.mjs
```

Add focused contract checks for evidence-based alternative evaluation, the distinction between priorities and option decisions, material-change reconsideration, a visible brief comparison, and review timing that is independent of durable output format. Check that the design-file procedure refers to the review rather than retaining a second copy.

Contract tests check instruction structure and required content. They cannot establish that a technical comparison is correct.

### Bounded behavioral evaluation
Use fresh sessions with the candidate prompt and small source fixtures. Supply the problem, constraints, relevant code, and user responses; do not supply the original retrospective or Baptiste's recommended answer. Inspect output before approval or artifact creation. Keep evaluation records local and report the model, inputs, and observed result during implementation verification. Do not build a general harness in this slice.

1. **Computecla-shaped case:** include a skip-key step wrapper, existing workflow logger, and existing wait helpers. Supply the requirements for durations, outcomes, restarts, shared analysis, fail-open behavior, and a near-term deadline. When the user says wrong data is worst, the agent must not infer rejection of logging. Before confirmation, it must compare wrapper logging with history export, distinguish logs from Temporal commands, and expose no-backfill and retry-detail limits. It may not claim that correctness is proven merely because the change is small.
2. **Countercase:** provide evidence that the smaller wrapper does not cover required work and that modifying uncovered paths violates a stated constraint. The agent must be able to select another approach with a concrete reason. Fewer lines must not override requirements.
3. **Growth and output substitution:** after an initial direction, introduce a requirement that adds a material component or weakens its advantage. Request Jira instead of a design file. The agent must revisit the affected comparison before confirmation and must not bypass the review because of the output format. No real Jira writes are needed for evaluation.

A passing behavioral evaluation is supporting evidence, not a guarantee across future sessions. Report failures rather than weaken the rubric to fit the output.

## Risks and mitigations
- **The comparison repeats the same unsupported claim.** Require evidence of the mechanism, not just a file name, and include the countercase evaluation.
- **More prose repeats existing principles.** Replace and relocate existing review guidance; do not add a second skepticism checklist.
- **The rule favors fewer lines over correctness.** Compare constraint satisfaction and accepted limits first. Allow evidence-based selection of the larger approach.
- **A review gate adds delay or repeated approval.** Recheck before output, but reopen approval only when a material change invalidates the confirmed comparison.
- **The revision exceeds the budget or damages tested phrases.** Run the baseline tests before editing and preserve the budget. Stop for a scope decision if readable guidance cannot fit.
- **The agent still fails to follow the prompt.** The chosen direction has this residual downside. Structural tests and bounded evaluations do not remove the need for user judgment or occasional independent review.

## Operability, rollout, and rollback
Matteo owns the prompt source and its evaluation. No service, schedule, credential, runtime dependency, or production provisioning code changes.

During implementation, preview and apply only the changed prompt through chezmoi using the feature worktree as `--source`. Check the explicit target file, not only its directory. Tests remain in the repository; no broad apply is needed.

Use subsequent brainstorm sessions to inspect whether the comparison appears before approval and whether it contains evidence rather than labels. There is no telemetry or session-collection feature in this slice.

Rollback is a source revert and targeted apply of the prior prompt. This design artifact does not require a chezmoi apply or a copy into the home directory.

## Security and data handling
The design records only the source facts needed to explain the failure. It does not copy the session transcript, Temporal payloads, Slack credentials, or workflow histories into the repository. Behavioral fixtures must use minimal synthetic code and inputs without cluster payloads or secrets. Keep evaluation transcripts local unless separately approved.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `learning-opportunities` | `prompt-required` | Brainstorm coaching | Asked for the user's reasoning and clarified their evidence and review requirements before recommending safeguards |
| `codebase-research` | `prompt-required` | Correctness depends on prompt behavior and existing contracts | Inspected prompts, tests, related history, and the original session before selecting changes |
| `learning-lookup` | `prompt-required` | Advisory lookup before design decisions | Attempted lookup and recorded the unavailable source without treating it as evidence |
| `skill-loader` | `prompt-required` | Provenance and applicable skill selection | Selected matching skills and recorded only guidance read and applied |
| `chezmoi` | `skill-loader` | Managed prompt source | Kept rendered targets unchanged and scoped future apply to the explicit prompt target |
| `write` | `skill-loader` | Design prose and technical comparisons | Separated facts from inference and stated genuine alternative merits and the selected direction's downside |
| `slack-mcp` | `agent-selected` | User requested Baptiste's review thread | Read the complete thread without writes and compared it with session decisions |
| `obsidian-cli` | `agent-selected` | Advisory source access | Used the CLI for the attempted learning lookup |
| `feature-worktree` | `prompt-required` | Durable design artifact | Created a feature branch from fetched main and kept the base checkout on main |

## Self-review and open questions
The chosen direction reuses existing review guidance and limits new behavior to evidence-based comparison and its timing. Its main downside is reliance on the same agent that formed the initial preference. Independent review remains an available escalation, not a requirement.

Rejected review expansions:
- Moving guidance into a shared skill is not justified by the neighboring prompts' existing stage-specific contracts.
- Requiring a reviewer would exceed the user's confirmed requirement.
- Adding a general search checklist would not address the demonstrated evaluation failure.
- Logging fewer details is not the intended simplification: the alternative still has to meet the agreed data requirements, including separate wait visibility.

No unresolved design decision blocks planning. Exact wording, test assertions, and the bounded fixture details belong in `/plan`; they must preserve this scope and the existing byte budget. Any proposal to add a skill, raise the budget, change another lifecycle prompt, or require independent review must return to the user for approval.
