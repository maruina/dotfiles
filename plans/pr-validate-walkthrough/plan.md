# `/pr-validate` Walkthrough and Review Gates Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/pr-validate` report answer its dual purpose: first answer "should I approve or not?" with a visible PR summary and review-gates table up front; then explain the PR at a bigger-picture level with a Walkthrough before deep-diving into individual issues; give each item its system context with "Where this fits"; then retire the unused `/pr-review` command.
**Smallest user-feedback slice:** The updated `pr-validate.md` passes its marker tests, and one real run on a PR produces a report with PR summary and review gates up front, a Walkthrough of the bigger picture, items with "Where this fits", and six-slot defect stories.
**Out of Scope:** CI, merge-state, and approval gates (the user checks them on GitHub); a familiarity-level argument, glossary, and comprehension questions from `/pr-review`; changes to `/to-html`, the `explain` skill, and the verdict and severity logic.
**Architecture:** Prompt-only change. `dot_pi/agent/exact_prompts/pr-validate.md` gets PR summary and review-gates tables up front (answering "should I approve or not?"), a Walkthrough chapter adapted from `pr-review.md` Phase 6 (answering "what is the bigger picture?"), a sixth item slot ("Where this fits"), and renamed criterion states (Pass/Fail/Open). Slice 2 deletes `pr-review.md` and points the remaining prompts at `/pr-validate`. Marker tests in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` pin the contract.
**Tech Stack:** Markdown pi prompts, `node:test` marker tests, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires it | Selected `chezmoi` and `write` from the affected files and prose |
| `learning-lookup` | `prompt-required` | Advisory lookup before decisions | Searched `pr-validate`, `PR review`, `walkthrough`, `quality gate`, `report`; no sections matched |
| `chezmoi` | `skill-loader` | Files are under the chezmoi source | `exact_prompts` removes the deleted `pr-review.md` target on apply; diff and apply explicit target paths |
| `write` | `skill-loader` | Prompt and plan prose | Plain-language wording rules for the Walkthrough, slot, and table instructions |
| `feature-worktree` | `prompt-required` | Durable plan needs a feature worktree | Created `maruina/pr-validate-walkthrough` from `origin/main` |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | Resolve the supplied plan path and switch context | Located the plan in its owning feature worktree before reading repository files |
| `skill-loader` | `prompt-required` | Required at the start of execution | Selected the chezmoi and prose-writing skills for the affected prompt and test files |
| `feature-worktree` | `prompt-required` | Required before writing files | Confirmed this is the plan's feature worktree and the branch is safe |
| `chezmoi` | `skill-loader` | The affected files are chezmoi source files | Kept edits in the source tree and used source-aware validation guidance |
| `write` | `skill-loader` | The prompt includes user-facing report instructions | Used concise prose and explicit section instructions for the Walkthrough |

## Advisory learnings
`Datadog/Learnings.md` returned no matching sections for the terms above. No learning guidance applies.

## Context
- `pr-validate.md` builds a system model in "Pass 1: Understand the change", but the report does not show it. The report starts with the Hero and a Map flowchart, then items.
- Items use five slots: Why it matters, What the code does now, Why that is bad, Is it real?, Fix shape. No slot ties the item to the surrounding system.
- The ten criteria use the states confirmed, refuted, and open. They appear as chip rows inside Reference, mostly in `<details>`.
- `pr-review.md` Phase 6 has the walkthrough contract the user wants: problem statement, system model, core intuition, solution map, and per-step "today / changed and why / downstream effect".
- The user has not used `/pr-review` since `/pr-validate` landed.
- Prior reports for comparison: `~/.pi/agent/pr-validate-reports/dd-source-103728.html`, `dd-source-116539.html`.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| `/pr-validate` prompt | `dot_pi/agent/exact_prompts/pr-validate.md` | PR summary & review gates up front, Walkthrough, item context, gate states | `npm run test:prompts`; manual real run |
| Prompt marker tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Pin the report contract and the `/pr-review` removal | `npm run test:prompts` |
| `/pr-review` prompt (Slice 2) | `dot_pi/agent/exact_prompts/pr-review.md` | Deleted | Test asserts the file is absent |
| Referencing prompts (Slice 2) | `dot_pi/agent/exact_prompts/pr-cleanup.md`, `pr-address-feedback.md`, `verify.md`, `systematic-review.md` | Point at `/pr-validate` | Test asserts no prompt names `/pr-review` |
| Design record | `plans/pr-validate/design.md` | Record revision 3 and drop the guided `/pr-review` alternative | Read-through |

### Key Decisions
- Dual-goal structure:
  1. **Should I approve or not?** Answered immediately by **Hero**, **PR summary**, and **Review gates** tables right at the top.
  2. **If not, what is the problem at a bigger-picture level before deep-diving into the actual issue?** Answered by the **Walkthrough** (Problem, System today, Core intuition, Solution map, Map flowchart, entry-point order steps) before any item chapters, and each item starts with **Where this fits** linking back to the walkthrough step.
- Gates are the ten review criteria only. CI and merge state stay on GitHub, at the user's request.
- Criterion states become **Pass**, **Fail**, and **Open** everywhere in the prompt. The verdict logic is unchanged: Approve only when every gate passes, Ask when a gate is open and none fails, Request changes when a gate fails.
- The PR summary table lists **What it does** and **Why** first, each in one or two plain-language sentences. Then PR, Head, Size, Files by class, Verdict, and gate counts. Both the PR summary and Review gates tables are visible up front, right after Hero and before Chip navigation and Walkthrough, not hidden in `<details>` or buried at the end.
- The Review gates table has the columns `Gate | Status | Evidence`. A Fail or Open row links to the item that explains it. A Pass row gives one line of evidence. Both tables appear for every verdict, including Approve.
- Chip navigation includes sticky chips for Review gates, Walkthrough, each item chapter, and Reference.
- The Walkthrough comes right after chip navigation and before any item chapters. It contains the Map flowchart; the Map is no longer a separate section.
- Each item gets a first slot, **Where this fits**: two or three sentences about the component's role and its caller or data path, with a link to the related Walkthrough step. Items then have six slots. Attention items use the same slot.
- No familiarity argument. The Walkthrough targets a staff engineer who is new to the subsystem, which matches the `/pr-review` default.
- `/pr-review` is retired in Slice 2, after the user accepts a real Slice 1 run.

### Implementation Constraints
- Keep the HARD-GATE, the single permitted write, the worktree verification without `reset --hard`, the untrusted-content escaping, and Mermaid `securityLevel: "strict"` with agent-written labels.
- Keep every existing marker test green unless the plan changes that wording on purpose. Change only the assertions named in each task.
- Walkthrough steps follow entry-point order, not diff order. Each step has only the three short parts, so the report does not turn back into a wall of text (the revision 1 failure).
- Do not copy `pr-review.md` text that the confirmed scope excludes: familiarity levels, glossary, comprehension checks, `/to-html` handoff, and `reset --hard`.
- Stop and ask if the real run shows that the Walkthrough makes items harder to find, or if the user does not accept the run before Slice 2.

### Security Requirements
No new input or trust path. The Walkthrough and tables render PR-derived text, so the existing rule applies: escape PR and context content as text, and keep it out of Mermaid labels and scripts. Task 1 adds a marker that the Walkthrough falls under that rule.

### Observability Requirements
Not applicable. The change is a prompt with no runtime component. The report itself records Coverage and evidence gaps as before.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| A gate cannot be evaluated | Status is Open with the missing evidence named, and the row links to an Ask or Coverage | Marker test on Open semantics; real run |
| A PR has no items (Approve) | Walkthrough and both summary/gates tables still render; all gates Pass | Marker test that the summary and gates tables apply to every verdict |
| A Walkthrough step has no item | Step renders without a link; items link to steps, not the reverse | Real run read-through |
| A stale reference to `/pr-review` after Slice 2 | Test fails | `npm run test:prompts` |

### Rollout and Rollback
- Rollout: merge the PR, then run `chezmoi diff ~/.pi/agent/prompts/pr-validate.md` and `chezmoi apply` for the changed targets. After Slice 2, `chezmoi apply ~/.pi/agent/prompts` removes `pr-review.md` because the directory is `exact_`.
- Rollback: revert the commit and `chezmoi apply` again. Slice 2 is a separate commit, so `/pr-review` can come back without losing Slice 1.
- Owner: Matteo Ruina.

### Test Strategy
| Requirement | Interface | Seam |
|---|---|---|
| Walkthrough section and parts | Prompt text through `npm run test:prompts` | Existing `requireMarkers` in `lifecycle-prompts.test.mjs` |
| Where this fits slot | Same | Existing |
| Pass/Fail/Open gate states and summary/gates tables | Same | Existing |
| Report readability | Manual `/pr-validate` run on a real PR | None; output comes from a model, so automation cannot judge it |
| `/pr-review` removed with no stale references | `npm run test:prompts` | Existing `promptsDir` listing |

Narrow failing command before implementation: `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`. Run `npm ci --ignore-scripts` in `dot_pi/agent` first, and remove `node_modules` after `npm test` and `npm run test:all` complete, as `AGENTS.md` requires.

## Acceptance criteria
### Requirement: Walkthrough before judgment
The report SHALL open with a Walkthrough chapter after chip navigation and before any item chapter.

#### Scenario: Request changes PR
- GIVEN a PR with at least one confirmed defect
- WHEN `/pr-validate` writes the report
- THEN the Walkthrough shows Problem (what and why), System today, Core intuition, Solution map, the Map flowchart, and steps in entry-point order, each with how it works today, what changed and why, and the downstream effect, before the first item.

#### Scenario: Approve PR
- GIVEN a PR with no items
- WHEN `/pr-validate` writes the report
- THEN the Walkthrough is still present.

### Requirement: Items carry system context
Every Ask, Request changes, and attention item SHALL start with a **Where this fits** slot that names the component's role and its caller or data path, and links to the related Walkthrough step.

#### Scenario: Ask item
- GIVEN an Ask item on a changed file
- WHEN the report renders the item
- THEN slot 1 is Where this fits, with a link to a Walkthrough step, followed by the five existing slots.

### Requirement: PR summary and review gates up front
The report SHALL feature visible PR summary and Review gates tables right after Hero and before Walkthrough, answering "should I approve or not?" immediately, followed by the Review gates table with one row per criterion and a Pass, Fail, or Open status.

#### Scenario: Mixed gates
- GIVEN a PR where Correctness fails and Observability is open
- WHEN the report renders the summary and gates tables
- THEN the Correctness row says Fail and links to its Request changes item, the Observability row says Open and links to its Ask item, the remaining rows say Pass with one line of evidence, and the summary shows the gate counts.

#### Scenario: Unchanged verdict logic
- GIVEN any gate is Open and none is Fail
- WHEN the verdict is chosen
- THEN the verdict is Ask, not Approve.

### Requirement: `/pr-review` is retired
The prompt set SHALL NOT contain `pr-review.md`, and no prompt SHALL name `/pr-review`.

#### Scenario: Prompt references
- GIVEN Slice 2 is applied
- WHEN `npm run test:prompts` runs
- THEN it passes, `pr-cleanup.md` names `/pr-validate` as the creator of the review worktree, and `verify.md`, `systematic-review.md`, and `pr-address-feedback.md` point at `/pr-validate`.

### Slice 1: The `/pr-validate` report explains, contextualizes, and summarizes
### Task 1: Add the Walkthrough chapter
**Delivers:** The report contract has a Walkthrough chapter that holds the Map.
**Blocked by:** None
**Traces to:** Requirement: Walkthrough before judgment
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] In the "PR validation revision 2 report shape" test, replace the `\*\*Map\.\*\*` marker with a `\*\*Walkthrough\.\*\*` marker. Add a new test "PR validation report opens with a walkthrough" that requires markers for `Problem`, `System today`, `Core intuition`, `Solution map`, `entry-point order`, `How it works today`, `What changed and why`, `Downstream effect`, and that PR content in the Walkthrough is explicitly subject to the escaping rule (requiring `/PR content and context.*(?:walkthrough|Walkthrough).*escape/i`). Run the narrow command; expect the new test to fail.
- [x] In `pr-validate.md` Output, replace page item 3 (**Map.**) with **Walkthrough.**: it renders the Pass 1 model before any item chapters and contains the Map flowchart with red and amber item nodes. Define the parts and step format in a short subsection adapted from `pr-review.md` Phase 6. Exclude familiarity levels, glossary, and comprehension checks. Extend Pass 1 so it records the entry-point order and the per-step parts that the Walkthrough needs. Update Chip navigation to include chips for Review gates, Walkthrough, each item chapter, and Reference. State that the Walkthrough appears for every verdict, including Approve, and update the Approve-page paragraph to match.
- [x] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
- [x] Commit with `feat(pi): add walkthrough chapter to /pr-validate reports`.

### Task 2: Add the Where this fits item slot
**Delivers:** Every item starts with its system context and a link to its Walkthrough step.
**Blocked by:** Task 1
**Traces to:** Requirement: Items carry system context
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add `\*\*Where this fits\.\*\*` and a marker for a link to the Walkthrough step to the revision 2 report-shape test. Run the narrow command; expect failure.
- [x] In `pr-validate.md`, change "five slots" to "six slots" in the item-story paragraph, the attention-items paragraph, and the Leave this comment box paragraph. Add slot 1 **Where this fits.** (component role, caller or data path, link to the Walkthrough step) and renumber the existing slots. Update the attention-item slot mapping so slot 2 is **Why it needs your judgment**, slots 3 and 4 hold **Where** and **Context**, and slot 6 holds **Options**.
- [x] Run the narrow command; expect all tests to pass.
- [x] Commit with `feat(pi): give /pr-validate items their system context`.

### Task 3: Rename gate states and add PR summary and review gates tables
**Delivers:** The report opens with an immediate "should I approve or not?" assessment via visible PR summary and Review gates tables up front, with Pass, Fail, or Open per criterion.
**Blocked by:** None (runs after Task 2 only to keep edits to the Output list sequential)
**Traces to:** Requirement: PR summary and review gates up front
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add a test "PR validation report includes PR summary and review gates" with these markers: `\*\*PR summary\.\*\*`, `What it does`, `Why`, `Files by class`, `\*\*Review gates\.\*\*`, `Gate \| Status \| Evidence`, `Pass`, `Fail`, `Open`, a marker that Fail and Open rows link to their item, and a marker that the tables are not inside `<details>`. Assert that the prompt no longer says `confirmed, refuted, or open`. Run the narrow command; expect failure.
- [x] In `pr-validate.md`, change "Mark each criterion confirmed, refuted, or open" to Pass, Fail, or Open. Change the "Confirmed when" column header to "Passes when". Change the verdict rules to say every gate passes, a gate is open, or a gate fails, with the same outcomes as before. Leave the separate defect wording ("a confirmed defect") alone, because it describes claims, not gates.
- [x] In Output, structure the page layout so PR summary and Review gates appear immediately after Hero and before Chip navigation and Walkthrough:
  1. **Hero.**
  2. **PR summary & Review gates.** PR summary lists What it does, Why, PR, Head, Size, Files by class, Verdict, and Gates (counts). Review gates table has one row per criterion (`Gate | Status | Evidence`). A Fail or Open row links to its item, or to Coverage when no item exists.
  3. **Chip navigation.** Chips for Review gates, Walkthrough, each item chapter, and Reference.
  4. **Walkthrough.**
  5. **Item chapters.**
  6. **Your question.**
  7. **Reference.** Holds Coverage and Skills loaded and used.
  Remove "The ten criteria as chip rows" from **Reference.**. Remove the sentence about the "three revision-2 criteria" only if it now contradicts the table. State that both tables appear for every verdict, including Approve.
- [x] Run the narrow command; expect all tests to pass.
- [x] Commit with `feat(pi): add PR summary and review gates to /pr-validate reports`.

### Task 4: Validate Slice 1 on a real PR
**Delivers:** User feedback on the new report.
**Blocked by:** Tasks 1–3
**Traces to:** Smallest user-feedback slice
**Files:** None in the repository; the report goes to `~/.pi/agent/pr-validate-reports/`

- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` in `dot_pi/agent`; expect all to pass. Remove `dot_pi/agent/node_modules`.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/pr-validate.md` and `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md` from the worktree, with the user's approval.
- [ ] Ask the user to run `/pr-validate` on a real PR. Recommend `dd-source#116539` or `#103728`, so the user can compare with the earlier reports. Copy the earlier report first so it is not overwritten, for example to `dd-source-116539-rev2.html`.
- [ ] Expect the report to show PR summary and Review gates up front, the Walkthrough second, six-slot items with working links to Walkthrough steps, and links from Fail and Open rows to items. Record the user's verdict on readability. Stop if the user does not accept the run; revise Slice 1 before Slice 2.

### Slice 2: Retire `/pr-review`
### Task 5: Remove `/pr-review` and its references
**Delivers:** `/pr-review` no longer exists, and no prompt points at it.
**Blocked by:** Task 4 (user accepts the run)
**Traces to:** Requirement: `/pr-review` is retired
**Files:** `dot_pi/agent/exact_prompts/pr-review.md` (delete), `dot_pi/agent/exact_prompts/pr-cleanup.md`, `dot_pi/agent/exact_prompts/pr-address-feedback.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/systematic-review.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Add a test that asserts `pr-review.md` does not exist in `promptsDir` and that no prompt file matches `/\/pr-review\b/`. Run the narrow command; expect failure.
- [ ] Update the existing tests that read `pr-review.md`:
  - remove it from `provenancePrompts`;
  - drop it from the "simplify and PR review report skill provenance" loop and remove the `domain rules are \`prompt-required\`` assertion;
  - remove it from the shared-worktree-path test list;
  - remove `const review = prompt("pr-review.md");` and all `review` assertions in "PR commands have distinct roles and aligned review artifacts";
  - remove it from the `feature-worktree` prompt list;
  - change the `addressFeedback` marker to `/Build a \*\*targeted model\*\*, not a full `\/pr-validate` walkthrough/`.
- [ ] Delete `pr-review.md`. In `pr-cleanup.md` line 8, say that `/pr-validate` creates the worktree. In `verify.md` and `systematic-review.md` line 12, point at `/pr-validate` to assess someone else's GitHub PR. In `pr-address-feedback.md`:
  - on line 10, say `/pr-validate` reviews the PR as a whole;
  - on line 48, keep the evidence-hierarchy list and remove the "same as `/pr-review`" reference;
  - on line 57, say "not a full `/pr-validate` walkthrough".
- [ ] Run `rg -n '/pr-review\b' dot_pi`; expect no output. Run the narrow command; expect all tests to pass.
- [ ] Commit with `feat(pi)!: retire /pr-review in favor of /pr-validate`.

### Task 6: Documentation and future-agent guidance
**Delivers:** The design record matches the shipped behavior.
**Blocked by:** Task 5
**Traces to:** Documentation contract
**Files:** `plans/pr-validate/design.md`

- [ ] Add a short "Revision 3" paragraph to the Summary of `plans/pr-validate/design.md`: Walkthrough, Where this fits, Pass/Fail/Open gates, end tables, and `/pr-review` retired. Change "The existing `/pr-review` stays unchanged" so it says the command is retired. In Deferred alternatives, mark the guided `/pr-review` row as dropped, with the reason that the user uses only `/pr-validate`.
- [ ] Check these files and record that they need no change, because none of them names `/pr-review` or the report shape:
  - `AGENTS.md`
  - `dot_pi/agent/AGENTS.md`
  - the `skill-loader`, `explain`, and `feature-worktree` skills

  Confirm with `rg -n 'pr-review\b' --glob '!plans/**' .`, which must show only `pr-PR_NUMBER-review` path matches.
- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` in `dot_pi/agent`; expect all to pass. Remove `dot_pi/agent/node_modules`.
- [ ] Run `chezmoi --source "$PWD" diff` for each changed prompt target, then apply. Confirm `~/.pi/agent/prompts/pr-review.md` is gone.
- [ ] Commit with `docs: record /pr-validate revision 3 and /pr-review retirement`.

## Final verification
- The feature-level criteria hold together: a real report opens with the PR summary and Review gates up front, followed by the Walkthrough of the bigger picture, every item starts with Where this fits, and `/pr-review` is not available in pi.
- `npm test` and `npm run test:all` pass in `dot_pi/agent`.

## Documentation impact
`plans/pr-validate/design.md` changes in Task 6. No `AGENTS.md` or skill changes, because none of them documents `/pr-review` or the report shape.

## Learning candidates
None yet.
