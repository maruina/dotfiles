# Consolidate Writing Skills Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use `write` as the single general prose skill, with a short review for formulaic LLM prose, and remove the separate vendored `humanizer` skill.
**Smallest user-feedback slice:** One complete change to the writing skill, its active consumers, and their tests.
**Out of Scope:** General writing-rule refactors, voice-matching features, AI-authorship detection, historical plan rewrites, and changes to unrelated skills or vendor-sync behavior.
**Architecture:** Pi discovers skill instructions from `SKILL.md`. `skill-loader` and `pr-validate` explicitly load prose skills. Consolidate the instructions and update those consumers together.
**Tech Stack:** Markdown skill and prompt instructions, a JSON report example, Node.js tests, and chezmoi.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Select applicable guidance | Located prose-loading rules and documentation consumers. |
| `write` | user-requested | Review and consolidate the writing guidance | Preserved meaning, avoided duplicate rules, and kept the plan direct. |
| `humanizer` | user-requested | Assess the skill to remove | Identified useful structural checks and rules that must not transfer. |
| `chezmoi` | skill-loader | Managed source changes | Planned source-only edits and explicit target validation. |
| `feature-worktree` | prompt-required | Keep the base checkout on main | Created a feature worktree from current `origin/main`. |
| `codebase-research` | skill-loader | Cross-file instruction consumers | Mapped active references, example data, and the existing prompt assertion. |
| `learning-lookup` | prompt-required | Check advisory guidance before planning | Queried the learning store; no relevant guidance applied. |
| `obsidian-cli` | agent-selected | Access the advisory store | Used the CLI for a read-only learning lookup. |

## Scope
The user approved the consolidation proposed in the conversation. This is a small, direct implementation plan with one execution unit. No separate design document is needed.

Active references are in `skill-loader`, `pr-validate`, its lifecycle prompt test, and the report example. References under existing `plans/` are historical records and remain unchanged. Removing the entire vendored directory also removes its `VENDOR.md`, so vendor sync no longer discovers it.

### Task 1: Consolidate prose instructions and consumers
**Delivers:** One writing skill that owns clarity and the reduction of formulaic prose, with no active dependency on the removed skill.
**Blocked by:** None.
**Traces to:** The user's approved four-step consolidation proposal.
**Files:**
- Modify `dot_pi/agent/exact_skills/write/SKILL.md`.
- Modify `dot_pi/agent/exact_skills/skill-loader/SKILL.md`.
- Modify `dot_pi/agent/exact_prompts/pr-validate.md`.
- Modify `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
- Modify `dot_pi/agent/exact_scripts/pr-validate-report/example.json`.
- Delete `dot_pi/agent/exact_skills/humanizer/SKILL.md`, `LICENSE`, and `VENDOR.md`.

- [ ] Update the lifecycle prompt tests to require loading only `write` in `pr-validate.md`, reject an active `humanizer` reference in `pr-validate.md`, and reject `humanizer` in `skill-loader/SKILL.md`; run `node --test --test-name-pattern='PR validation report is rendered from bounded JSON data' dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` from the repository root and confirm it fails against the old prompt.
- [ ] Update `write`'s frontmatter description to include its consolidated role in reviewing and editing formulaic LLM prose. Add a compact `Final review` section to `write`. Cover repeated closers or heading restatements, unneeded defenses against objections, repeated paragraph shapes or sentence openings, and automatic punctuation or formatting. Refer to existing rhetorical-pattern guidance rather than duplicating the triad rule.
- [ ] State that these checks are review prompts, not forbidden forms. Edit only to improve clarity, remove repetition, or match the requested voice. Preserve facts, scope, uncertainty, and the writer's position. Keep useful summaries, genuine alternatives, and formatting that helps readers scan.
- [ ] Retain the existing final-text output default. Do not transfer word blacklists, dash bans, AI-authorship claims, guessed reactions, or the draft-plus-critique output contract.
- [ ] Change both prose references in `skill-loader` to use only `write` and describe its consolidated purpose. Change the PR-report instruction to load and apply only `write`.
- [ ] Remove the obsolete skill entry from the JSON example without changing its schema or unrelated report content. Remove the entire vendored skill directory from the source.
- [ ] Rerun the focused test above and expect a pass. Run `node --test dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` and expect all renderer tests to pass.
- [ ] Search `dot_pi/agent` with `rg -n -i humanizer dot_pi/agent`; expect only any intentional negative test assertion, not a loading instruction, example entry, skill definition, or vendor record.
- [ ] Review the final instructions against the acceptance scenarios below. Do not claim that deterministic structural tests establish the quality of all future LLM prose.
- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` in `dot_pi/agent`. Keep dependencies until both suites complete, then remove only the disposable source `node_modules` directory per repository guidance.
- [ ] Run `git diff --check` and the targeted chezmoi previews below. Review the complete intended diff and stop on unrelated drift or an unsafe apply scope.
- [ ] Hand off for fresh independent `/verify`; do not claim final verification from implementation-stage evidence.
- [ ] After independent verification, complete the repository's safe apply, commit, and push workflow with `refactor(pi): consolidate prose guidance into write`. Recheck the verified candidate before any apply. The completion stage is not part of read-only `/verify`.

## Validation
### Requirement: Single prose skill
The active instructions SHALL load `write` without depending on the removed skill.
- GIVEN prose loading through `skill-loader` or the PR-report prompt, WHEN their instructions are inspected, THEN only `write` is required for general prose.
- GIVEN the source skill tree and report example, WHEN skill discovery and example parsing run, THEN the removed skill is absent and the remaining skills and example remain valid.
- Checks: focused lifecycle test, `npm test` including skill validation, renderer tests, and the active-reference search.

### Requirement: Meaning-preserving review
The final review SHALL use contextual checks rather than blanket stylistic prohibitions.
- GIVEN a redundant closer, a heading restatement, or a defense against an irrelevant objection, WHEN the review is applied, THEN it directs the editor to remove repetition without dropping supported information.
- GIVEN a useful summary, a real alternative, three distinct items, or punctuation and bold labels that improve readability, WHEN the review is applied, THEN the guidance does not require an edit solely because a pattern appears.
- Check: independent semantic review of the complete `write` skill against these positive and negative cases. Deterministic tests validate discovery and consumers; they cannot prove probabilistic model compliance. Do not add brittle tests for every sentence in the checklist.

### Chezmoi and completion safety
Use the feature worktree as the source for every chezmoi command. Preview each changed target file explicitly: `~/.pi/agent/skills/write/SKILL.md`, `~/.pi/agent/skills/skill-loader/SKILL.md`, `~/.pi/agent/prompts/pr-validate.md`, `~/.pi/agent/scripts/lifecycle-prompts.test.mjs`, and `~/.pi/agent/scripts/pr-validate-report/example.json`.

Removing a directory from an `exact_` parent requires confirming the target deletion. Use `chezmoi --source "$PWD" apply --dry-run --verbose ~/.pi/agent/skills` to inspect planned actions, in addition to explicit file diffs. Do not trust an empty directory diff. Stop before applying if the parent-directory operation would change unrelated targets. After a safe apply, compare explicit target files with their sources and confirm `~/.pi/agent/skills/humanizer` no longer exists.

Rollback is to restore the changed source files and removed skill from the parent commit, then preview and apply only the reviewed targets. No credentials, external service behavior, or runtime dependencies change.

## Documentation impact
Inspect root `AGENTS.md` and `dot_pi/agent/AGENTS.md`; neither needs a change because they do not require the removed skill. The updated skills, prompt, and example are the user-facing guidance for this change. Keep historical provenance in existing plans unchanged. Do not change vendor-sync instructions; removal of the vendor record is sufficient.

## Advisory lookup
The learning lookup returned no relevant writing or skill-consolidation guidance. No advisory learning changed this plan.
