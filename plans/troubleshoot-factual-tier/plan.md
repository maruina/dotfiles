# Troubleshoot Factual Tier Implementation Plan
**Goal:** Make runtime facts constrain troubleshooting hypotheses while preserving bounded, read-only investigation.
**Smallest user-feedback slice:** One prompt update with focused contract tests and a draft PR.
**Out of Scope:** Mandatory subagents, automatic reproduction, expanded production access, changes to domain skills, and changes to the read-only gate.
**Architecture:** Preserve the existing evidence labels, hypothesis ledger, routing, and handoff. Add stable factual references and explicit rules for comparison, validation, and stalled investigations.
**Tech Stack:** Markdown prompt and Node.js contract tests.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | agent-selected | Prompt work | Selected relevant guidance |
| `codebase-research` | skill-loader | Existing prompt and tests | Located the supported contract-test seam |
| `write` | skill-loader | Prompt prose | Kept instructions direct and bounded |
| `chezmoi` | skill-loader | Managed prompt | Kept edits in source; target preview only until independent verification |
| `feature-worktree` | agent-selected | Feature branch | Isolated writes from main |
| `reviewable-pr-workflow` | skill-loader | Requested PR | One focused draft PR with validation evidence |

## Scope
- [x] Add focused failing contract tests in `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs` for the approved investigation rules.
- [x] Update `dot_pi/agent/exact_prompts/troubleshoot.md`: maintain factual IDs and provenance; seek an optional trustworthy control; validate the leading hypothesis against all material facts; use a matrix only for ambiguity or stalled progress; refine hypotheses before collecting another bounded discriminating observation; check contradictions and necessary contributing causes.
- [x] Preserve existing labels and output headings. Show factual IDs in the existing Confirmed section and reference them in the hypothesis ledger. Prefer runtime evidence before targeted deployed-source inspection. Assess supplied reproduction evidence without executing a state-changing reproduction.
- [x] Run focused tests, install dependencies with `npm ci --ignore-scripts`, then run `npm test` and `npm run test:all`.
- [ ] Remove disposable source dependencies after both suites finish. Tool safety policy blocked recursive deletion; manual cleanup remains.
- [x] Review the complete diff, preview explicit chezmoi targets, commit with `feat(pi): constrain troubleshooting hypotheses with factual evidence`, push, and open a draft PR. Leave target apply and final independent `/verify` pending.

## Validation
- Given an incident report, when hypotheses are evaluated, the prompt must require stable factual IDs, collection provenance, and all-material-fact coverage that distinguishes explained facts from compatibility and contradiction.
- Given no trustworthy control or blocked evidence access, the prompt must record the gap without inventing a control, changing state, or expanding collection without bounds.
- Given stalled progress or several surviving explanations, the prompt must require refinement and discriminating evidence rather than an unbounded hypothesis search, with an optional matrix.
- Given a proposed root cause or supplied reproduction, the prompt must check contradictory observations, necessary combined causes, deployed revision, and incident-signal parity without treating survival alone as proof.
- The Node contract tests check instruction presence, not live model compliance. Semantic review remains necessary.
- Documentation impact: the prompt is the user-facing behavior contract; no separate README or AGENTS change is needed.
- Rollout: apply only the changed explicit target files after independent verification. Rollback: restore the prior prompt source and reapply those targets.

## Execution evidence
- Focused tests: added contracts failed before the prompt change; all 17 passed afterward.
- `npm ci --ignore-scripts` passed; npm reported 7 dependency audit findings. No dependency changes were made.
- `npm test` and `npm run test:all` both stopped at the existing `PR commands have distinct roles and aligned review artifacts` test. It requires `post one @codex review comment` in the unchanged PR-create prompt. A focused run on unchanged main reproduced the failure. Each run passed 209 unit tests and 70 of 71 prompt tests; downstream suites were not reached.
- `git diff --check` passed. Targeted chezmoi diff was collected for the prompt and its test file; neither target was applied.
- Self-review found no blocking issue in the scoped diff. Contract tests validate instructions, not actual model compliance. Independent verification remains pending and the PR must remain a draft.

## Approved follow-up: progressive signal discovery
- [x] Make layer discovery concrete: collect from the next relevant layer or dependency only when explanations still fail or cannot be distinguished; include application, network, process/thread, and kernel examples without a fixed checklist.
- [x] Stop descending once explanations can be distinguished, then validate all material facts. Preserve access, safety, and query limits.
- [x] Add a focused contract test and run it red before the prompt change, then green: all 18 troubleshooting contracts passed.
- [x] Rerun dependency installation, `npm test`, and `npm run test:all`. Each full test command passed 209 unit tests and 71 of 72 prompt tests before the same known baseline failure; downstream suites were not reached.
- [x] Preview both explicit chezmoi targets and run `git diff --check`; no target apply.
- Commit: `docs(pi): clarify progressive signal discovery`.

## Approved follow-up: self-review clarifications
- [x] Keep a causal explanation a supported hypothesis or unknown when a material fact is unassessed or a causal link lacks authoritative evidence; name the missing observation required for confirmation.
- [x] Record whether each test ran, reference the actual observation by fact ID, and update the hypothesis state. A blocked test remains an evidence gap, never an expected result presented as observed.
- [x] Add two focused contract tests: both failed before the prompt change; all 20 troubleshooting tests passed afterward.
- [x] Rerun `npm ci --ignore-scripts`, `npm test`, and `npm run test:all`. Each full test command passed 209 unit tests and 73 of 74 prompt tests before the same known baseline failure; downstream suites were not reached.
- Commit: `docs(pi): clarify troubleshooting evidence gaps and test outcomes`.
- Self-review: both approved findings are addressed without extra ledger columns, output headings, access, or state-changing operations. Independent verification and target apply remain pending.

## Plan review
The existing prompt and tests support this bounded change. No blocking scope or feasibility findings. Keep controls optional, preserve evidence conflicts, and do not infer causality from a hypothesis merely surviving the observed facts.
