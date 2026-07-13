# Pi Verification Contract Design
## Status
Approved on 2026-07-13.

## Problem
Pi's execution workflow can report completion using only checks and judgment performed by the implementing agent. There is no distinct final gate that requires fresh deterministic evidence and, for behavior-bearing changes, review by a different model. This permits plausible but unverified success claims and leaves no consistent closeout path after `/execute`.

## User and audience
The primary user is Matteo, using Pi in this dotfiles repository and across other codebases. Future Pi sessions are also an audience because the contract must be understandable without relying on this conversation.

## Goals
- Add a reusable `/verify` closeout contract that returns an honest `VERIFIED` or `BLOCKED` verdict after `/execute`.
- Require fresh, layered deterministic evidence selected from the actual change and repository guidance.
- Require independent semantic review by a different model for every behavior-bearing change.
- Trace plan acceptance scenarios to implementation, adequate tests, and fresh passing output.
- Keep verification read-only and separate from implementation and repair.
- Keep false positives low by blocking only on evidence-backed regressions attributable to the selected change or unresolved material concerns.
- Make `/execute` hand off to `/verify` instead of treating execution-time checks as final independent verification.

## Non-goals
- Build workflow presets or automatically switch model, thinking level, system instructions, or tools.
- Add a verification extension, configuration file, or general-purpose orchestration framework.
- Replace `/systematic-review` as the skeptical pre-execution plan or code review gate.
- Let `/verify` edit, format, repair, commit, push, or apply changes.
- Support PR URLs, arbitrary remote branches, or every possible target mode in the first slice.
- Add `/workflow` or `/route`.
- Update `/brainstorm`, `/plan`, `/systematic-review`, or general AGENTS guidance unless planning discovers a necessary durable repository rule.
- Run every possible check in every repository.

## Context reviewed
- Pi prompt-template documentation: templates define prompt behavior but do not switch the active model, thinking level, or tool set.
- `dot_pi/agent/exact_prompts/brainstorm.md`: lifecycle framing and durable design workflow.
- `dot_pi/agent/exact_prompts/plan.md`: Given/When/Then acceptance requirements, requirement-to-task traceability, and fresh verification expectations.
- `dot_pi/agent/exact_prompts/systematic-review.md`: read-only skeptical review before execution, including plan and code review.
- `dot_pi/agent/exact_prompts/execute.md`: execution-time checks, plan ledger, PR handoff, and current completion claim.
- `dot_pi/agent/exact_prompts/codex-review.md` and `codex-adversarial-review.md`: existing independent semantic-review mechanisms and base-resolution conventions.
- `AGENTS.md` and `dot_pi/agent/AGENTS.md`: chezmoi source-of-truth, surgical-change, worktree, test, apply, and commit guidance.
- `dot_pi/agent/package.json`: Pi-agent resource tests and smoke tests.
- `plans/CMPT-4007/plan.md` at commit `c69b30cf6ea4cf6f04aa9bc31a501b99595cff33` in `DataDog/k8s-authorization-webhook-hardware-gate`: representative plan with normative requirements and multiple observable Given/When/Then scenarios.

### Unavailable or deferred evidence
- No workflow-preset implementation was evaluated because preset enforcement is explicitly deferred.
- The exact independent-review command and model metadata interface will be confirmed during planning; the contract requires proof of model separation regardless of mechanism.
- `maat` invocation details were not fixed because applicability and diff-mode syntax vary by repository and should be discovered from the selected repository.

## Current behavior
`/execute` reviews the plan, implements it, runs task and final checks, inspects repository state, and can open a draft PR. It then reports that implementation is finished. Those checks are useful execution evidence, but the implementing model remains the only semantic judge unless the user separately invokes a reviewer.

`/systematic-review` is intentionally review-only and is positioned as the authoritative pre-execution plan-validation gate. It does not provide post-implementation requirements traceability, fresh closeout checks, or guaranteed model separation.

Existing Codex review prompts can provide an independent semantic pass, but they are not tied to a final deterministic verification contract and do not close the `/execute` workflow automatically.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| Prompt-only verification is useful before presets exist | Existing prompts already encode lifecycle gates successfully | The contract could be ignored or applied inconsistently | Exercise representative scenarios and observe real usage before adding an extension |
| Pi can identify the implementation and reviewer models, or establish separation through available metadata | Current session and independent-review mechanisms expose model choices in normal operation | Behavior-bearing changes would remain blocked when identity is unavailable | Planning must confirm available metadata; the contract fails closed when it cannot prove separation |
| Plans and current task context provide a trustworthy requirements baseline | `/plan` now emits normative requirements and observable scenarios | Verification could validate the wrong behavior when inputs conflict or are stale | Read the plan, sibling design, current task context, and diff; block on material ambiguity or contradiction |
| Repository guidance and changed files are enough to select relevant deterministic checks | Existing plans, AGENTS files, build metadata, and package scripts name checks | Important validators could be omitted | Require the verifier to record selected, skipped, unavailable, and inapplicable checks with reasons |
| A read-only verifier can run tests and builds without intentionally changing source | Most repository checks support non-fix modes | Commands may mutate generated files or the checkout | Snapshot repository state before checks and block on unexpected final-state changes |
| Independent semantic findings can be triaged without reintroducing excessive trust | Findings can be checked against the diff, tests, code, and command output | The implementing model could dismiss valid review findings | Preserve every material finding and rationale; block when a material concern cannot be confidently validated or dismissed |

## Design overview
Add one global Pi prompt, `/verify`, and make the smallest corresponding handoff change to `/execute`.

`/execute` remains responsible for implementing the approved slice, running narrow and broad execution checks, updating the plan ledger, and preparing the implementation candidate. It must no longer imply that its own checks constitute final independent verification. Its terminal handoff directs the user to `/verify`, passing the plan path when one exists.

`/verify` independently evaluates the candidate in five phases:
1. Resolve the target, requirements source, base, and complete change scope.
2. Classify whether the diff is behavior-bearing and select required verification layers.
3. Run fresh deterministic and requirements-traceability checks without intentional mutation.
4. For behavior-bearing changes, obtain semantic review from a provably different model and validate its findings against evidence.
5. Compare final repository state with the initial snapshot and emit exactly one verdict: `VERIFIED` or `BLOCKED`.

A run may stop before expensive semantic review when an earlier prerequisite already blocks. A `VERIFIED` result requires every applicable layer to complete successfully in the same fresh run.

## Target and scope resolution
The first slice supports two entry modes:
- An optional `plan.md` path, resolved to its owning worktree with the existing worktree-resolution skill.
- No path, meaning the current checkout and current task or conversation context.

The verifier establishes the immediate comparison base using available stack-aware evidence: explicit plan or task context, git-machete parent, open-PR base, then repository default branch. It must not silently choose among conflicting bases. An ambiguous base results in `BLOCKED`.

The complete candidate includes:
- commits on the selected branch relative to the base;
- staged changes;
- unstaged changes; and
- intended untracked files.

A clean checkout with no candidate change is not a successful verification target. The verifier reports `BLOCKED` because there is nothing attributable to verify.

PR URLs and arbitrary remote branches are deferred. They can reuse the target-resolution patterns in the existing Codex prompts if later demand justifies the extra interface.

## Requirements baseline and scenario traceability
For plan-backed work, the verifier reads the complete `plan.md` and its sibling `design.md` when present. The design remains the source of truth for intended behavior; the plan supplies the implementation contract, normative requirements, and acceptance scenarios. Material contradictions or stale requirements that prevent a confident baseline result in `BLOCKED`.

For each Given/When/Then acceptance scenario, the verifier must establish:
- the implementation path responsible for the behavior;
- an automated test or other supported executable check that observes the stated outcome;
- fresh passing output from the covering command; and
- semantic agreement among the requirement, test, and implementation.

One table-driven test or command may cover multiple scenarios. The contract requires evidence and traceability, not one test function per scenario. Plan checkboxes, old logs, and prior `/execute` output are context only and never substitute for fresh evidence.

The verifier blocks when a scenario lacks evidence, a test only resembles the scenario without exercising its observable behavior, implementation contradicts the scenario, or the fresh check fails. Passing requirements may be summarized by requirement; scenario-level detail is required for gaps and failures.

For work without a plan, the current task or conversation is the requirements baseline. The verifier must not infer intended behavior solely from the implementation diff. If the intended behavior cannot be established confidently, it returns `BLOCKED`. This preserves `/execute`'s trivial-work path without requiring a plan for every small change.

## Risk classification
Independent semantic review is required for any behavior-bearing change, including:
- application or library code;
- shell scripts and executable automation;
- infrastructure, Kubernetes, CI, permissions, or security configuration;
- Pi prompts, skills, extensions, and agent instructions;
- dependency or runtime configuration; and
- mixed diffs containing any behavior-bearing file.

Semantic review may be skipped only when the entire diff is demonstrably non-behavioral, such as:
- prose-only documentation;
- design and plan artifacts;
- comments or spelling-only changes;
- formatting-only changes; or
- mechanical generated-output updates already validated against their source.

Classification is based on observable effect, not file extension. A Pi Markdown prompt is behavior-bearing; ordinary explanatory Markdown may not be. Every skip requires a written rationale in the report.

## Deterministic verification layers
The verifier selects checks from the change rather than applying one universal command list.

### Repository state and scope
- Record branch, HEAD, base, status, staged/unstaged/untracked state, and the complete candidate diff.
- Confirm the selected diff matches the intended task and contains no unexplained unrelated changes.
- Preserve this snapshot for the final side-effect comparison.

### Universal hygiene
- Run `git diff --check` over the complete applicable change.
- Treat whitespace errors and conflict markers as blocking failures.

### Declared checks
- Rerun commands required by the plan, repository guidance, affected package, or implementation contract.
- Missing required tooling or credentials block verification rather than becoming a silent skip.

### Change-specific checks
- Select applicable tests, build commands, type checks, linters, validators, schema checks, and security checks from changed files and repository conventions.
- Use non-fixing modes. Do not run formatter or linter write modes.
- Record why optional checks are applicable, inapplicable, unavailable, or skipped.

### Structural regression checks
- Run structural tools such as `/Users/matteo.ruina/dd/maat` in diff mode when the repository and change are supported.
- Treat unsupported or genuinely inapplicable structural tooling as a recorded skip, not a universal failure.
- A tool required by repository guidance or the plan is not optional and blocks when unavailable.

### Chezmoi checks
For chezmoi-managed changes, run targeted `chezmoi diff` against the resolved source worktree. Because the configured default source may be the base checkout rather than the feature worktree, verification must explicitly select the resolved source directory, for example through chezmoi's `--source` option. Never run `chezmoi apply` from `/verify`.

### Side-effect check
Compare final repository state with the initial snapshot. Any unexpected tracked or untracked change caused by verification blocks the run and is reported. Expected caches outside the repository do not violate read-only behavior; intentional source mutation does.

## Independent semantic review
Behavior-bearing changes require a semantic review produced by a model different from the model that implemented the change. A separate invocation of the same model does not satisfy this requirement.

The verifier must record the implementation model and review model when discoverable. If either identity is unavailable or separation cannot be established, the result is `BLOCKED`. A future preset extension should make this selection automatic, but the prompt-only first slice fails closed rather than pretending to enforce it.

The reviewer receives the requirements baseline, selected base and diff, relevant tests, and deterministic evidence. It focuses on new correctness, security, operability, compatibility, and maintainability regressions attributable to the candidate. It also compares acceptance scenarios with both tests and implementation so a passing but tautological or incomplete test does not establish false confidence.

An existing Codex review mechanism is the likely first implementation path when its model differs from the implementation model. The contract is mechanism-neutral so a different independent reviewer can be used when Codex would violate model separation.

## Finding policy and false-positive control
The verifier blocks on:
- deterministic or requirements-traceability failures;
- confirmed new correctness, security, operability, compatibility, or material maintainability regressions;
- actionable findings attributable to the candidate; and
- unresolved high-confidence material concerns.

The verifier does not block on:
- demonstrably pre-existing issues;
- findings outside the selected diff;
- duplicate findings;
- unsupported speculation; or
- subjective style preferences without repository-policy support.

Semantic findings must be validated against the diff, code, tests, type information, repository rules, or fresh command output before classification. No material reviewer finding may be silently discarded. Non-blocking and rejected findings are recorded with concise evidence and rationale. If a material concern cannot be confidently validated or dismissed, uncertainty produces `BLOCKED`, not success.

## Read-only and failure behavior
`/verify` must not:
- edit or generate source files intentionally;
- run formatter or linter fix modes;
- repair a finding;
- update plan checkboxes;
- stage, commit, push, open or update a PR;
- run `chezmoi apply`; or
- change branches or detach HEAD in the selected worktree.

A failure hands control back to `/execute` or to the user for a scoped repair. After any repair, `/verify` starts again from repository discovery and reruns every required successful layer. It does not reuse prior green output to claim a fresh verdict.

Commands from an untrusted or suspicious diff must be inspected before execution. If safe execution cannot be established, the verifier blocks and reports the command rather than running it.

## Output contract
Every run ends with one top-level verdict:
- `VERIFIED`: all applicable layers completed with fresh evidence, no blocking findings remain, model separation was proven when required, and repository state was not unexpectedly changed.
- `BLOCKED`: a prerequisite, check, evidence requirement, independence requirement, side-effect check, or material finding prevents a trustworthy success claim.

The report includes:
- target worktree, branch, HEAD, base, and diff scope;
- requirements source and traceability summary;
- risk classification and semantic-review decision;
- each deterministic command, result, and relevant output summary;
- implementation and reviewer model identities when semantic review is required;
- blocking findings;
- non-blocking or rejected findings with rationale;
- skipped or unavailable checks with reasons;
- initial/final repository-state comparison; and
- the next action without making edits.

Output should be concise when green. Detailed evidence is concentrated on failures, gaps, skips, and disputed findings.

## Components and boundaries
| Component | File | Responsibility |
|---|---|---|
| Verification contract | `dot_pi/agent/exact_prompts/verify.md` | Target resolution, requirements traceability, layered checks, independent review, verdict, and read-only boundaries |
| Execution handoff | `dot_pi/agent/exact_prompts/execute.md` | Stop treating executor-only checks as final verification and direct the completed candidate to `/verify` |

No extension, configuration file, shared helper, or additional workflow prompt is part of this slice.

## Alternatives considered
### Add only `/verify` without changing `/execute`
This is the smallest file change and allows experimentation without touching a mature workflow. It was rejected because the command would remain disconnected from the lifecycle and `/execute` would continue to imply finality before independent verification.

### Build workflow presets first
Presets can reliably select a different model, effort level, tools, and system mode, which is stronger enforcement than prompt text. This remains the best likely follow-up, but it is deferred because the desired verification behavior should be defined and exercised before adding routing machinery.

### Use a fixed universal command list
A fixed list is predictable, easy to document, and easy to compare across runs. It was rejected because it would be too weak for some repositories and noisy or unavailable in others. A small universal baseline plus change-aware checks provides more useful evidence.

### Make `/systematic-review` the final gate
Reusing one command reduces workflow surface and keeps review logic centralized. It was rejected because pre-execution skepticism and post-execution proof have different inputs, evidence, and verdict semantics. Combining them would weaken separation of concerns.

### Let `/verify` fix small failures
Automatic repair is convenient and could shorten the loop. It was rejected because it merges reviewer and implementer roles, invalidates earlier evidence, and makes it unclear which state was actually verified.

### Require semantic review for every diff
Uniform review avoids classification mistakes and creates one simple rule. It was rejected because prose-only and mechanical changes would incur cost and reviewer noise without proportionate risk. The chosen behavior-bearing boundary is stricter where files affect runtime or agent behavior.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Prompt text cannot enforce model selection | Fail closed when model separation is not proven; add presets only after the contract is validated |
| Verifier trusts tests written to match a flawed implementation | Independently compare requirement, test, and implementation; require observable scenario coverage |
| Review findings create excessive noise | Require diff attribution and evidence; separate blocking, non-blocking, rejected, and pre-existing findings |
| Risk classification skips a behavior-bearing Markdown or config change | Classify observable effects rather than extensions; explicitly list Pi prompts, skills, and config as behavior-bearing |
| Test or build command mutates the checkout | Use non-fix modes and compare initial/final repository state |
| Verifier runs chezmoi against the wrong source checkout | Explicitly pass the resolved worktree as chezmoi's source directory |
| Required check is unavailable | Block and report the missing dependency instead of weakening the gate |
| Verification becomes slow and expensive | Run cheap prerequisites first; skip semantic review on wholly non-behavioral diffs; allow concise green summaries |
| Plan and implementation context disagree | Treat design and plan as requirements sources and block on material ambiguity rather than inventing intent |
| Same model is invoked through a different tool and mislabeled independent | Compare actual model identity, not process or provider name alone |

## Operability and maintenance
This is a local developer workflow, not a production service. It requires no metrics, alerts, dashboards, or on-call runbook. Its observable artifacts are command output, reviewer output, the final verification report, and unchanged repository state.

The prompt owner maintains the risk boundary, evidence rules, and integrations with existing Pi workflows. Repository-specific commands remain owned by each repository's plans, AGENTS files, build metadata, and tooling. The prompt should discover those commands rather than accumulate a central hard-coded catalog.

If `/verify` frequently blocks because model identity is unavailable, that is evidence to prioritize the preset extension. If it frequently produces non-actionable semantic findings, refine review framing and evidence thresholds before adding more reviewers.

## Rollout
1. Add `/verify` and the minimal `/execute` handoff in one reviewable change.
2. Run Pi-agent validation and inspect targeted chezmoi rendering from the feature worktree.
3. Apply only the two prompt targets after review.
4. Exercise the contract on representative behavior-bearing and non-behavioral changes.
5. Observe false positives, missing checks, model-identity failures, and runtime cost before designing presets.

## Rollback
- Revert the `/execute` handoff change to restore the current terminal workflow.
- Remove `verify.md` and apply the two affected chezmoi prompt targets.
- No state migration, persistent data, or remote service rollback is required.

## Security and data handling
- Verification may execute repository tests and scripts, so it must inspect commands introduced by untrusted or suspicious diffs before running them.
- Independent review receives only repository context needed for the selected change and must follow existing secret-handling rules.
- Command output and reports must not reproduce credentials, tokens, private keys, or unrelated sensitive environment data.
- `/verify` gains no mutation authority and does not apply chezmoi state.
- Security-sensitive changes are always behavior-bearing and cannot skip independent review.

## Testing strategy
Validate the prompt contract structurally and through representative scenarios.

### Repository validation
- Run the Pi agent's resource tests from `dot_pi/agent`.
- Run the broader smoke suite when practical.
- Run targeted `chezmoi --source <feature-worktree> diff` for `~/.pi/agent/prompts/verify.md` and `~/.pi/agent/prompts/execute.md`.
- Confirm no target outside those prompts would be applied by the implementation slice.

### Contract scenarios
- Behavior-bearing change with a clear requirements baseline, proven different reviewer model, passing deterministic checks, adequate scenario coverage, and no findings results in `VERIFIED`.
- Behavior-bearing change with an unavailable, unknown, or identical reviewer model results in `BLOCKED`.
- A deterministic check failure results in `BLOCKED` with fresh command evidence.
- A plan scenario without an adequate test or observable evidence results in `BLOCKED`.
- A passing test that contradicts or incompletely covers its Given/When/Then scenario results in `BLOCKED` after semantic comparison.
- A prose-only change may skip semantic review with explicit rationale and become `VERIFIED` when all applicable checks pass.
- A Pi Markdown prompt change is classified as behavior-bearing despite its `.md` extension.
- An optional inapplicable check is reported as skipped, while a missing required check results in `BLOCKED`.
- A verification command that changes repository state results in `BLOCKED`.
- A material reviewer concern that cannot be validated or dismissed results in `BLOCKED`.
- After a repair, prior passing evidence is not reused; a fresh successful run is required.

## Self-review notes
The design was reviewed skeptically against simplicity, enforceability, false-positive risk, and the existing lifecycle.

- **Accepted concern:** prompt-only model separation is weaker than preset enforcement. The design makes this limitation explicit and fails closed instead of claiming enforcement it cannot prove.
- **Accepted concern:** scenario traceability can duplicate `/execute` work. The duplication is intentional because final verification needs fresh evidence and an independent comparison of requirements, tests, and implementation.
- **Accepted concern:** nominally read-only test commands can mutate a checkout. Initial/final state comparison and non-fix command selection make mutation visible and blocking.
- **Rejected finding:** semantic review should be mandatory for all diffs to avoid classification errors. This would add recurring cost and noise for design docs and mechanical changes; explicit behavior-based classification is a smaller control with acceptable residual risk.
- **Rejected finding:** the first slice should include presets because unknown model identity can block useful work. That would combine contract design with routing implementation before real usage validates the contract. A transparent blocked result is preferable in the first slice.

## Decision records
- Decision: ship `/verify` together with a minimal `/execute` handoff. Rationale: the pair creates a closed lifecycle while remaining a two-prompt slice.
- Decision: keep `/verify` strictly read-only. Rationale: repairs invalidate evidence and belong to the executor role.
- Decision: require independent semantic review only for behavior-bearing changes. Rationale: this preserves zero-trust review where behavior can regress without imposing disproportionate cost on wholly non-behavioral diffs.
- Decision: require a provably different model, not merely a separate invocation. Rationale: process separation alone does not satisfy the stated trust boundary.
- Decision: use layered, change-aware deterministic checks. Rationale: a universal baseline is necessary but insufficient across heterogeneous repositories.
- Decision: treat Given/When/Then scenarios as verification contracts. Rationale: passing tests are trustworthy only when they demonstrably cover intended observable behavior.
- Decision: return only `VERIFIED` or `BLOCKED`. Rationale: a binary terminal contract prevents warnings and uncertainty from being presented as success.
