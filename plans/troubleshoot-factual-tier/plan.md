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
- [ ] Add focused failing contract tests in `dot_pi/agent/exact_scripts/troubleshoot-prompts.test.mjs` for the approved investigation rules.
- [ ] Update `dot_pi/agent/exact_prompts/troubleshoot.md`: maintain factual IDs and provenance; seek an optional trustworthy control; validate the leading hypothesis against all material facts; use a matrix only for ambiguity or stalled progress; refine hypotheses before collecting another bounded discriminating observation; check contradictions and necessary contributing causes.
- [ ] Preserve existing labels and output headings. Show factual IDs in the existing Confirmed section and reference them in the hypothesis ledger. Prefer runtime evidence before targeted deployed-source inspection. Assess supplied reproduction evidence without executing a state-changing reproduction.
- [ ] Run focused tests, install dependencies with `npm ci --ignore-scripts`, then run `npm test` and `npm run test:all`. Remove disposable source dependencies after both suites finish.
- [ ] Review the complete diff, preview explicit chezmoi targets, commit with `feat(pi): constrain troubleshooting hypotheses with factual evidence`, push, and open a draft PR. Leave target apply and final independent `/verify` pending.

## Validation
- Given an incident report, when hypotheses are evaluated, the prompt must require stable factual IDs, collection provenance, and all-material-fact coverage that distinguishes explained facts from compatibility and contradiction.
- Given no trustworthy control or blocked evidence access, the prompt must record the gap without inventing a control, changing state, or expanding collection without bounds.
- Given stalled progress or several surviving explanations, the prompt must require refinement and discriminating evidence rather than an unbounded hypothesis search, with an optional matrix.
- Given a proposed root cause or supplied reproduction, the prompt must check contradictory observations, necessary combined causes, deployed revision, and incident-signal parity without treating survival alone as proof.
- The Node contract tests check instruction presence, not live model compliance. Semantic review remains necessary.
- Documentation impact: the prompt is the user-facing behavior contract; no separate README or AGENTS change is needed.
- Rollout: apply only the changed explicit target files after independent verification. Rollback: restore the prior prompt source and reapply those targets.

## Plan review
The existing prompt and tests support this bounded change. No blocking scope or feasibility findings. Keep controls optional, preserve evidence conflicts, and do not infer causality from a hypothesis merely surviving the observed facts.
