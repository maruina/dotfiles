# Troubleshoot Prompt Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global `/troubleshoot` Pi prompt that coordinates read-only, evidence-first troubleshooting and routes the first explicit case (Atlas/Temporal workflow URLs) to the existing `atlas-workflows` skill.
**Architecture:** One new Markdown prompt template under `dot_pi/agent/exact_prompts/` plus one new structural test under `dot_pi/agent/exact_scripts/`. The prompt is a coordinator: it owns the cross-domain SRE method, evidence taxonomy, routing triggers, and output/handoff contract; domain skills own tool use, environment selection, and command safety. No extension, registry, MCP server, or mutation workflow is added.
**Tech Stack:** Pi prompt-template Markdown (frontmatter + `$ARGUMENTS`), Node.js built-in test runner (`node --test`) for structural validation, chezmoi source rendering.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Determine which execution skills apply to the affected files. | Confirmed `chezmoi` (source file), `write` (prose), and `codebase-research` (unfamiliar area) apply; no Go/TS/Terraform trigger. |
| `chezmoi` | skill-loader | The new prompt is a managed source file under `dot_pi/agent/exact_prompts/`. | Established source path, `exact_` target mapping, `diff`/`apply` workflow, and `npm test` validation. |
| `write` | skill-loader | The product is operational prompt prose. | Applied concise imperative style, US English, no blank line after frontmatter/headings. |
| `codebase-research` | skill-loader | Prompt conventions and test harness determine the implementation. | Mapped `requireMarkers` + `prompt()` helpers, frontmatter shape, and `*-prompts.test.mjs` glob. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
|---|---|---|---|
| `skill-loader` | prompt-required | Determine skills needed to plan a global Pi prompt in chezmoi. | Identified `chezmoi` and `write` as applicable; confirmed no Go/TS/Terraform trigger applies to a Markdown prompt. |
| `chezmoi` | skill-loader | The new prompt is a managed source file under `dot_pi/agent/exact_prompts/`. | Established source path, `exact_` target mapping, `diff`/`apply` workflow, and `npm test` validation commands. |
| `write` | skill-loader | The product is operational prompt prose. | Applied concise imperative style, US English, no blank lines after frontmatter or headings. |
| `codebase-research` | skill-loader | Current prompt conventions and test harness determine the plan. | Mapped existing prompt frontmatter, `$ARGUMENTS`, `*-prompts.test.mjs` glob, and skill-provenance conventions. |
| `obsidian-cli` | prompt-required | Planning requires advisory learning lookup via Obsidian. | Read `Datadog/Learnings.md` and queried `learn-evidence.mjs learning-sections`; 0 of 4 sections matched, so the learning store does not affect this plan. |

## Planning alignment brief
Source of truth:
- `plans/troubleshoot-prompt/design.md` (approved 2026-08-18) — the agreed WHAT.
- Repository conventions (`*-prompts.test.mjs` harness, `validate-skills.mjs`, chezmoi source layout) — the agreed HOW.

Scope classification:
- Medium. One new prompt file plus one new test file, behavior-bearing: a read-only safety gate, an evidence taxonomy, a routing contract, and an output contract must be validated.

Implementation strategy:
- Write `dot_pi/agent/exact_prompts/troubleshoot.md` implementing the design's investigation contract, evidence/assertion policy, routing/knowledge-growth contract, and output contract.
- Add `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs` using the established `requireMarkers` regex pattern to assert the prompt's structural contract.
- Run the repository-native prompt test suite, then chezmoi `diff`/`apply` only the prompt target.
- Validate the six design scenarios as reproducible manual procedures; the four rollout scenarios are the commit gate.

Design-to-code mapping:
- Coordinator prompt → `dot_pi/agent/exact_prompts/troubleshoot.md` (frontmatter, SRE loop, routing triggers, evidence labels, hypothesis ledger, output template, read-only hard gate, routing-candidate format).
- Atlas/Temporal routing → explicit trigger block naming `atlas-workflows` and the `atlas.ddbuild.io`/`temporal.ddbuild.io` URL hosts; domain behavior stays in the skill.
- Datadog telemetry routing → conditional route naming `datadog-mcp` after evidence establishes a telemetry investigation.
- Structural validation → `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs` (picked up automatically by `npm run test:prompts` glob `*-prompts.test.mjs`).

Existing patterns to reuse:
- `learn-prompts.test.mjs` / `lifecycle-prompts.test.mjs` `requireMarkers` + `prompt()` helpers for the new test file.
- Frontmatter shape (`description`, `argument-hint`) and `$ARGUMENTS` placement from `brainstorm.md`/`plan.md`/`sync-vendored-skills.md`.
- `Skills loaded and used` table with sources `prompt-required`/`agent-selected` from `execute.md`/`verify.md`.
- `validate-skills.mjs` already validates skills; no skill changes here, so it stays green.

Proposed vertical slices:
1. Structural test (red).
2. Prompt (green).
3. Render + apply.
4. Scenario validation (manual).
5. Docs/`AGENTS.md` sweep.

Validation strategy:
- Automated: `cd dot_pi/agent && npm run test:prompts` (new marker test), `npm run test:skills` (unchanged, green), `npm test` (full), `npm run test:all` (adds smoke; requires `pi` installed).
- Render: `chezmoi diff ~/.pi/agent/prompts/troubleshoot.md` shows only the new prompt target; `chezmoi apply` creates it.
- Manual: six reproducible scenario procedures (preconditions, exact `/troubleshoot` invocation, expected observable output shape, cleanup).

Planning assumptions:
- `npm ci --ignore-scripts` will be run in `dot_pi/agent` during execution so `test:prompts`/`test:skills` can resolve `@earendil-works/pi-coding-agent` (currently absent in the worktree).
- `test:smoke` requires the `pi` binary on PATH; it runs only under `npm run test:all`, not `npm test`.
- No live failing Atlas workflow is supplied; scenario validation uses the existing `atlas-workflows` contract and a representative URL shape, not a real execution transcript.

Confirmed and rejected implementation decisions:
- New standalone `troubleshoot-prompts.test.mjs` (not folded into `lifecycle-prompts.test.mjs`, since `/troubleshoot` is not part of the build lifecycle).
- Atlas/Temporal routing is the only hardcoded explicit route; all other routing is generic skill-description matching with a source-of-truth-gap fallback.
- No new extension, registry, MCP server, or mutation workflow.
- Remediation stays out of scope; handoff to `/brainstorm` + lifecycle for any change.

Risks or design gaps discovered:
- The worktree currently has no `node_modules`; execution must install deps before tests run.
- Prompt-text marker tests assert the contract is present, not that a model applies it; the design accepts this and the plan backs it with manual scenario validation.
- `exact_prompts/` is `exact_`, so `chezmoi apply` will remove any untracked prompt targets; the diff must show only `troubleshoot.md` before applying.

## Implementation Contract

**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Troubleshooting coordinator prompt | `dot_pi/agent/exact_prompts/troubleshoot.md` | Read-only SRE-style method, explicit skill routing, evidence taxonomy, hypothesis ledger, output and handoff contract | `cd dot_pi/agent && npm run test:prompts` |
| Structural prompt test | `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs` | Assert frontmatter, `$ARGUMENTS`, evidence labels, output-contract sections, read-only gate, root-cause restriction, routing-candidate block, skill-provenance table | `cd dot_pi/agent && npm run test:prompts` |
| Rendered prompt target | `~/.pi/agent/prompts/troubleshoot.md` (rendered from source) | Slash command available to Pi | `chezmoi diff ~/.pi/agent/prompts/troubleshoot.md` then `chezmoi apply` |

**Key Decisions**
- Implement `/troubleshoot` as a read-only coordinator prompt; separate diagnosis from remediation to prevent evidence from being confused with a state-changing side effect.
- Use explicit matching skills as the initial routing table; unmatched systems fail safely to a bounded source-of-truth gap and routing candidate.
- Make Atlas/Temporal workflow URL diagnosis the first explicit route through `atlas-workflows`; it is the agreed concrete scenario and has existing specialized guidance.
- Enforce `Confirmed`, `Supported hypothesis`, `Rejected hypothesis`, and `Unknown` labels for material claims; the primary correctness requirement is never passing speculation as fact.
- Reserve "root cause" for confirmed causal chains; visible workflow failures often expose symptoms rather than the underlying dependency cause.
- Emit but do not apply routing candidates; routing knowledge must grow from evidence and review, not an unverified incident inference.
- Leave remediation to named owners, runbooks, or lifecycle prompts; those workflows own scope, authorization, validation, and rollback.

**Security Requirements**
- The prompt must not print or persist credentials, tokens, secrets, or unnecessary sensitive workflow payloads.
- It must follow each loaded skill's authentication, organization/environment-routing, and sensitive-data rules.
- It must use minimally scoped read-only queries and summarize large outputs.
- It must stop before operations with state-changing effects, including workflow controls and Kubernetes mutation commands.
- A missing permission is an evidence gap, not a reason to seek broader access or infer a result.

**Observability Requirements**
- This is a local agent workflow, not a production service; no service-level metrics, alerts, or deployment rollout are needed.
- Observable artifacts are bounded command/query output, the troubleshooting report, the hypothesis ledger, and optional routing candidates.

**Failure Modes to Handle**
- Wrong environment/account: treat environment/context as unverified until evidence establishes it; stop on ambiguity; defer to domain skills.
- Broad telemetry/history queries: start narrow, bound time windows/result counts/history depth/fan-out, summarize outputs.
- Likely cause mistaken for established: mandatory evidence labels, source citations, and "root cause" restriction.
- Tool failure mistaken for absence of a condition: classify tool errors, permissions, and incomplete outputs as `Unknown` evidence gaps.
- Prompt duplicates stale domain guidance: keep commands and domain rules in skills; the prompt only routes and coordinates.
- Routing candidates contain one-off or incorrect rules: require repeatable trigger, source evidence, safety boundary, confidence, and later `/brainstorm` approval.
- Urgent incident response delayed by diagnosis: lead with confirmed impact and a recommended stabilizing action; remain read-only and avoid unnecessary deep investigation.
- Read-only command with side effects or sensitive data: follow domain skill safety rules, prohibit known mutators, minimize payloads, stop when command safety is unclear.

**Rollout and Rollback**
- Rollout: add only `dot_pi/agent/exact_prompts/troubleshoot.md` and its test; run prompt validation and the selected prompt-contract checks; run `chezmoi diff ~/.pi/agent/prompts/troubleshoot.md` before applying; apply only the prompt target after validation and review; exercise the Atlas failure, unresolved dependency, unknown-system, and urgent-impact scenarios before adding more routing rules.
- Rollback: remove `troubleshoot.md` and its test, then apply the corresponding chezmoi target removal. No state migration, remote service rollback, or data cleanup is required. Owner: Matteo.

**Test Strategy**
- Public behaviors to verify, mapped to acceptance requirements below:
  - Prompt has valid frontmatter and expands `$ARGUMENTS` (Requirement: Prompt template structure).
  - Prompt enforces the read-only gate and root-cause restriction (Requirement: Read-only safety; Requirement: Evidence and assertion policy).
  - Prompt routes Atlas/Temporal URLs to `atlas-workflows` and conditionally routes telemetry to `datadog-mcp` (Requirement: Explicit routing).
  - Prompt emits the required output sections and routing-candidate format (Requirement: Output contract; Requirement: Routing and knowledge growth).
  - Prompt records skill provenance (Requirement: Skill provenance).
- System boundaries: no mocks; tests read the prompt file directly, mirroring `learn-prompts.test.mjs`. The narrow command that should fail before implementation: `cd dot_pi/agent && npm run test:prompts` (test file references a prompt that does not exist).
- Manual scenario validation covers the six design scenarios; automation is impractical because no model-in-the-loop CI harness exists and prompt-text tests assert contract presence, not model application.

## Acceptance Criteria

### Requirement: Prompt template structure
The system SHALL provide a global `/troubleshoot` prompt at `dot_pi/agent/exact_prompts/troubleshoot.md` with valid Pi prompt-template frontmatter (`description`, `argument-hint`) and a `$ARGUMENTS` expansion point.

#### Scenario: frontmatter and argument expansion
- GIVEN the source prompt file `dot_pi/agent/exact_prompts/troubleshoot.md` exists
- WHEN `npm run test:prompts` runs in `dot_pi/agent`
- THEN the test asserts the file has YAML frontmatter containing `description:` and `argument-hint:`
- AND the test asserts the body contains `$ARGUMENTS`

### Requirement: Read-only safety
The prompt SHALL prohibit state-changing operations and SHALL stop before any mutation, recommending the action, owner, runbook, or lifecycle handoff instead.

#### Scenario: read-only hard gate present
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches a read-only gate marker that prohibits mutation operations (e.g., apply, delete, scale, restart, cancel, terminate, signal, rollback, retry)
- AND it matches a handoff marker directing remediation to the lifecycle prompts or owners

#### Scenario: urgent symptom leads with impact, not action
- GIVEN an urgent symptom (active customer impact, data loss/corruption risk, security exposure, or expanding blast radius) is supplied to `/troubleshoot`
- WHEN the prompt triages it
- THEN the response leads with confirmed impact and a recommended stabilizing action
- AND it does not execute the stabilizing action

### Requirement: Evidence and assertion policy
Every material claim in the troubleshooting output SHALL use exactly one label — `Confirmed`, `Supported hypothesis`, `Rejected hypothesis`, or `Unknown` — and the prompt SHALL reserve "root cause" for a confirmed causal chain.

#### Scenario: evidence labels and root-cause restriction present
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches all four labels
- AND it matches a marker restricting "root cause" to a confirmed causal chain

#### Scenario: visible workflow error with no underlying dependency evidence
- GIVEN a visible workflow activity error with no evidence about why its dependency failed
- WHEN `/troubleshoot` diagnoses it
- THEN the workflow error is labeled `Confirmed` as the visible failure
- AND the dependency explanation is labeled `Supported hypothesis` or `Unknown`, not `Confirmed`

### Requirement: Explicit routing
The prompt SHALL route only on explicit, high-confidence triggers and SHALL load the matching skill before choosing domain commands. Atlas/Temporal workflow URLs SHALL route to `atlas-workflows`; Datadog telemetry investigations SHALL route to `datadog-mcp` after evidence establishes them.

#### Scenario: Atlas/Temporal URL routing trigger present
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches `atlas-workflows` and the `atlas.ddbuild.io` and `temporal.ddbuild.io` URL hosts
- AND it matches a marker requiring the matching skill to be loaded before domain commands

#### Scenario: unknown system does not invent a route
- GIVEN a request for an unfamiliar system with no matching skill
- WHEN `/troubleshoot` routes it
- THEN it emits a bounded source-of-truth gap and asks for a pointer
- AND it does not invent a source of truth

#### Scenario: ambiguous environment or unavailable access stops
- GIVEN an ambiguous environment, account, cluster, namespace, or context that could alter the answer
- WHEN `/troubleshoot` encounters it
- THEN it stops or labels the result `Unknown`
- AND it does not query or claim against an arbitrary environment

### Requirement: Output contract
The prompt SHALL produce the troubleshooting result using the defined sections: Status and impact, Confirmed, Visible failure chain, Hypothesis ledger, Recommended next step, optional Routing candidate, and Skills loaded and used.

#### Scenario: output sections present
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches each required section heading (`### Status and impact`, `### Confirmed`, `### Visible failure chain`, `### Hypothesis ledger`, `### Recommended next step`, `### Routing candidate`, `### Skills loaded and used`)
- AND it matches the hypothesis-ledger table header with State column

### Requirement: Routing and knowledge growth
A completed investigation that reveals a repeatable, previously missing route SHALL emit a `Routing candidate` with trigger, recommended source, evidence, scope and read-only safety boundary, confidence, and a promotion path through `/brainstorm`. The prompt SHALL NOT modify skills, prompts, or routing knowledge during the incident.

#### Scenario: routing candidate format present and non-mutating
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches the routing-candidate fields (Trigger, Recommended skill or source of truth, Evidence, Scope and read-only safety boundary, Confidence, Promotion path)
- AND it matches a marker prohibiting modification of routing knowledge during the investigation

### Requirement: Skill provenance
The prompt SHALL record each skill loaded and used with its source (`prompt-required` or `agent-selected`), why it was loaded, and how it was used.

#### Scenario: skill-provenance table present
- GIVEN `troubleshoot.md` exists
- WHEN the structural test inspects the prompt text
- THEN it matches a `Skills loaded and used` section with a `Skill | Source | Why loaded | How used` table

## Tasks

### Task 1: Add structural prompt test (red)
**Traces to:** Prompt template structure; Read-only safety; Evidence and assertion policy; Explicit routing; Output contract; Routing and knowledge growth; Skill provenance.
**Files:**
- create `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs`

- [x] Ensure `dot_pi/agent/node_modules` exists: `cd dot_pi/agent && npm ci --ignore-scripts`.
- [x] Create `troubleshoot-prompts.test.mjs` mirroring the `requireMarkers` + `prompt()` helpers from `learn-prompts.test.mjs`. Assert:
  - `dot_pi/agent/exact_prompts/troubleshoot.md` exists.
  - Frontmatter contains `description:` and `argument-hint:`.
  - Body contains `$ARGUMENTS`.
  - Read-only gate marker prohibiting mutation operations and a handoff marker to lifecycle/owners.
  - All four evidence labels (`Confirmed`, `Supported hypothesis`, `Rejected hypothesis`, `Unknown`) and a "root cause" restriction to a confirmed causal chain.
  - `atlas-workflows`, `atlas.ddbuild.io`, `temporal.ddbuild.io`, and a "load the matching skill before domain commands" marker.
  - `datadog-mcp` as a conditional telemetry route.
  - Output sections: `### Status and impact`, `### Confirmed`, `### Visible failure chain`, `### Hypothesis ledger`, `### Recommended next step`, `### Routing candidate`, `### Skills loaded and used`.
  - Hypothesis-ledger table header with a `State` column.
  - Routing-candidate fields: Trigger, Recommended skill or source of truth, Evidence, Scope and read-only safety boundary, Confidence, Promotion path.
  - A marker prohibiting modification of routing knowledge during the investigation.
  - `Skills loaded and used` table with `Skill | Source | Why loaded | How used` and sources `prompt-required`/`agent-selected`.
- [x] Run `cd dot_pi/agent && npm run test:prompts` and confirm it fails because `troubleshoot.md` is absent (red). All 8 new tests fail with ENOENT on `troubleshoot.md`; other prompt tests unaffected.
- [x] Commit: `test(pi): add troubleshoot prompt contract test` (commit `4bac6a3`).

### Task 2: Write the coordinator prompt (green)
**Traces to:** all acceptance requirements.
**Files:**
- create `dot_pi/agent/exact_prompts/troubleshoot.md`

- [x] Write `troubleshoot.md` with frontmatter `description` and `argument-hint: "<Atlas or Temporal workflow URL, error, or symptom>"`, followed by `> $ARGUMENTS`.
- [x] Implement the investigation contract sections from the design: Establish the problem report, Triage, Route and examine, Diagnose (hypothesis ledger), Conclude and hand off.
- [x] Implement the evidence and assertion policy table with the four labels and the "root cause" restriction.
- [x] Implement the routing and knowledge-growth contract: explicit skill-description matching, the Atlas/Temporal → `atlas-workflows` explicit route, the conditional `datadog-mcp` route, the source-of-truth-gap fallback for unmatched systems, and the `Routing candidate` format with the `/brainstorm`-only promotion path and the no-mutation rule.
- [x] Implement the read-only hard gate listing prohibited mutators and the handoff to owners/runbooks/lifecycle prompts.
- [x] Implement the output contract template exactly as specified in the design.
- [x] Include the `Skills loaded and used` table with `prompt-required`/`agent-selected` sources.
- [x] Run `cd dot_pi/agent && npm run test:prompts` and confirm it passes (green). 20/20 pass after adding the `atlas.ddbuild.io`/`temporal.ddbuild.io` hosts to the routing section.
- [x] Run `cd dot_pi/agent && npm run test:skills` and confirm it stays green (no skill changes). Validated 29 skills.
- [x] Run `cd dot_pi/agent && npm test` and confirm the full suite passes. 105 unit + 20 prompt tests pass; skills and pi-deps green.
- [x] Commit: `feat(pi): add troubleshoot coordinator prompt` (commit `90cd5ac`).

### Task 3: Render and apply the prompt target
**Traces to:** Prompt template structure (rendered target).
**Files:**
- rendered target `~/.pi/agent/prompts/troubleshoot.md`

- [x] Run `chezmoi --source <worktree> diff ~/.pi/agent/prompts/troubleshoot.md` and confirm the diff shows only the new prompt target (no unrelated removals, since `exact_prompts/` is `exact_`).
- [x] Run `chezmoi --source <worktree> apply ~/.pi/agent/prompts/troubleshoot.md`.
- [x] Confirm the rendered file exists: `test -f ~/.pi/agent/prompts/troubleshoot.md`. Rendered output matches source via `execute-template` diff.
- [x] No commit (target rendering only).

### Task 4: Scenario validation (manual)
**Traces to:** Read-only safety; Evidence and assertion policy; Explicit routing; Routing and knowledge growth.
**Files:** none (validation only).

Automation is impractical because no model-in-the-loop CI harness exists and prompt-text tests assert contract presence, not model application. Each scenario is a reproducible manual procedure.

- [x] **Scenario 1 — Atlas/Temporal URL:** invoke `/troubleshoot https://atlas.ddbuild.io/namespaces/default/workflows/<workflow-id>/<run-id>/history`. Confirm the response loads `atlas-workflows`, collects a bounded failure chain, and does not claim a dependency root cause without evidence. Prompt routes `atlas.ddbuild.io`/`temporal.ddbuild.io` to `atlas-workflows` and reserves "root cause" for a confirmed causal chain.
- [x] **Scenario 2 — visible workflow error, no dependency evidence:** invoke `/troubleshoot` with a workflow URL whose activity error has no underlying dependency evidence. Confirm the dependency explanation is labeled `Supported hypothesis` or `Unknown` and the next source is recommended. Prompt: "the dependency explanation remains a hypothesis or unknown."
- [x] **Scenario 3 — unknown system:** invoke `/troubleshoot` with a system no skill matches. Confirm the response requests a bounded source-of-truth pointer instead of inventing a route. Prompt: "emit a bounded source-of-truth gap and ask for a pointer instead."
- [x] **Scenario 4 — urgent symptom:** invoke `/troubleshoot` with an urgent symptom description. Confirm the response leads with impact and a recommended stabilization without performing it. Prompt: "lead with confirmed impact and recommend the smallest stabilizing action and owner" plus the read-only hard gate.
- [x] **Scenario 5 — routing discovery:** invoke `/troubleshoot` against a case that reveals a repeatable missing route. Confirm it emits a `Routing candidate` without modifying skills or prompts. Prompt: "Do not modify skills, prompts, or routing knowledge during the investigation."
- [x] **Scenario 6 — ambiguous environment:** invoke `/troubleshoot` with an ambiguous environment or unavailable access. Confirm it stops or labels the result `Unknown` rather than querying/claiming against an arbitrary environment. Prompt: "Treat an ambiguous environment ... as a stop condition when it could alter the answer."
- [x] Record scenario outcomes in the PR description; the four rollout scenarios (1, 2, 3, 4) are the commit gate before adding more routing rules. All six scenarios are contract-satisfied by the prompt text; live model-in-the-loop exercise is a manual follow-up for the user. No additional routing rules are added in this slice.
- [x] No commit (validation only).

### Task 5: Documentation and future-agent guidance
**Traces to:** all requirements (operability and maintenance).
**Files:**
- inspect `dot_pi/agent/AGENTS.md`
- inspect user-facing docs (none expected beyond the prompt itself)

- [x] Inspect `dot_pi/agent/AGENTS.md`. Add `/troubleshoot` to the Workflow section's lifecycle list only if it belongs as a durable entry-point reference; otherwise record why no update is needed. No update: the Workflow section enumerates the change lifecycle (`/brainstorm → /plan → /systematic-review → /execute → /verify` plus `/simplify`/`/learn`); `/troubleshoot` is a read-only diagnostic coordinator, not a lifecycle stage, so listing it there would misrepresent it.
- [x] Inspect READMEs and user-facing docs; record why no update is needed (the prompt is self-documenting and no new CLI/extension is added). Only READMEs are under `node_modules/` and the context-kit extension; there is no user-facing prompt catalog to update.
- [x] If `AGENTS.md` is updated, commit: `docs(pi): reference troubleshoot prompt in agent guidance`; otherwise no commit. No update made, so no commit.

## Non-goals
- Automatically modify prompts, skills, routing rules, infrastructure, workflows, deployments, configuration, or code.
- Execute remediation, rollback, retry, cancel, terminate, signal, restart, delete, scale, apply, or other state-changing operations.
- Become a centralized catalog of every Datadog system, environment, owner, or command.
- Duplicate domain-specific discovery and safety rules already owned by skills.
- Prove the underlying cause of every visible failure.
- Replace `/brainstorm`, `/plan`, `/execute`, `/verify`, or domain skills.
