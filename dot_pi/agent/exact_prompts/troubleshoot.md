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
Before routing, load the `skill-loader` skill. Use its domain-skill triggers and other available skill descriptions to identify relevant guidance from explicit identifiers or confirmed evidence. Read each matching skill before choosing domain commands. Do not infer a route from a plausible correlation. If no skill description explicitly matches, emit a bounded source-of-truth gap and ask for a pointer. Start with the smallest high-signal, read-only query and bound time range, result count, history depth, and fan-out. Treat an ambiguous environment, account, cluster, namespace, domain, or context as a stop condition when it could alter the answer.

An Atlas or Temporal workflow URL (host `atlas.ddbuild.io` or `temporal.ddbuild.io`) explicitly routes to `atlas-workflows`. Use that skill to collect a bounded visible failure chain. That skill determines the correct Atlas context/domain and gathers status, failure tree, workflow metadata, input, output, or bounded history. If collected evidence establishes a Datadog telemetry investigation, route to `datadog-mcp`, which determines the organization and constrains query shape.

### 4. Diagnose
Maintain two separate tiers:
- **Factual tier:** Give material observations stable IDs such as `F1`, `F2`. Record the observed result, source and command/query, environment, instance, time window, and deployed version where relevant, plus collection limits or conflicts. Keep direct observations separate from causal interpretations. Start with available incident evidence and cheap, bounded read-only queries; collect across instances or sources when that can distinguish explanations.
- **Hypothesis tier:** Maintain the hypothesis ledger below. Reference factual IDs for supporting and opposing evidence, record remaining gaps, and give each hypothesis one bounded discriminating read-only test, its expected observation, and a state. Run high-value tests one at a time. After each test, record whether it ran in the ledger, link the actual observation by fact ID, and update the hypothesis state. If the test could not run, record the evidence gap; do not treat the expected observation as a result. Publish negative results because they reduce the search space.

Seek a comparable control: a successful run, unaffected instance, previous version, or well-understood alternative failure. Check whether it could share the suspected failure and record confounding differences. If no trustworthy control is available, record the gap and continue with other evidence. Prefer measured differences that distinguish explanations over broad symptoms such as elevated latency. Shared observations remain constraints; they can still interact with another change.

Before concluding, check the leading hypothesis against every material fact: explained, compatible but not explained, contradictory, or not yet assessed. Compatibility alone does not establish causality. Reject an explanation contradicted by a reliable observation; preserve unresolved evidence conflicts rather than silently discarding them. Use a hypothesis-by-fact matrix only when several explanations survive or progress stalls.

When no hypothesis fits, recheck collection scope and quality, split overly broad hypotheses, and consider a shared mechanism or complementary causes where supported by facts.

**Progressive signal discovery:** If explanations still fail or remain indistinguishable, collect a bounded observation from the next relevant layer or dependency instead of adding speculative hypotheses. For example, move from application logs and configuration to network behavior, process/thread state, or kernel evidence, as the symptom requires. Use each observation to choose the next source; do not follow a fixed stack checklist. Stop descending when the evidence distinguishes the explanations, then validate the leading explanation against every material fact. Stop when access, safety, or query limits prevent progress; name the missing evidence and next source, and report the gap rather than expanding access or changing state.

Prefer runtime evidence before reading code to generate causal hypotheses. Inspect the relevant deployed revision to explain or test an observed mechanism; source code alone does not establish which path ran. Assess any supplied reproduction against the discriminating incident signals, not just a similar symptom. Do not run a state-changing reproduction; hand off any experiment that requires one.

### 5. Conclude and hand off
Before the handoff, try to contradict the leading explanation: Which fact is hardest to explain? Which causal link rests only on code or timing? For combined causes, remove each cause and identify which material fact becomes unexplained. A surviving hypothesis alone is not a confirmed root cause. If a material fact remains unassessed or a causal link lacks authoritative evidence, keep the explanation a supported hypothesis or unknown. State the missing observation needed to confirm it.

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

Preserve the original observation and its provenance when evidence is questioned. If a collection error is established, record the correction and its basis rather than silently rewriting the factual tier. Treat user reports as attributed reports until independently verified.

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
Produce a concise, evidence-oriented result. Fill `Skills loaded and used` per the `## Provenance record` section of the `skill-loader` skill.

```md
## Troubleshooting result

### Status and impact
- ...

### Confirmed
- **Fact ID:** F1
  **Source and collection scope:** ...
  **Observed result:** ...
  **Limits or conflicts:** ...

### Visible failure chain
- ...

### Hypothesis ledger
| Hypothesis | Evidence for (fact IDs) | Evidence against / gap | Test and expected observation | State |
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
| ... | `skill-loader` / `prompt-required` / `user-requested` / `agent-selected` | ... | ... |
```
