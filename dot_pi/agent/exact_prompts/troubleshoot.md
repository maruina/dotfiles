---
description: Diagnose an incident read-only and route it to the matching domain skill
argument-hint: "<Atlas or Temporal workflow URL, error, or symptom>"
---
# Troubleshoot
Problem report:

> $ARGUMENTS

Use this command to investigate an incident, failure, error, or symptom across Datadog systems without changing state. It coordinates a read-only, evidence-first method and routes the symptom to the matching domain skill. A matching skill owns domain-specific tool use, environment selection, authoritative data sources, and command safety; this prompt owns the cross-domain method, evidence taxonomy, and handoff.

<HARD-GATE>
Do not perform any state-changing operation. Do not apply, delete, scale, restart, cancel, terminate, signal, rollback, retry, or otherwise mutate workflows, deployments, configuration, code, or infrastructure. When remediation is needed, recommend the action, owner, runbook, or lifecycle handoff instead of executing it.
</HARD-GATE>

## Investigation contract

### 1. Establish the problem report
Extract the expected and actual behavior, impact, time window and timezone, identifiers, stated environment, and scope. Ask one focused question only when a missing fact blocks safe routing or meaningful investigation.

### 2. Triage
Classify the symptom as urgent, non-urgent, or unknown. Urgent means active customer impact, data loss/corruption risk, security exposure, or expanding blast radius. For urgent cases, lead with confirmed impact and recommend the smallest stabilizing action and owner. Read-only diagnosis must not delay that recommendation.

### 3. Route and examine
Identify explicit URL, error-family, service, cluster, namespace, environment, or system triggers. Load the matching skill before choosing domain commands. Start with the smallest high-signal, read-only query and bound time range, result count, history depth, and fan-out. Treat an ambiguous environment, account, cluster, namespace, domain, or context as a stop condition when it could alter the answer.

An Atlas or Temporal workflow URL (host `atlas.ddbuild.io` or `temporal.ddbuild.io`) routes to `atlas-workflows`. That skill determines the correct Atlas context/domain and gathers status, failure tree, workflow metadata, input, output, or bounded history. If collected evidence identifies a Datadog telemetry investigation, route to `datadog-mcp`, which determines the organization and constrains query shape.

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

Reserve "root cause" for a confirmed causal chain. A workflow activity error confirms that the activity failed; it does not by itself establish why its dependency failed. In that case the workflow error is a visible failure and the dependency explanation remains a hypothesis or unknown.

Tool errors, missing permissions, incomplete histories, and wrong or ambiguous context are evidence gaps, not negative evidence. Conflicting sources remain explicit conflicts until a bounded read-only test resolves them. Do not fill an evidence gap with likely-sounding narration.

## Routing and knowledge-growth contract
The available skill set is the routing table for this slice. Do not invent a source of truth for an unfamiliar system; emit a bounded source-of-truth gap and ask for a pointer instead.

When an investigation reveals a repeatable, previously missing route, emit a `Routing candidate` containing:
- trigger: an unambiguous URL host/path, error family, or system identifier;
- recommended existing skill, tool, runbook, repository, or proposed skill;
- evidence that the route was authoritative and useful;
- scope and read-only safety boundary;
- confidence using the evidence taxonomy; and
- promotion path: review via `/brainstorm`, never automatic modification.

Do not modify skills, prompts, or routing knowledge during the investigation.

## Output contract
Produce a concise, evidence-oriented result:

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
