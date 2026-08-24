# Troubleshoot Prompt Design
## Status
Approved on 2026-08-18.

## Problem
Datadog investigations span many systems, tools, environments, and ownership boundaries. A generic request to troubleshoot an incident can lead an agent to use the wrong source of truth, make broad low-signal queries, or state a plausible explanation as though it were established fact.

The first concrete use case is a supplied Atlas or Temporal workflow URL whose execution has failed. The agent must determine the visible failure and the next authoritative investigation target without conflating a workflow-level error with the underlying cause.

## User and audience
The primary user is Matteo, operating Pi across Datadog systems. Future Pi sessions are also an audience: they need a durable, consistent method for diagnosing incidents, recording uncertainty, and proposing missing domain routing knowledge.

## Goals
- Add a global `/troubleshoot` Pi prompt that coordinates read-only, evidence-first troubleshooting.
- Apply the SRE Book's troubleshooting loop: establish the problem report, triage, examine evidence, form and test hypotheses, recommend treatment or handoff, and record negative results.
- Route only on explicit, high-confidence triggers to an existing domain skill or authoritative source.
- Make Atlas/Temporal workflow URLs the first supported routing case through the existing `atlas-workflows` skill.
- Permit bounded read-only investigation, including Atlas inspection, Datadog MCP queries, `kubectl get`/`describe`, repository inspection, and read-only telemetry queries when a matching domain skill permits it.
- Require every material conclusion to distinguish confirmed evidence, supported hypotheses, rejected hypotheses, and unknowns.
- Prevent the prompt from calling an inferred or correlated explanation a fact or root cause.
- Produce reviewable routing candidates from completed investigations without changing skills, prompts, or routing knowledge during the incident.
- Reuse existing lifecycle prompts for remediation, design, planning, and execution.

## Non-goals
- Automatically modify prompts, skills, routing rules, infrastructure, workflows, deployments, configuration, or code.
- Execute remediation, rollback, retry, cancel, terminate, signal, restart, delete, scale, apply, or other state-changing operations.
- Become a centralized catalog of every Datadog system, environment, owner, or command.
- Duplicate domain-specific discovery and safety rules already owned by skills.
- Prove the underlying cause of every visible failure.
- Replace `/brainstorm`, `/plan`, `/execute`, `/verify`, or domain skills.

## Context reviewed
- Pi prompt-template documentation: a Markdown template in `~/.pi/agent/prompts/` becomes a slash command; `argument-hint` describes its expected input.
- `dot_pi/agent/exact_prompts/brainstorm.md`: evidence-first discovery, bounded questions, durable design artifacts, and skill provenance.
- `dot_pi/agent/exact_prompts/plan.md`, `execute.md`, `systematic-review.md`, and `verify.md`: the existing lifecycle owns change decisions, implementation, and independent verification.
- `dot_pi/agent/exact_prompts/learn.md`: durable learnings require explicit evidence and approval; investigations must not mutate durable knowledge on their own.
- `AGENTS.md` and `dot_pi/agent/AGENTS.md`: this is a chezmoi source repository; global prompts live in `dot_pi/agent/exact_prompts/` and must be tested, rendered, and applied from source.
- `atlas-workflows` skill: Atlas and Temporal URL parsing, context resolution, read-only workflow status/failure-tree/input/history inspection, bounded output, and required failure-answer shape.
- `atlas-best-practices` skill: distinguishes running-execution diagnosis from later Atlas workflow code remediation.
- `datadog-mcp` skill: environment selection from evidence, read-only queries, narrow time windows, result bounds, telemetry, and secret handling.
- Google SRE Book, “Effective Troubleshooting”: troubleshooting is an iterative hypothetico-deductive process; stabilize service before deep diagnosis, use observability, reduce the search space, and preserve negative results.

### Advisory learning lookup
Read `Datadog/Learnings.md` through Obsidian on 2026-08-18 and queried `learn-evidence.mjs learning-sections` with `troubleshoot`, `troubleshooting`, `temporal`, `atlas`, `routing`, and `source of truth`. No matching sections were returned. The learning store does not affect this design.

### Unavailable or deferred evidence
- No live failing Atlas workflow was supplied, so the design validates the intended workflow against the existing `atlas-workflows` contract rather than an execution transcript.
- No general routing registry exists today. Skill descriptions and their explicit triggers are the available routing surface.
- The implementation-time test harness for prompt behavior has not yet been selected. Planning must discover existing Pi-agent tests and define reproducible structural and scenario validation.

## Current behavior
Pi has specialized skills that explain how to investigate certain systems, such as `atlas-workflows` and `datadog-mcp`. Its lifecycle prompts coordinate design, planning, implementation, and verification, but there is no single read-only troubleshooting coordinator that applies a common evidence taxonomy and routes a symptom to the matching skill.

A user can provide an Atlas workflow URL directly to an agent, and the `atlas-workflows` skill defines a safe inspection path. Without a coordinating contract, however, the final response can vary in triage, source attribution, speculation handling, and what it records when the relevant source of truth is missing.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| Prompt-level routing based on visible skill descriptions is useful without a registry | Pi exposes available skill names and descriptions; `atlas-workflows` has an explicit URL trigger | The prompt may not find a needed source for some systems | Atlas scenario plus an unknown-system scenario; evolve only via reviewed routing candidates |
| Existing domain skills can own authoritative commands and safety constraints | `atlas-workflows` and `datadog-mcp` define their own tool, context, and safety rules | The coordinator could duplicate or contradict domain logic | Prompt directs the agent to load matching skills before selecting tools |
| Read-only troubleshooting is safe enough for the initial incident workflow | Existing skills prefer read-only operations and prohibit mutations by default | A command may have unexpected side effects or reveal sensitive data | Hard gate prohibits known mutators; follow domain-skill boundaries; stop when safety is uncertain |
| Evidence labels reduce false causal claims | The labels force sources, gaps, and discriminating tests into the response | Agents could still label weak evidence incorrectly | Require direct authoritative evidence for `Confirmed` and reserve “root cause” for a confirmed causal chain |
| Routing candidates can accumulate useful knowledge without automatic updates | `/learn` already uses evidence and approval for durable knowledge | Candidates may be noisy or never promoted | Require a repeatable trigger, source evidence, safety boundary, and confidence; promote through `/brainstorm` only |

## Design overview
Add one global prompt template, `/troubleshoot`, at `dot_pi/agent/exact_prompts/troubleshoot.md`.

The prompt is a coordinator, not a domain debugger. It owns the cross-domain method: establish the report, classify urgency, select explicit routing triggers, collect bounded evidence, maintain a hypothesis ledger, separate facts from inferences, and recommend a next step. A matching skill owns domain-specific tool use, environment selection, authoritative data sources, and command safety.

The initial prompt treats an Atlas or Temporal workflow URL as an explicit routing trigger for `atlas-workflows`. It remains generic for other systems: it loads a skill only when its description explicitly matches the supplied identifiers or confirmed evidence. An unmatched request produces a bounded source-of-truth gap rather than a guessed route.

The prompt is read-only. It may run narrow commands that retrieve state, logs, metrics, traces, workflow history, events, or configuration. It must stop before a state-changing action and recommend the action, owner, runbook, or lifecycle handoff instead.

## Investigation contract
### 1. Establish the problem report
Extract expected and actual behavior, impact, time window and timezone, identifiers, stated environment, and scope. Ask one focused question only when a missing fact blocks safe routing or meaningful investigation.

### 2. Triage
Classify the symptom as urgent, non-urgent, or unknown. Urgent means active customer impact, data loss/corruption risk, security exposure, or expanding blast radius. For urgent cases, lead with confirmed impact and recommend the smallest stabilizing action and owner. Read-only diagnosis must not delay that recommendation.

### 3. Route and examine
Identify explicit URL, error-family, service, cluster, namespace, environment, or system triggers. Load the matching skill before choosing domain commands. Start with the smallest high-signal, read-only query and bound time range, result count, history depth, and fan-out. Treat an ambiguous environment, account, cluster, namespace, domain, or context as a stop condition when it could alter the answer.

The prompt may route an Atlas or Temporal workflow URL to `atlas-workflows`. That skill determines the correct Atlas context/domain and gathers status, failure tree, workflow metadata, input, output, or bounded history. If collected evidence identifies a Datadog telemetry investigation, the prompt may route to `datadog-mcp`, which determines the organization and constrains query shape.

### 4. Diagnose
Maintain a hypothesis ledger. A hypothesis contains evidence for it, evidence against it or the remaining gap, one bounded discriminating read-only test, the expected observation, and a state. Run high-value tests one at a time. Publish negative results because they reduce the search space.

### 5. Conclude and hand off
Lead with status and impact, then confirmed evidence and the visible failure chain. Clearly identify hypotheses, rejected explanations, uncertainty, and the next authoritative source or owner. Recommend remediation but do not execute it. A code, configuration, or workflow change enters `/brainstorm` and then the normal lifecycle.

## Evidence and assertion policy
Every material claim uses exactly one label:

| Label | Meaning | Required basis |
|---|---|---|
| **Confirmed** | Directly established by authoritative evidence | Cite source, command/query, relevant time window, and observed result |
| **Supported hypothesis** | Current best explanation but not established | State supporting evidence, alternatives or gaps, and a discriminating test |
| **Rejected hypothesis** | Test disproved or made the explanation unlikely | State the test and negative result |
| **Unknown** | Evidence is unavailable, ambiguous, contradictory, incomplete, or inaccessible | State the gap and the smallest authoritative next source |

The prompt reserves “root cause” for a confirmed causal chain. A workflow activity error confirms that the activity failed; it does not by itself establish why its dependency failed. In that case the workflow error is a visible failure and the dependency explanation remains a hypothesis or unknown.

Tool errors, missing permissions, incomplete histories, and wrong/ambiguous context are evidence gaps, not negative evidence. Conflicting sources remain explicit conflicts until a bounded read-only test resolves them. The prompt must not fill an evidence gap with likely-sounding narration.

## Routing and knowledge-growth contract
The available skill set is the routing table for this first slice. `/troubleshoot` MUST NOT invent a source of truth for an unfamiliar system.

When an investigation reveals a repeatable, previously missing route, it emits a `Routing candidate` containing:
- trigger: an unambiguous URL host/path, error family, or system identifier;
- recommended existing skill, tool, runbook, repository, or proposed skill;
- evidence that the route was authoritative and useful;
- scope and read-only safety boundary;
- confidence using the evidence taxonomy; and
- promotion path: review via `/brainstorm`, never automatic modification.

This is intentionally slower than self-modifying routing. The downside is that useful routing knowledge needs a later approved change. Its benefit is preventing one ambiguous incident from permanently teaching an incorrect source, environment, or command.

## Output contract
The prompt uses a concise, evidence-oriented result:

```md
## Troubleshooting result

### Status and impact
- ...

### Confirmed
- **Source:** ...
  **Evidence:** ...
  **Conclusion:** ...

### Visible failure chain
- ...

### Hypothesis ledger
| Hypothesis | Evidence for | Evidence against / gap | Test and expected observation | State |
|---|---|---|---|---|
| ... | ... | ... | ... | Supported / Rejected / Unknown |

### Recommended next step
- ...

### Routing candidate
Include only when the investigation uncovered a repeatable missing or unclear route.

- **Trigger:** ...
- **Recommended skill or source of truth:** ...
- **Evidence:** ...
- **Scope and read-only safety boundary:** ...
- **Confidence:** Confirmed / Supported hypothesis / Insufficient evidence
- **Promotion path:** Review through `/brainstorm`; do not modify routing knowledge during this investigation.

### Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| ... | prompt-required / agent-selected | ... | ... |
```

## Components and boundaries
| Component | File | Responsibility |
|---|---|---|
| Troubleshooting coordinator | `dot_pi/agent/exact_prompts/troubleshoot.md` | Read-only SRE-style method, explicit skill routing, evidence taxonomy, hypothesis ledger, output and handoff contract |
| Atlas domain investigation | existing work-profile `atlas-workflows` skill | URL parsing, Atlas context selection, workflow failure-tree/history inspection, and safe workflow-specific output |
| Datadog observability investigation | existing work-profile `datadog-mcp` skill | Safe Datadog MCP authentication, environment routing, and bounded telemetry queries |

No new extension, skill registry, tool wrapper, MCP server, or mutation workflow belongs in this slice.

## Alternatives considered
### A generic “debug anything” prompt
This would be easy to invoke and may appear flexible. It was rejected because it cannot safely infer authoritative sources, environments, or ownership in a large ecosystem, and it would make unsupported claims more likely.

### Put all domain routes and commands into `/troubleshoot`
A central catalog would give users one visible place to discover investigation paths. It was rejected because it duplicates specialized skills, will drift from source-of-truth tooling, and creates an unreviewable prompt as domains grow.

### Automatically update skills or routing rules after each investigation
Automatic updates would make knowledge accumulation fast. It was rejected because a single incident can be incomplete or misleading; it would turn a hypothesis into durable behavior without review.

### Permit safe-looking remediation in the same prompt
Combining diagnosis and mitigation can reduce time to recovery for familiar operations. It was rejected for the first slice because it blurs evidence with side effects, expands authorization and rollback risk, and conflicts with the requirement for a read-only assessor.

### Require proof before stating any hypothesis
This would eliminate some uncertainty language. It was rejected because troubleshooting needs provisional hypotheses to select useful tests; the selected design permits them but labels them unambiguously.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Agent uses the wrong environment or account | Treat environment/context as unverified until evidence establishes it; stop on ambiguity; defer to domain skills |
| Broad telemetry/history queries consume excessive resources or expose irrelevant data | Start narrow, bound time windows/result counts/history depth/fan-out, and summarize outputs |
| User interprets a likely cause as established | Mandatory evidence labels, source citations, and “root cause” restriction |
| Tool failure is mistaken for absence of a condition | Classify tool errors, permissions, and incomplete outputs as `Unknown` evidence gaps |
| Prompt duplicates stale domain guidance | Keep commands and domain rules in skills; the prompt only routes and coordinates |
| Routing candidates contain one-off or incorrect rules | Require repeatable trigger, source evidence, safety boundary, confidence, and later `/brainstorm` approval |
| Urgent incident response is delayed by diagnosis | Lead with confirmed impact and a recommended stabilizing action; remain read-only and avoid unnecessary deep investigation |
| Read-only command has side effects or retrieves sensitive data | Follow domain skill safety rules, prohibit known mutators, minimize payloads, and stop when command safety is unclear |

## Operability and maintenance
This is a local agent workflow, not a production service. It has no service-level metrics, alerts, or deployment rollout. Its observable artifacts are bounded command/query output, the troubleshooting report, the hypothesis ledger, and optional routing candidates.

Prompt ownership covers the cross-domain method, safety boundary, assertion taxonomy, and handoff. Domain owners maintain their skills' triggers, tools, environment selection, and source-of-truth guidance. If investigations repeatedly emit the same confirmed routing candidate, that is evidence for a separate `/brainstorm` request to amend the relevant domain skill or prompt rule.

## Rollout and rollback
### Rollout
1. Add only `dot_pi/agent/exact_prompts/troubleshoot.md`.
2. Run existing Pi-agent prompt/resource validation and the selected prompt-contract checks.
3. Run targeted `chezmoi --source <feature-worktree> diff ~/.pi/agent/prompts/troubleshoot.md` before applying.
4. Apply only the prompt target after validation and review.
5. Exercise the Atlas failure, unresolved dependency, unknown-system, and urgent-impact scenarios before adding more routing rules.

### Rollback
Remove `troubleshoot.md` and apply the corresponding chezmoi target removal. No state migration, remote service rollback, or data cleanup is required.

## Security and data handling
- The prompt must not print or persist credentials, tokens, secrets, or unnecessary sensitive workflow payloads.
- It must follow each loaded skill's authentication, organization/environment-routing, and sensitive-data rules.
- It must use minimally scoped read-only queries and summarize large outputs.
- It must stop before operations with state-changing effects, including workflow controls and Kubernetes mutation commands.
- A missing permission is an evidence gap, not a reason to seek broader access or infer a result.

## Testing strategy
Planning must identify the repository-native test commands for Pi prompt templates. The implementation validation must include:
- structural validation that `troubleshoot.md` has valid prompt-template frontmatter and expands `$ARGUMENTS`;
- existing Pi-agent resource and smoke tests required by repository guidance;
- a targeted chezmoi source diff that renders only `~/.pi/agent/prompts/troubleshoot.md`;
- a reviewable prompt-contract check or reproducible manual validation for these scenarios:
  1. Atlas/Temporal URL: loads `atlas-workflows`, collects a bounded failure chain, and does not claim a dependency root cause without evidence;
  2. visible workflow error with no underlying dependency evidence: labels the dependency explanation as a supported hypothesis or unknown and recommends the next source;
  3. unknown system: requests a bounded source-of-truth pointer instead of inventing a route;
  4. urgent symptom: leads with impact and recommended stabilization without performing it;
  5. routing discovery: emits a candidate without modifying skills or prompts;
  6. ambiguous environment or unavailable access: stops or labels the result unknown rather than querying/claiming against an arbitrary environment.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Determine skills needed to design a global Pi prompt in chezmoi. | Identified applicable chezmoi, prose, and unfamiliar-area guidance. |
| `chezmoi` | skill-loader | The new prompt is a managed source file. | Established source path, target validation, apply, and commit constraints. |
| `write` | skill-loader | The product is operational prompt prose. | Applied concise, explicit imperative writing. |
| `codebase-research` | skill-loader | Current prompt conventions and lifecycle boundaries determine the design. | Mapped existing prompt responsibilities and local patterns. |
| `atlas-workflows` | agent-selected | Atlas/Temporal URL diagnosis is the reference use case. | Defined routing trigger, read-only investigation, context handling, output, and safety constraints. |
| `atlas-best-practices` | agent-selected | Prevent run-time workflow investigation from becoming workflow-code remediation. | Kept Atlas code changes in a later code-aware workflow. |
| `datadog-mcp` | agent-selected | The coordinator may use Datadog telemetry queries after routing. | Applied environment disambiguation, bounded queries, telemetry, and secret-handling rules. |
| `obsidian-cli` | prompt-required | Brainstorm guidance requires advisory learning lookup via Obsidian. | Read the complete learning store before querying relevant sections. |

## Self-review notes
The design was reviewed skeptically for safety, maintainability, and false certainty.

- **Accepted concern:** prompt text cannot technically prove that a model will classify every claim correctly. The design mitigates this through mandatory evidence labels, sources, explicit gaps, and a strict causal-language rule rather than claiming enforcement it cannot provide.
- **Accepted concern:** a prompt-only routing table will initially miss domains. The selected fallback is a source-of-truth gap and routing candidate, which is safer than broad unstructured searches but can slow first use.
- **Accepted concern:** read-only operations can still be expensive or disclose data. The design requires narrow, bounded queries and loaded skill constraints.
- **Rejected finding:** make the first slice Atlas-only. This would be simpler and offers strong validation, but it would not establish the requested reusable methodology. The coordinator remains generic while routing only Atlas explicitly at first.
- **Rejected finding:** include a new routing registry or extension. Such a registry could centralize discovery, but it would add a second product surface before evidence shows skills cannot serve as the initial routing table.

## Decision records
- Decision: implement `/troubleshoot` as a read-only coordinator prompt. Rationale: separate diagnosis from remediation and prevent evidence from being confused with a state-changing side effect.
- Decision: use explicit matching skills as the initial routing table. Rationale: domain skills already encode authoritative tools and safety boundaries; unmatched systems fail safely to a bounded question.
- Decision: make Atlas/Temporal workflow URL diagnosis the first explicit route through `atlas-workflows`. Rationale: it is the agreed concrete scenario and has existing specialized guidance.
- Decision: enforce `Confirmed`, `Supported hypothesis`, `Rejected hypothesis`, and `Unknown` labels for material claims. Rationale: the primary correctness requirement is never passing speculation as fact.
- Decision: reserve “root cause” for confirmed causal chains. Rationale: visible workflow failures often expose symptoms rather than the underlying dependency cause.
- Decision: emit but do not apply routing candidates. Rationale: routing knowledge must grow from evidence and review, not an unverified incident inference.
- Decision: leave remediation to named owners, runbooks, or lifecycle prompts. Rationale: those workflows own scope, authorization, validation, and rollback.
