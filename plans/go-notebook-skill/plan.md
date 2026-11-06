# Go Notebook Skill Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Go skill with concise, verified guidance from the 2021 Ultimate Go Notebook, using task-specific references and bounded sessions.
**Smallest user-feedback slice:** One reviewed ownership-and-memory reference, linked from the core skill, with source coverage and modernization evidence.
**Out of Scope:** Reproducing the book, committing the PDF or raw extraction, processing all pages in one session, implementing a search service, changing application code, or raising consumers' minimum Go versions.
**Architecture:** Preserve a short core skill and load focused references only for relevant tasks. Track source coverage and verification in separate planning artifacts so a new session does not need earlier conversations. References consolidate the existing Uber/marketplace guidance with book insights instead of creating parallel rule sets.
**Tech Stack:** Markdown, chezmoi, Pi skills, Poppler `pdfinfo`/`pdftotext`, supported Go toolchains, and public authoritative documentation.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Planning workflow | Selected relevant guidance and recorded provenance. |
| `feature-worktree` | prompt-required | Durable plan outside main | Created a standalone plan branch from fetched main. |
| `chezmoi` | skill-loader | Managed skill source | Preserved source-only editing and explicit-file application checks. |
| `codebase-research` | skill-loader | Reference organization | Inspected existing core skill, controller reference routing, validators, and PR state. |
| `write` | skill-loader | Durable prose | Used concrete tasks, evidence requirements, and concise handoff instructions. |
| `diataxis` | skill-loader | Documentation structure | Organized task guidance separately from optional explanation, not by book chapters. |
| `learning-lookup` | prompt-required | Advisory planning input | Queried matching learning sections; no matches returned. |
| `obsidian-cli` | agent-selected | Required learning lookup mechanism | Read the advisory store through the CLI without modifying notes. |
| `k8s-controller-dev` | user-requested | Existing progressive-disclosure example | Reused explicit task-to-reference routing; did not adopt controller-specific rules for ordinary Go. |

## Confirmed framing and repository state
The user approved a durable, resumable plan with a coverage ledger. The book supplies additional design reasoning and technical depth; Uber wins style conflicts. The user explicitly requires internet verification when 2021 advice may be outdated, using Go 1.27 as the review baseline rather than treating the book as current guidance.

Planning branch: `maruina/go-notebook-skill`. Worktree: `~/src/.worktrees/dotfiles/maruina-go-notebook-skill`. Base when created: `origin/main` at `f21e94e`.

Prerequisite: [PR #125](https://github.com/maruina/dotfiles/pull/125), head `a1267271f2bc951cf6041baf56fb8fe0e42b6361`, contains the agreed Uber/marketplace skill, restored introduction, and version-baseline section. It is OPEN as of planning. This plan-only branch does not contain that change. Do not silently create a stack, copy the skill back from the installed target, or start extraction against the older main version. After #125 merges, integrate fetched main into this worktree before implementation. If implementation must start before the merge, ask the user to choose an explicit branch dependency.

Only the introduction and table of contents have been reviewed for framing. A spot check of PDF page 26 confirms the Chapter 2 boundary. No content chapter is marked complete and no book-derived skill changes have been made.

## Source identity and evidence
- Local source: `~/Downloads/Ultimate Go Notebook.pdf` (the earlier `.go` filename was a typo).
- Title: Ultimate Go Notebook, First Edition, Version 1.0, William Kennedy with Hoanh An, 2021; copyright page reports Patch 39.
- PDF: 352 pages, 15,697,515 bytes.
- SHA-256: `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13`.
- Initial mapping: PDF page = printed page + 1. The PDF starts with an unnumbered cover; printed page 1 is PDF page 2. Check boundaries before citing a range and record any exceptions.
- Keep the PDF and scratch extractions outside Git. Re-extract bounded page ranges when needed; `/tmp` output is disposable, never a resume dependency. If the source is absent or its hash differs, stop and ask for the correct edition.
- Text extraction tools are installed at `/opt/homebrew/bin/pdfinfo` and `/opt/homebrew/bin/pdftotext`.
- As checked on 2026-11-06, official release/download pages report Go 1.27.3; local `go version` reports `go1.27.3 darwin/arm64`.
- Public evidence: [Go 1.27 release notes](https://go.dev/doc/go1.27), [release history](https://go.dev/doc/devel/release), [downloads](https://go.dev/dl/). Recheck release status in later sessions; do not describe Go 1.27 as permanently current.
- Other primary sources: [language specification](https://go.dev/ref/spec), [memory model](https://go.dev/ref/mem), [standard-library documentation](https://pkg.go.dev/std), and the [Uber style guide](https://github.com/uber-go/guide/blob/master/style.md).
- Advisory lookup: no matching sections for `Go skill`, `PDF`, or `progressive disclosure`; no learning-derived design changes.

## Implementation Contract
### Components affected
All skill paths below are under `dot_pi/agent/exact_skills/go-best-practices/`.

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Core skill | `SKILL.md` | Essential rules and explicit task-based loading triggers | Routing scenarios, structural validator, preserved opening paragraphs |
| Topic references | `references/*.md`, exact candidates below | Bounded, original guidance with focused examples | Source mapping, authoritative checks, example tests |
| Provenance | `SOURCES.md` | Edition, page references, source revisions, dated modernization evidence | Trace each retained source-derived recommendation |
| Resume state | `plans/go-notebook-skill/plan.md`, `coverage.md` | Scope, coverage, blockers, decisions, next action | Fresh-session replay without prior chat |

### Key decisions and constraints
- Core `SKILL.md` target: at most 250 lines. Each topic reference target: at most 200 lines. These are context budgets, not permission to drop necessary caveats; split an oversized topic and update routing if necessary.
- Preserve the two agreed opening paragraphs verbatim and keep `## Version baseline`. Do not restore `## Merge decisions` in the skill; decision evidence belongs in planning/provenance artifacts.
- Each reference must be understandable after reading the core skill, without loading every sibling reference. Cross-link only a specific prerequisite when needed.
- Prefer decisions and failure-prevention guidance over syntax lessons, exhaustive chapter summaries, or author quotations. Keep explanations only when they help choose or validate an implementation.
- Existing source-repository requirements and supported toolchains constrain application. Verified language semantics and API contracts override inaccurate claims in either the book or Uber. Uber takes precedence over conflicting book style preferences. If modern authoritative guidance and Uber recommend materially different designs, record the evidence and ask before resolving a genuine policy conflict.
- Treat broad design principles as durable candidates, not exemptions from review: retain their context and exceptions rather than turning preferences into universal laws.
- Do not add dependencies, broad exceptions, or speculative abstractions merely because a source uses them.
- Whole-book ingestion would make coverage convenient but exhaust context and encourage shallow summaries; rejected. Chapter-per-file conversion would preserve source order but does not match engineering tasks; rejected. Progressive disclosure follows the existing controller skill's reference table.

### Modernization gate
For each candidate recommendation, record whether it is a language guarantee, version-dependent API/runtime behavior, compiler implementation detail, design preference, or workload-dependent performance observation.

For version-sensitive or suspicious claims:
1. Form a public query without private source, book excerpts, local paths, or logs. Use `web_search` to find current primary documentation.
2. Read the authoritative evidence for the specific claim; a search summary alone is insufficient. Prefer specification, package docs, and release notes; use maintained upstream docs for third-party APIs.
3. Compare with the pinned Uber guidance and the existing skill. Record the decision, URL/section, date checked, applicable Go versions, and whether a repository-specific alternative is required.
4. Compile/test small original examples with the intended toolchain. Record exact version and command. Do not claim compatibility with an older baseline from a successful run on 1.27 alone; test that toolchain when required or mark compatibility unverified.
5. If evidence or tools are unavailable, mark the claim blocked and do not integrate it as a normative rule. A later session must be able to see the unresolved claim.

Priority checks include pre-release generics syntax, loop-variable capture, timer/GC semantics, typed atomics versus raw atomics or third-party wrappers, collection helpers, benchmark APIs, goroutine lifecycle helpers, scheduler/container defaults, ABI/stack interpretation, and compiler escape/inlining behavior. These are investigation targets, not assertions that a particular replacement is correct. Check Uber for stale API assumptions as well as the book. Do not carry benchmark numbers forward as general promises.

### Security, observability, failures, and rollout
- Keep the copyrighted PDF, raw extraction, substantial excerpts, and copied diagrams out of Git. Write concise original guidance and original examples with attribution. Do not turn the reference set into a substitute copy of the book.
- No production resources, credentials, or application runtime changes are involved. Observability consists of coverage state, evidence, test results, blockers, and explicit handoff checkpoints; no service telemetry is needed.
- Unreadable extraction: inspect the original page with an available PDF renderer; if none exists, record a blocker rather than infer code or diagram content. Do not install tools without following repository package policy.
- Missing internet: continue only with independently supported material; leave freshness-dependent claims blocked.
- Contradiction or unsupported example: do not mark verified until resolved. No negative evidence from a missing test counts as success.
- Rollout owner: Matteo. Apply only verified changed skill files from this worktree with `chezmoi --source "$PWD" --exclude scripts apply` and explicit target paths. Preview first and compare explicit files afterward. Planning files have no target to apply.
- Rollback: revert the relevant content commit, preview and apply the affected explicit targets; do not apply the full dotfiles tree. Preserve historical source/evidence records needed to explain the reversal.

### Mechanisms and validation seams
| Requirement | Mechanism / evidence | Validation | If unavailable |
|---|---|---|---|
| Read bounded source ranges | Installed `pdftotext -f/-l`; initial extraction succeeded | Inspect one range, boundary, code formatting | Block ambiguous sections; inspect rendered PDF if available |
| Verify source identity | Installed `pdfinfo`, `shasum -a 256`; identity recorded above | Compare before reading batches | Ask for the correct local file |
| Verify freshness | `web_search` returned official release sources; local Go 1.27.3 | Read primary evidence, record versions, run original examples | Block affected claims, not the whole ledger |
| Validate skill structure | Existing `dot_pi/agent/exact_scripts/validate-skills.mjs` | Default/work/personal validators | Resolve tool failure before integration |
| Validate retrieval | Explicit routing table, like `k8s-controller-dev` | Manual scenario table plus link/trigger inspection | Do not claim deterministic model compliance |
| Resume across sessions | Tracked Markdown plan and ledger | Start from files only and identify one exact next batch | Fix checkpoint before ending the session |

## Acceptance contracts
### R1: Bounded, auditable coverage
The workflow SHALL record a disposition for every numbered section in Chapters 1–14, without requiring the full book in model context.
- GIVEN a pending source range, WHEN a batch is complete, THEN its sub-section rows identify source pages, destination/rule, disposition, evidence, and status.
- Negative: reading a page or drafting prose alone SHALL NOT mark it verified or integrated. Front matter is recorded separately as provenance, not silently counted as content review.

### R2: Freshness and compatibility
Integrated guidance SHALL pass the modernization gate when its correctness or recommendation may depend on Go/tool versions.
- GIVEN a suspect 2021 rule, WHEN official documentation contradicts it, THEN the integrated guidance uses verified behavior and records the replacement or omission with evidence.
- Negative: missing evidence, incompatible syntax, or a single modern-toolchain test SHALL NOT justify unqualified support across older Go releases.

### R3: Progressive disclosure
The core skill SHALL identify which reference to load for a task, while retaining critical general safeguards and the agreed opening/version guidance.
- GIVEN an ownership, API-design, concurrency, testing, generics, profiling, or runtime-diagnostics task, WHEN the routing table is inspected, THEN it selects the relevant bounded reference(s).
- Negative: a simple error-wrapping task SHALL NOT require loading runtime diagnostics or all references. Every referenced file must exist before its routing entry is applied.

### R4: Reproducible integration and handoff
A fresh session SHALL identify the next bounded task and reproduce its validation from tracked artifacts and the identified local source.
- GIVEN a completed batch, WHEN another session reads only the plan and relevant ledger rows, THEN it can identify the range, blockers, destination, and verification command without the earlier chat.
- Negative: a missing PDF or failed hash check SHALL stop source processing; neither a missing tool nor a missing example test is a passing result.

## Target files and routing
Candidate references are provisional until their first batch; do not create empty files in advance.

| Exact file under the skill directory | Primary triggers | Initial source chapters |
|---|---|---|
| `references/ownership-and-memory.md` | Pointer/value semantics, aliasing, retained allocations, escape analysis | 2, 3, 14.1–14.2 |
| `references/interfaces-and-design.md` | API boundaries, interfaces, composition, embedding, design tradeoffs | 1, 4, 5 |
| `references/concurrency.md` | Workers, channels, cancellation, races, synchronization | 6, 14.3–14.5 |
| `references/testing-and-benchmarking.md` | Test isolation, benchmark correctness and comparison | 7, 8 |
| `references/generics.md` | Constraints, named collections, generic API design | 9 |
| `references/profiling-and-tracing.md` | CPU/memory profiles, blocking, traces, GC tuning | 10, 11, 12, 14.6 |
| `references/runtime-diagnostics.md` | Stack traces, core dumps, ABI-dependent interpretation | 13 |
| `SOURCES.md` | Traceability and dated evidence, loaded when checking a claim | All retained sources |

## Bounded-session protocol
1. Read this plan, the core skill, and only the relevant coverage rows/destination reference. During execution do not query the mutable learning store.
2. Select one coherent batch of roughly 10–25 printed pages; use fewer when dense or when research expands. Split at section boundaries and overlap only to finish an explanation.
3. Extract only the PDF page range into a temporary file. Read chunks with bounded offsets. Do not emit the entire extraction through a tool response.
4. Compare candidate guidance with existing rules, perform freshness checks, and draft only the incremental guidance needed for the task.
5. Verify before integration. Update evidence, source coverage, and the core routing only for files that exist and have passed review.
6. Update the resume checkpoint with the last completed subsection, exact next page range, open claims, changed files, test commands/results, and commit SHA. A checkpoint must not depend on `/tmp` files or earlier chat.
7. Commit a bounded, independently usable batch; record a blocked partial batch honestly rather than marking it complete to finish a session.

## Initial coverage inventory
This is a navigation inventory from the table of contents, NOT completed content review. Task 1 expands it to subsection-level rows in `coverage.md`. Chapter 14 must be subdivided by blog post and later by numbered subsection where applicable.

| Chapter | Printed pages | PDF pages (provisional +1 mapping) | Status |
|---|---|---|---|
| 1 Introduction | 10–24 | 11–25 | Pending |
| 2 Language Mechanics | 25–40 | 26–41 | Pending; start boundary spot-checked |
| 3 Data Structures | 41–66 | 42–67 | Pending |
| 4 Decoupling | 67–89 | 68–90 | Pending |
| 5 Software Design | 90–118 | 91–119 | Pending |
| 6 Concurrency | 119–150 | 120–151 | Pending |
| 7 Testing | 151–162 | 152–163 | Pending |
| 8 Benchmarking | 163–173 | 164–174 | Pending |
| 9 Generics | 174–199 | 175–200 | Pending; pre-release material needs verification |
| 10 Profiling | 200–219 | 201–220 | Pending |
| 11 Profiling Live Code | 220–232 | 221–233 | Pending |
| 12 Tracing | 233–257 | 234–258 | Pending |
| 13 Stack Traces / Core Dumps | 258–265 | 259–266 | Pending; ABI/version-sensitive |
| 14 Blog Posts | 266–351 | 267–352 | Pending; verify final printed boundary |

Ledger schema: section ID; printed/PDF range; candidate rule ID; destination; disposition (`add`, `already-covered`, `omit` with reason, or `blocked`); evidence URL/section/date and applicable version; original-example test/command/version where relevant; status (`pending`, `drafted`, `verified`, `integrated`); unresolved question. Stable rule IDs link evidence in `SOURCES.md` without copying large evidence blocks into every file. For omitted material, a reviewed reason can complete the row without inventing a test.

## Tasks and slices
### Slice 1: One useful reference and a resumable workflow
#### Task 1: Establish the source ledger and baseline
**Delivers:** A fresh session can select and verify one exact source batch.
**Blocked by:** PR #125 merged and its changes integrated into this worktree, unless the user approves another dependency arrangement.
**Traces to:** R1, R2, R4.
**Files:** `plans/go-notebook-skill/coverage.md`, this plan, skill `SOURCES.md`.
- [ ] Confirm the prerequisite, source hash, page mapping, and actual toolchain/release status.
- [ ] Create the subsection-level ledger from the TOC, including all Chapter 14 posts. Do not mark content reviewed from the TOC.
- [ ] Record source identity and pinned Uber/marketplace inputs in `SOURCES.md`; retain no extracted book text.
- [ ] Set the next batch to Chapter 2, printed 25–40 / PDF 26–41. Split further if verification expands beyond one session.
- [ ] Check page accounting and resume from the ledger alone; run `git diff --check`.
- [ ] Commit with `docs: track Go notebook source coverage`.

#### Task 2: Deliver ownership-and-memory guidance
**Delivers:** The smallest end-to-end reference slice with working routing, evidence, and examples.
**Blocked by:** Task 1.
**Traces to:** R1–R4.
**Files:** skill `references/ownership-and-memory.md`, `SKILL.md`, `SOURCES.md`; plan and coverage ledger.
- [ ] Capture the initial missing-reference/routing state as the manual failing acceptance case; do not introduce an automated model test that claims deterministic compliance.
- [ ] Process Chapter 2 in the first batch, then Chapter 3 in separate bounded batches. Integrate only verified rules; Chapter 14 additions are deferred to Task 3.
- [ ] Deduplicate current rules, retain ownership caveats, and validate original examples in a disposable local Go module with recorded toolchain and commands.
- [ ] Add a precise loading trigger only once the reference is usable. Preserve the opening paragraphs/version baseline.
- [ ] Run the three profile validators and `git diff --check`; manually verify aliasing and retained-memory scenarios select the reference while error-only work does not require it.
- [ ] Preview/apply only changed explicit target files and verify them. Commit each completed batch with a scoped `docs(skills): ...` message and checkpoint its evidence.

### Slice 2: Remaining verified topic references
#### Task 3: Extend by topic, one bounded batch per session
**Delivers:** Independently usable additions, not a single unreviewable book conversion.
**Blocked by:** Task 2 for the extraction/verification pattern; topics do not depend on each other unless a recorded rule requires it.
**Traces to:** R1–R4.
**Files:** The exact remaining candidate references in the target table, existing ownership reference for Chapter 14 additions, `SKILL.md`, `SOURCES.md`, plan and coverage ledger.
- [ ] Review Chapter 1, then Chapters 4–5, to prioritize design/API principles; deliver `interfaces-and-design.md` with bounded source batches.
- [ ] Process concurrency (Chapter 6), testing/benchmarking (7–8), generics (9), profiling/tracing (10–12), and diagnostics (13), using the modernization gate for every suspect claim.
- [ ] Process Chapter 14 in bounded post/section batches; map additions into existing topic references instead of duplicating explanations.
- [ ] For each topic, repeat Task 2's evidence, example, routing, validator, explicit-file apply, and checkpoint checks. A topic may need several sessions and commits.
- [ ] Add no empty references and no unresolved rule to runtime guidance. Mark omissions and blockers explicitly.

### Slice 3: Final integration and fresh-session validation
#### Task 4: Verify coverage, routing, and future-agent guidance
**Delivers:** A compact skill whose references are traceable and discoverable without loading the book.
**Blocked by:** All Task 3 source rows resolved or an explicit user-approved scope reduction.
**Traces to:** R1–R4.
**Files:** All integrated skill/reference/provenance files, plan and coverage ledger; inspect root and `dot_pi/agent/AGENTS.md`.
- [ ] Reconcile every numbered section against the ledger. No pending/blocked claims can be reported as complete; document approved exclusions.
- [ ] Remove duplicate guidance and verify the core/reference size budgets, relative links, original opening paragraphs, version baseline, and absence of merge-history prose.
- [ ] Record manual routing cases for all seven topics plus simple error-only work; check both positive and unnecessary-loading cases. These inspect routing instructions, not guaranteed model behavior.
- [ ] Install source test dependencies with `npm ci --ignore-scripts` in `dot_pi/agent`; run `npm test`, `npm run test:all`, and `npm run test:skills:profiles`; retain dependencies until both suites complete, then remove the disposable source `node_modules`.
- [ ] Review all original examples and version evidence. Distinguish tested toolchains from source-only compatibility checks.
- [ ] Preview/apply only reviewed explicit targets; verify each file rather than trusting a directory-level clean result.
- [ ] Run a fresh-session handoff from tracked artifacts alone and record any missing context.
- [ ] Documentation impact: `SKILL.md` explains routing; `SOURCES.md` records provenance; the plan/ledger record execution. Change `AGENTS.md` only for a demonstrated durable command or trap; otherwise record no change required. Do not add book content to global guidance.
- [ ] Final verification: demonstrate R1–R4 together, including source completeness, blocked-claim handling, routing, and installed-file parity. Commit with `docs(skills): verify Go notebook reference integration`.

## Resume checkpoint
- Planning status: plan prepared; no implementation started. This plan is the only repository file created in the planning stage; `coverage.md` is deliberately deferred to Task 1.
- Next action: run `/systematic-review plans/go-notebook-skill/plan.md` in the recorded worktree. Resolve findings before execution.
- First execution blocker: PR #125 is still open. Check its state; do not assume this branch already includes it.
- First source batch after Task 1: printed Chapter 2 pages 25–40 / PDF 26–41, ownership-and-memory reference. The introduction and TOC used for planning are not completed extraction work.
- Unresolved policy choices: none within the agreed framing. Escalate a genuine modern-guidance/Uber conflict rather than silently changing precedence.
- Resume inputs: this tracked plan, later the relevant ledger rows, source PDF with matching hash, existing core skill, and relevant destination reference. No transcript or temporary file is required.
