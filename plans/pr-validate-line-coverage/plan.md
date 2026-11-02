# PR Validate Line-Level Diff Coverage Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show changed code lines that no walkthrough step, item, claim, or mechanical group accounts for in `/pr-validate`.
**Smallest user-feedback slice:** Render a Reference coverage summary for a fixture with an uncovered R-side hunk, a deletion-only hunk, and a file without a diff, without changing the verdict or successful render exit.
**Out of Scope:** Interactive follow-up, Draftdog UI, commit-keyed report artifacts (F6), changes to object-read mode or the execution HARD-GATE, coverage gating, and extra local Git collection to recover omitted GitHub diffs.
**Architecture:** The renderer accepts an optional evidence file and derives coverage from its unified diff and metadata. Optional report refs describe which observed R-side additions the report accounts for; deletions and unmeasured files remain separate, visible exceptions. The collector adds a declared file count, not a derived range schema.
**Tech Stack:** Node.js standard library, node:test, existing gh collection, Markdown prompts, escaped HTML report.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Planning workflow | Selected applicable guidance before recommendations |
| `resolve-worktree` | prompt-required | Discover designs | Searched registered worktrees; no F1 design resolved |
| `feature-worktree` | prompt-required | Plan writes | Created a feature worktree from fetched main |
| `codebase-research` | skill-loader | Cross-file behavior | Traced collection, rendering, prompt instructions, consumers, and tests |
| `chezmoi` | skill-loader | Managed source | Kept changes in source and specified targeted application |
| `cli-best-practices` | skill-loader | Renderer input | Preserved existing invocation and explicit diagnostics |
| `write` | skill-loader | Plan prose | Used concrete mechanisms, boundaries, and acceptance scenarios |
| `learning-lookup` | prompt-required | Advisory guidance | Checked the learning store; no relevant guidance matched |
| `obsidian-cli` | agent-selected | Learning lookup dependency | Read the advisory store through the installed CLI |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Plan path resolution | Confirmed the absolute plan path and stopped in the owning worktree |
| `skill-loader` | prompt-required | Execution skill selection | Routed the changed `.mjs`, `.json`, and `.md` files to applicable skills |
| `feature-worktree` | prompt-required | Worktree policy | Confirmed the existing feature worktree and branch |
| `chezmoi` | skill-loader | Managed source files | Edited the source tree and deferred targeted application to Slice 2 |
| `cli-best-practices` | skill-loader | Renderer CLI flag | Added the explicit `--evidence` flag and kept diagnostics on stderr |
| `write` | skill-loader | Prompt and help prose | Kept new instructions short and concrete |
| `reviewable-pr-workflow` | skill-loader | Slice handoff | Applied the stack-split check before proposing a PR |

## Source and confirmed alignment
- Source of truth: the user's F1 request and confirmed planning alignment brief in this session.
- Classification: Medium; bounded behavior with report-contract and evidence-handling changes.
- User confirmed the renderer-reading-evidence option, conservative deletion treatment, and one feature slice followed by documentation/final verification.
- PR #121 is merged as `5053efff24fb1f5f8d755f92dd095bd924dda9ae`. The clean main checkout was fast-forwarded; this branch starts there, not on the old object-reads branch.
- Reference: Draftdog at commit `76c3ad0093d9dbf088cb3538d48f12022f7bf2a2`, inspected at the user-named `/tmp/sr-draftdog/draftdog`: `lib/draftdog/diff.py`, `tour.py`, and `prompt.md`.
- Draftdog supplies the accounting idea, not its exact denominator: it counts deletions and lets path refs cover files without patches. This plan deliberately does neither in the R-side coverage metric.
- Existing designs and plans describe earlier shipped `/pr-validate` work. Preserve their implemented behavior; do not revise those historical artifacts.
- Learning lookup: the source helper lacked its runtime dependency; the installed helper succeeded. No relevant advisory section was found or applied.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Report renderer and CLI | `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs` | Validate optional fields, load evidence, calculate ranges, render advisory Reference output | Function and subprocess tests |
| Renderer tests | `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` | Fixtures, accounting, failures, compatibility, escaping, output bounds | `node --test dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` |
| Collector | `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` | Request and preserve declared `changedFiles` | Fake-gh subprocess tests |
| Collector tests | `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` | Declared count, absent count, incomplete inventory | `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` |
| Prompt and prompt tests | `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Teach refs and mechanical accounting; pass existing evidence to renderer; preserve safety rules | Focused lifecycle test file |
| Example and layout | `dot_pi/agent/exact_scripts/pr-validate-report/example.json`, `dot_pi/agent/exact_scripts/pr-validate-report/template.html` | Document optional shapes; reuse existing styles | Example validates; layout tests pass |

`template.html` is an inspection target, not a mandatory edit: change it only if existing styles cannot contain coverage output. No new package, parser module, fixture file, runtime dependency, or package script is required; use inline fixtures in existing tests.

### Key Decisions
1. Add `--evidence <evidence.json>` to the renderer. Do not copy evidence or inferred ranges into the report. Direct evidence reading avoids agent-controlled denominator transcription. Agent copying would preserve self-contained reports but weaken the measurement; a collector `changedRanges` field would enable reuse but add another contract without removing the need to transport it.
2. Keep report `schemaVersion: 2` and evidence `schemaVersion: 1`: all additions are optional. Existing invocations, exported-call argument meanings, word limits, report ordering, and validation behavior remain compatible.
3. Add optional `refs` arrays on walkthrough steps, all item kinds, and claims. Add optional `mechanical: [{summary, refs}]`. Ref shape is either `{path}` or `{path, side: "R" | "L", start, end}`; range bounds are inclusive positive safe integers with `end >= start`. A mechanical group requires nonempty refs and a summary within existing `LIMITS.short` (40 words). Absent or empty refs on other records are allowed. Do not infer coverage from prose, code excerpts, comment placement, or existing source links.
4. Whole-file refs account only for observed R-side additions in that file. An L ref never covers R additions. Refs are report assertions, not proof of reading or correctness. Mechanical groups describe routine changes; they are not a way to conceal behavior changes.
5. Deletions stay visible as separate L-side ranges, including deletions within replacement hunks and fully deleted files. Even if referenced, they do not increment the covered R count or disappear from the deletion inventory. Do not adopt Draftdog's deleted-line-to-next-R-line credit.
6. Limit the detailed list to 50 entries total across uncovered R ranges, deletion ranges, and file exceptions, in stable path/side/line order. Show complete category totals and the number of omitted entries. Merge adjacent ranges only within the same file and side; never merge across context lines or unobserved gaps.
7. Advisory only: evidence gaps and unaccounted ranges do not modify the verdict, gates, or render success. Existing malformed-report errors still fail validation. Revisit gating only in a separate follow-up after representative reports demonstrate stable accounting and distinguish evidence omissions from unaccounted code.

### Evidence and feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Derive actual additions and deletions | Parse unified `evidence.diff` | Collector already preserves gh diff output | Realistic unified-diff fixture through renderer CLI | Render explicit unavailable/partial measurement |
| Compare inventory with declared total | Add `changedFiles` to metadata fields and normalize as `pr.changedFiles` | Installed `gh pr view --help` lists it | Fake-gh count and missing-value cases | Preserve null/unknown, never substitute returned-array length |
| Match evidence to report | Compare canonical `pr.url` owner/repo/number and `pr.headRefOid` to report identity/headSha | Both inputs have these fields | Wrong PR/repo/head tests | Show coverage unavailable; do not apply refs to mismatched evidence |
| Preserve partial-source meaning | Read `collection.sources.metadata` and `collection.sources.diff` | Existing envelope tracks source status | Unavailable-source tests | Show gaps; unrelated comment/check failures do not invalidate usable diff data |
| Keep deterministic test seams | Existing exported render/validate functions and CLI tests | `render.test.mjs` exercises both | Function assertions plus subprocess tests | Block release if public behavior cannot be tested |
| Detect provider omissions | Declared file count, per-file additions/deletions, and parsed counts | Metadata normalization already retains file sizes | Missing entries, truncated hunk, aggregate mismatch tests | State unknown completeness, never claim complete PR coverage |

Public platform references consulted: GitHub REST pull-request files documentation (`https://docs.github.com/en/rest/pulls/pulls`) documents a maximum of 3,000 files; repository limits (`https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits`) describe diff limits. Do not assume that a successful gh process means complete diff content.

### Implementation Constraints
- Node standard library only. Keep parsing and interval operations in the existing renderer unless implementation reveals a concrete blocker; stop for alignment before introducing another public API or schema.
- Preserve the meaning of existing `render(report, template)` calls. An optional third options argument may carry evidence and load status; keep filesystem reads in the CLI and test the public CLI behavior. Do not export parser internals only to test them.
- Structurally invalid refs use existing field-specific validation errors. Structurally valid refs with unknown paths or no matching observed lines produce advisory diagnostics and no credit. Unknown ranges must not silently count as coverage.
- Parse hunk counts, zero-length sides, added/deleted files, no-newline markers, rename headers, and Git-quoted paths. Use destination paths for R refs and old paths for L refs on renames. Do not guess when path decoding is ambiguous.
- Validate hunk lengths and reconcile parsed additions/deletions with available per-file and PR totals. A truncated or contradictory file is unmeasured rather than fully covered. Preserve independently valid files where possible and label the denominator as observed, not the complete PR total.
- Binary files, pure renames, missing patches, and unsupported diff forms are file exceptions even when path-only refs exist. Do not invent one synthetic covered line for such files.
- Calculate interval unions/intersections; do not allocate arrays indexed by user-supplied line numbers or expand referenced ranges line by line. Work is bounded by input bytes, parsed intervals, and refs, not the largest line number. No new subprocesses, network calls, retries, or fan-out in the renderer.
- The existing collector's buffering is not expanded or refactored here. Rendered diagnostic lists are bounded; full evidence remains the local source of truth.
- Use a `deliberate:` comment for the advisory-only limit and its gating follow-up trigger. Preserve all existing object-read and HARD-GATE text except the specific coverage/output instructions needed for F1.

### Security Requirements
Treat report text, paths, and all evidence as untrusted. Escape paths, summaries, diagnostics, and links with existing safe helpers; do not accept raw HTML or interpolate raw evidence into scripts, styles, or markup. Never execute PR code or fetch URLs from evidence. Do not embed raw diffs, comments, or evidence-file contents in the report. Identity mismatch must not credit coverage. Keep existing scratch permissions and GitHub authentication rules unchanged.

### Observability Requirements
The Reference section is the diagnostic surface: show observed added-line total, covered and uncovered R-line counts, separate deleted-line/range totals, unmeasured-file count, inventory completeness, and omitted-detail count. When the declared total exceeds the returned inventory, show the unlisted file remainder as a count without fabricated paths. If declared totals are absent, mark completeness unknown. Missing/unreadable/invalid-JSON/mismatched evidence renders “Line coverage unavailable” with a safe reason. No service metrics or alerts apply to this local batch renderer.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Evidence omitted, unreadable, invalid, or mismatched | Successful report with unavailable coverage, no credit | CLI tests; original verdict/gates unchanged |
| Metadata or diff source unavailable | Unknown or partial denominator, explicit reason | Source-status fixture variants |
| Malformed report refs or mechanical summary | Existing validation failure; no HTML written | validate() and CLI negative tests |
| Unknown path, outside-diff range, context-only range | No false credit; advisory diagnostic | Function/CLI fixture |
| Binary/pure rename/missing patch | Listed as unmeasured, including with path-only refs | Exception tests |
| File list capped or diff truncated | Partial measurement and unknown/unlisted remainder | More-than-3,000 declared files and hunk/count mismatch tests |
| Large or overlapping ranges | Unique counts, bounded output, no numeric-span expansion | Huge safe-integer ref and >50-range fixture |

### Rollout and Rollback
Owner: the user as maintainer. Ship one feature PR based on merged #121. After verification, preview and apply only changed prompt/report target files with `chezmoi --source "$PWD"`, using explicit file targets; do not apply broad directories. Previously generated reports need no migration. Roll back the feature commit(s) and reapply those same files; old schema-2 reports remain readable. Plan-only work requires no chezmoi apply.

### Test Strategy
Use the existing public renderer CLI as the highest integration seam, exported render/validate calls for precise content assertions, and the collector's existing fake-gh boundary for metadata. Do not call live GitHub to prove synthetic omission behavior. Fake-gh tests prove request/normalization contracts, not that GitHub always supplies complete data. No production workload, mutable service state, or traffic telemetry applies. Baseline: 27 renderer/collector tests passed before implementation.

The first expected red command is `node --test dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` after adding the three-part fixture and its CLI expectations. It must fail because line coverage is absent, not because the fixture violates the existing report contract.

## Acceptance requirements
### R1: Account for observed R-side changed lines
The renderer SHALL compute the union of observed added-line refs from steps, items, claims, and mechanical groups and show uncovered ranges in Reference.
- GIVEN two addition hunks and refs covering only one, WHEN the CLI renders matched evidence, THEN the uncovered hunk and exact observed R totals appear.
- GIVEN overlapping refs across all four sources, WHEN rendered, THEN each covered line counts once.
- GIVEN context-only, unknown-file, outside-diff, or L-side refs, WHEN rendered, THEN they do not cover unrelated additions; unresolved refs have advisory diagnostics.

### R2: Preserve deletion and omission visibility
The renderer SHALL show deletions separately and SHALL NOT mark unmeasured files or omitted inventory as covered.
- GIVEN a deletion-only hunk, WHEN rendered with or without refs, THEN its L range remains visible and does not increment R coverage.
- GIVEN a rename with edits, WHEN destination R refs and old-path L refs are supplied, THEN additions resolve to the destination and deletions remain separate.
- GIVEN a pure rename, binary file, or metadata file without a diff, WHEN a whole-file ref exists, THEN the file remains an unmeasured exception.
- GIVEN declared 3,001 changed files but fewer inventory entries, or truncated hunks/count mismatches, WHEN rendered, THEN completeness is partial and missing data cannot yield a complete-PR coverage claim.

### R3: Preserve compatibility and advisory behavior
The system SHALL accept old schema-2 reports and SHALL NOT change gate statuses, verdicts, or render success because of coverage gaps.
- GIVEN an old report without the optional fields or evidence argument, WHEN rendered, THEN it succeeds with unavailable line coverage and unchanged report sections.
- GIVEN uncovered lines, deletions, or unreadable/mismatched evidence, WHEN rendered, THEN the HTML is written successfully with unchanged verdict/gates and explicit diagnostics.
- GIVEN invalid new ref shapes or an overlong mechanical summary, WHEN validated, THEN existing field-specific validation errors occur and the CLI writes no HTML. This rejects invalid report data, not incomplete coverage.

### R4: Bound and escape output
The renderer SHALL list at most 50 coverage detail entries combined while retaining full totals.
- GIVEN more than 50 uncovered ranges/deletion ranges/file exceptions, WHEN rendered, THEN at most 50 detail entries appear with accurate category and omitted-entry totals.
- GIVEN hostile paths and summaries or enormous valid numeric ranges, WHEN rendered, THEN text remains inert and processing does not expand numeric spans into arrays.
- GIVEN many covered ranges but no gaps, WHEN rendered, THEN it must not create an unbounded covered-range listing or claim complete PR coverage if inventory completeness is unknown.

### R5: Integrate the review workflow without changing safety rules
The prompt SHALL instruct the agent to pass the existing evidence file, attach precise refs, and describe routine changes in mechanical groups.
- GIVEN the prompt and example, WHEN lifecycle and renderer tests run, THEN the optional contract and evidence invocation are present and the example validates.
- GIVEN incomplete coverage, WHEN the prompt is followed, THEN it asks for explicit accounting/gaps, not fabricated refs or automatic gating; object-read and execution HARD-GATE contracts remain unchanged.

## Task sequence
### Slice 1: Advisory line coverage in Reference
This is one complete feature slice, not independently shipped parser, schema, and UI layers.

### Task 1: Implement and prove the end-to-end coverage contract
**Delivers:** All R1–R5 behavior through the existing collection/report workflow.
**Blocked by:** None.
**Traces to:** R1–R5 and the tests-first instruction.
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/example.json`, `dot_pi/agent/exact_scripts/pr-validate-report/template.html` (only if needed), `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [x] Inspect current consumers and use LSP definition/reference context before changing exported renderer behavior; preserve existing call signatures and template argument behavior.
- [x] Add the three-part fixture first: an uncovered addition hunk, a deletion-only hunk, and a metadata file without diff content. Start from the existing valid report example and supply matched identities. Run the expected-red command from Test Strategy.
- [x] Add fake-gh metadata assertions before requesting/normalizing optional `pr.changedFiles`; preserve null for absent/invalid counts and all existing source-status behavior.
- [x] Implement optional refs/mechanical validation, evidence CLI input and identity checks, strict diff parsing/reconciliation, interval accounting, and escaped Reference output as specified above.
- [x] Extend the fixture matrix for every R1–R4 positive and negative scenario before implementing each corresponding edge case. Include new/deleted empty-side hunks, no-newline markers, quoted paths, malformed hunks, zero observed additions, unavailable sources, and missing declared counts.
- [x] Update the prompt and example in the same slice. Pass the existing `$EVIDENCE_FILE` to the renderer; do not add collection or report-write locations. Explain that refs account for report content, not proof of understanding, and that unavailable/deleted changes remain visible.
- [x] Add lifecycle regression assertions for R5 and retain existing object-read/HARD-GATE tests.
- [x] Run `node --test dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; expect all tests green, including unchanged legacy cases.
- [x] Refactor only after green, then rerun the focused command. Run appropriate LSP diagnostics for edited JavaScript; report tool gaps without replacing execution tests.
- [x] Commit with `feat(pi): report advisory line-level PR diff coverage`.

**Execution notes:**
- The expected-red run failed because line coverage content was absent; the fixture itself validated and rendered.
- `lsp_diagnostics` could not start: the worktree has no TypeScript installation. `node --check` and the public renderer CLI tests supplied the syntax and behavior signal. `rg` confirmed the only consumers of `render`/`validate` are this prompt and the renderer tests.
- No post-green refactor was needed; the focused command was rerun after the final changes. 98 focused tests pass (36 renderer, 12 collector, 50 lifecycle prompt). The pre-change renderer/collector baseline was 27 tests.
- Coverage stays advisory. Evidence identity and source status gate the measurement; missing, mismatched, or partial evidence renders unavailable coverage and leaves the verdict and gates unchanged.


### Slice 2: Documentation and final verification
### Task 2: Complete usage guidance and verify the integrated feature
**Delivers:** A documented, verified, targeted rollout with no unrelated source changes.
**Blocked by:** Task 1.
**Traces to:** R1–R5, documentation requirements, and repository completion workflow.
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs` (help), `dot_pi/agent/exact_scripts/pr-validate-report/example.json`, `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs`, `plans/pr-validate-line-coverage/plan.md` (tracking).

- [ ] Check help, example, and prompt for consistent optional field shapes, evidence invocation, 40-word mechanical summaries, coverage caveats, and output cap. Add/run focused help tests before any remaining help change; avoid duplicating instructions in a new README.
- [ ] Review repository `AGENTS.md`, inherited guidance, and `dot_pi/agent/AGENTS.md`. Record no update unless implementation establishes a durable command or trap not already documented; do not copy feature details into global guidance. Historical plans/designs require no updates. No ADR for this feature was found.
- [ ] Run `npm ci --ignore-scripts` under `dot_pi/agent/` before final verification; keep dependencies until `npm test` and `npm run test:all` complete, then remove that disposable source `node_modules` directory per repository guidance. Do not change dependency manifests or lockfiles.
- [ ] Run `npm test` and `npm run test:all` from `dot_pi/agent/`; expect all tests green. Record any environmental smoke-test blocker explicitly; do not infer success from absent output.
- [ ] Final verification: rerun the focused command from Task 1 and demonstrate the three-part fixture through the CLI, unchanged verdict/gates, old-report compatibility, omission diagnostics, and the 50-entry cap. Inspect generated test HTML only in test scratch space, not a live report. Tests must clean temporary fixtures.
- [ ] Run `git diff --check`; review the final diff against the scope, especially unchanged object-read/HARD-GATE rules and optional schema compatibility.
- [ ] Preview and apply only changed runtime target files with `chezmoi --source "$PWD" diff <explicit-target-file>` and `chezmoi --source "$PWD" apply <explicit-target-file>`. Use each file's prefix-mapped target under `~/.pi/agent/`; verify explicit files, not directory targets. Do not apply the plan or broad targets. If unrelated target drift is present, stop and ask.
- [ ] Commit any remaining documentation/tracking changes with `docs(pi): document advisory PR diff coverage`, only if such changes remain after Task 1. Push the feature branch using the repository's GitHub-account routing rules; restore and verify the original account on success or error.

## Operational impact and stop conditions
This is a local, on-demand renderer; there is no service rollout, database migration, or on-call change. Generated HTML remains the artifact of record. An evidence file is needed only at render time; reports do not embed raw evidence and do not need it to open later.

Stop for alignment if implementation requires a schema bump, another network source, changes to read-mode or execution permissions, automatic coverage gating, or a different shared-consumer contract. Stop rollout if tests fail, source/target drift is unrelated, or identity/completeness cannot be represented honestly. Keep any gating, local-diff recovery, or reusable collector range schema as a separate follow-up, not an unfinished task in this plan.
