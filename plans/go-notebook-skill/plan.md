# Go Notebook Skill Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Go skill with concise, verified guidance from the 2021 Ultimate Go Notebook, using task-specific references and bounded sessions.
**Smallest user-feedback slice:** One reviewed ownership-and-memory reference, linked from the core skill, with source coverage and modernization evidence.
**Out of Scope:** Reproducing the book, committing the PDF or raw extraction, processing all pages in one session, implementing a search service, changing application code, raising consumers' minimum Go versions, or extracting Chapter 1 (*Introduction*), Chapter 13 (*Stack Traces / Core Dumps*), Chapter 14 (*Blog Posts*), and worked-example walkthrough sections (`7.3–7.4`, `10.2`, `11.1`, `11.3`, `11.5–11.6`, `12.1`, `12.6`, `12.8`).
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

Planning branch: `maruina/go-notebook-skill`. Base when created: `origin/main` at `f21e94e`.

Prerequisite status: [PR #125](https://github.com/maruina/dotfiles/pull/125) (head `a1267271f2bc951cf6041baf56fb8fe0e42b6361`) is now MERGED on `main` as `13d2330ff3bfc749e560ff382442b123f7eddcf7` (`13d2330`). That commit contains the agreed 218-line Uber/marketplace `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, restored introduction, Apache-2.0 source attribution, and `## Version baseline`. This branch still starts at `f21e94e` (whose `SKILL.md` is the superseded pre-#125 notebook draft from `b3452d5`, `fb4705b`, and `25879a5`). Task 1 begins by rebasing or merging `origin/main` (`13d2330` or later) into this worktree before creating `SOURCES.md` or `coverage.md`. Treat the pre-#125 commits on `f21e94e` only as historical cross-check context; every book-derived rule must still pass the PDF and modernization gate against `13d2330`.

Only the introduction and table of contents have been reviewed for framing. A spot check of PDF page 26 confirms the Chapter 2 boundary. No content chapter is marked complete and no book-derived skill changes have been made.

## Source identity and evidence
- Local source: `~/Downloads/Ultimate Go Notebook.pdf` (the earlier `.go` filename was a typo).
- Title: Ultimate Go Notebook, First Edition, Version 1.0, William Kennedy with Hoanh An, 2021; copyright page reports Patch 39.
- PDF: 352 pages, 15,697,515 bytes.
- SHA-256: `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13`.
- Initial mapping: PDF page = printed page + 1. PDF page 1 is an unnumbered front cover; PDF pages 2–10 are printed front matter and table of contents pages 1–9; PDF pages 11–351 are printed content pages 10–350 (Chapters 1–14); PDF page 352 is an unnumbered blank back cover. Check boundaries before citing a range and record any exceptions.
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
| Core skill | `dot_pi/agent/exact_skills/go-best-practices/SKILL.md` | Essential rules and explicit task-based loading triggers | Routing scenarios, frontmatter validator, link/line/heading checks |
| Topic references | `dot_pi/agent/exact_skills/go-best-practices/references/*.md` | Bounded, original guidance with focused examples | Source mapping, authoritative checks, example tests, `<= 200` line check |
| Provenance | `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md` | Edition, page references, source revisions, dated modernization evidence | Trace each retained source-derived recommendation; verify no `VENDOR.md` |
| Resume state | `plans/go-notebook-skill/plan.md`, `plans/go-notebook-skill/coverage.md` | Scope, coverage, blockers, decisions, next action | Fresh-session replay without prior chat |

### Key decisions and constraints
- Core `SKILL.md` target: at most 250 lines. Each topic reference target: at most 200 lines. These are context budgets, not permission to drop necessary caveats; move deep topic-specific mechanics from the 218-line `SKILL.md` baseline into the matching `references/*.md` file as each reference lands so `SKILL.md` stays within 250 lines after adding the routing table.
- Preserve all three opening paragraphs from `13d2330`: keep the first two behavioral paragraphs verbatim, preserve the third Apache-2.0 and source-precedence attribution paragraph (updating it when the first book reference lands to point to `SOURCES.md` for full provenance), and keep `## Version baseline`. Do not restore `## Merge decisions` in `SKILL.md` or add `VENDOR.md`; decision evidence belongs in `SOURCES.md` and `plans/go-notebook-skill/coverage.md`.
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
- Rollout owner: Matteo. During `/execute` and `/verify`, preview target changes with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and never run `chezmoi apply` or remove `dot_pi/agent/node_modules` before `/verify` completes. After `/verify` returns `VERIFIED`, apply only verified changed skill files from this worktree with `chezmoi --source "$PWD" --exclude scripts apply ~/.pi/agent/skills/go-best-practices` (and explicit file comparison afterward). Planning files have no target to apply.
- Rollback: revert the relevant content commit, preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices`, and apply `~/.pi/agent/skills/go-best-practices`; do not apply the full dotfiles tree. Preserve historical source/evidence records needed to explain the reversal.

### Mechanisms and validation seams
| Requirement | Mechanism / evidence | Validation | If unavailable |
|---|---|---|---|
| Read bounded source ranges | Installed `pdftotext -f/-l`; initial extraction succeeded | Inspect one range, boundary, code formatting | Block ambiguous sections; inspect rendered PDF if available |
| Verify source identity | Installed `pdfinfo`, `shasum -a 256`; identity recorded above | Compare before reading batches | Ask for the correct local file |
| Verify freshness | `web_search` returned official release sources; local Go 1.27.3 | Read primary evidence, record versions, run original examples in a `mktemp -d` module outside the repo | Block affected claims, not the whole ledger |
| Validate skill structure | `dot_pi/agent/exact_scripts/validate-skills.mjs` (frontmatter) plus shell checks for links, line caps, and headings | `npm run test:skills`, `npm run test:skills:profiles`, link/line/heading checks | Resolve tool failure before integration |
| Validate retrieval | Explicit routing table, like `k8s-controller-dev` | Manual scenario table plus link/trigger inspection | Do not claim deterministic model compliance |
| Resume across sessions | Tracked Markdown plan and ledger | Start from files only and identify one exact next batch | Fix checkpoint before ending the session |

## Acceptance contracts
### R1: Bounded, auditable coverage
The workflow SHALL record a disposition for every numbered section in in-scope Chapters 2–12 (and record explicit exclusions for Chapters 1, 13, and 14), without requiring the full book in model context.
- GIVEN a pending source range in Chapters 2–12, WHEN a chapter slice is complete, THEN its sub-section rows identify source pages, destination/rule, disposition, evidence, and status.
- Negative: reading a page or drafting prose alone SHALL NOT mark it verified or integrated. Front matter and excluded chapters (1, 13, 14) are recorded as provenance/exclusions, not silently counted as content review.

### R2: Freshness and compatibility
Integrated guidance SHALL pass the modernization gate when its correctness or recommendation may depend on Go/tool versions.
- GIVEN a suspect 2021 rule, WHEN official documentation contradicts it, THEN the integrated guidance uses verified behavior and records the replacement or omission with evidence.
- Negative: missing evidence, incompatible syntax, or a single modern-toolchain test SHALL NOT justify unqualified support across older Go releases.

### R3: Progressive disclosure
The core skill SHALL identify which reference to load for a task, while retaining critical general safeguards and the agreed opening/version guidance.
- GIVEN an ownership, API-design, concurrency, testing/benchmarking, generics, or profiling/tracing task, WHEN the routing table is inspected, THEN it selects the relevant bounded reference(s).
- Negative: a simple error-wrapping task SHALL NOT require loading profiling/tracing or all references. Every referenced file must exist before its routing entry is applied.

### R4: Reproducible integration and handoff
A fresh session SHALL identify the next bounded task and reproduce its validation from tracked artifacts and the identified local source.
- GIVEN a completed chapter slice, WHEN another session reads only the plan and relevant ledger rows, THEN it can identify the range, blockers, destination, and verification command without the earlier chat.
- Negative: a missing PDF or failed hash check SHALL stop source processing; neither a missing tool nor a missing example test is a passing result.

## Target files and routing
Candidate references are provisional until their first chapter slice; do not create empty files in advance.

| Exact repo-relative file | Primary triggers | Source chapters (1 chapter per `/execute` slice) |
|---|---|---|
| `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md` | Pointer/value semantics, aliasing, retained allocations, escape analysis | Ch 2 (Slice 1), Ch 3 (Slice 2) |
| `dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md` | API boundaries, interfaces, composition, embedding, design tradeoffs | Ch 4 (Slice 3), Ch 5 (Slice 4) |
| `dot_pi/agent/exact_skills/go-best-practices/references/concurrency.md` | Workers, channels, cancellation, races, synchronization | Ch 6 (Slice 5) |
| `dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md` | Test isolation, benchmark correctness and comparison | Ch 7 (Slice 6), Ch 8 (Slice 7) |
| `dot_pi/agent/exact_skills/go-best-practices/references/generics.md` | Constraints, named collections, generic API design | Ch 9 (Slice 8) |
| `dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md` | CPU/memory profiles, blocking, traces, GC tuning | Ch 10 (Slice 9), Ch 11 (Slice 10), Ch 12 (Slice 11) |
| `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md` | Traceability and dated evidence, loaded when checking a claim | All retained sources |

## Bounded-session protocol
1. Read this plan, the core skill, and only the relevant coverage rows/destination reference. During execution do not query the mutable learning store.
2. Select one coherent batch of roughly 10–25 printed pages; use fewer when dense or when research expands. Split at section boundaries and overlap only to finish an explanation.
3. Extract only the PDF page range into a temporary file. Read chunks with bounded offsets. Do not emit the entire extraction through a tool response.
4. Compare candidate guidance with existing rules, perform freshness checks, and draft only the incremental guidance needed for the task.
5. Verify before integration. Update evidence, source coverage, and the core routing only for files that exist and have passed review.
6. Update the resume checkpoint with the last completed subsection, exact next page range, open claims, changed files, test commands/results, and commit SHA. A checkpoint must not depend on `/tmp` files or earlier chat.
7. Commit a bounded, independently usable batch; record a blocked partial batch honestly rather than marking it complete to finish a session.

## Initial coverage inventory
This is a navigation inventory from the table of contents, NOT completed content review. Task 1 expands in-scope Chapters 2–12 to subsection-level rows in `plans/go-notebook-skill/coverage.md` (marking worked-example walkthrough sections `7.3–7.4`, `10.2`, `11.1`, `11.3`, `11.5–11.6`, `12.1`, `12.6`, and `12.8` as `omit` with reason) and records excluded Chapters 1, 13, and 14 as explicit chapter-level exclusions.

| Chapter | Printed pages | PDF pages (+1 mapping) | Status |
|---|---|---|---|
| 1 Introduction | 10–24 | 11–25 | Excluded (`omit`: general philosophy and previews covered by Ch 2–12 and `SKILL.md`) |
| 2 Language Mechanics | 25–40 | 26–41 | Pending (Slice 1); start boundary spot-checked |
| 3 Data Structures | 41–66 | 42–67 | Pending (Slice 2) |
| 4 Decoupling | 67–89 | 68–90 | Pending (Slice 3) |
| 5 Software Design | 90–118 | 91–119 | Pending (Slice 4) |
| 6 Concurrency | 119–150 | 120–151 | Pending (Slice 5) |
| 7 Testing | 151–162 | 152–163 | Pending (Slice 6) |
| 8 Benchmarking | 163–173 | 164–174 | Pending (Slice 7) |
| 9 Generics | 174–199 | 175–200 | Pending (Slice 8); pre-release material needs verification |
| 10 Profiling | 200–219 | 201–220 | Pending (Slice 9) |
| 11 Profiling Live Code | 220–232 | 221–233 | Pending (Slice 10) |
| 12 Tracing | 233–257 | 234–258 | Pending (Slice 11) |
| 13 Stack Traces / Core Dumps | 258–265 | 259–266 | Excluded (`omit`: Go 1.16/1.17 hex word-packing ABI transition) |
| 14 Blog Posts | 266–350 | 267–351 | Excluded (`omit`: essay reprints duplicating Ch 2, 6, and 10–12; PDF 352 is blank back cover) |

Ledger schema: section ID; printed/PDF range; candidate rule ID; destination; disposition (`add`, `already-covered`, `omit` with reason, or `blocked`); evidence URL/section/date and applicable version; original-example test/command/version where relevant; status (`pending`, `drafted`, `verified`, `integrated`); unresolved question. Stable rule IDs link evidence in `SOURCES.md` without copying large evidence blocks into every file. For omitted material, a reviewed reason can complete the row without inventing a test.

## Tasks and slices
Each `/execute` run completes one slice (at most one chapter, 10–32 printed pages), leaves `dot_pi/agent/node_modules` installed when required for `/verify`, previews target changes with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` without running `chezmoi apply`, and hands off to `/verify`.

### Slice 1: Source ledger and Chapter 2 (`Language Mechanics`) in `ownership-and-memory.md`
#### Task 1: Integrate `main` (`13d2330`) and establish the source ledger
**Delivers:** Worktree rebased onto merged PR #125 (`13d2330`) with `plans/go-notebook-skill/coverage.md` and `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md` initialized.
**Blocked by:** None (`13d2330` is merged on `main`).
**Traces to:** R1, R2, R4.
**Files:** `plans/go-notebook-skill/plan.md`, `plans/go-notebook-skill/coverage.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`.
- [ ] Run the focused red check: `test -f plans/go-notebook-skill/coverage.md && test -f dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`; expect exit status 1 before implementation.
- [ ] Rebase or merge `origin/main` (`13d2330` or later) into `maruina/go-notebook-skill`, and verify `shasum -a 256 "$HOME/Downloads/Ultimate Go Notebook.pdf"` matches `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13` and `go version` reports the active toolchain.
- [ ] Create `plans/go-notebook-skill/coverage.md` with subsection-level rows for Chapters 2–12 from the TOC (marking walkthrough sections `7.3–7.4`, `10.2`, `11.1`, `11.3`, `11.5–11.6`, `12.1`, `12.6`, `12.8` as `omit` with reason) and explicit chapter-level `omit` rows for Chapters 1, 13, and 14. Do not mark in-scope content chapters reviewed from the TOC.
- [ ] Create `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md` recording the book edition/hash, pinned Uber (`1d60a91aa5e87d443002e23c21903c49489dbde5`) and marketplace (`b937ce451cf47154af8566b6ad7776a7749fc810`) revisions, source precedence, and the rule that no `VENDOR.md` or extracted book text is stored.
- [ ] Run `test -f plans/go-notebook-skill/coverage.md && test -f dot_pi/agent/exact_skills/go-best-practices/SOURCES.md && test ! -e dot_pi/agent/exact_skills/go-best-practices/VENDOR.md && git diff --check`; expect exit status 0.
- [ ] Commit with `docs: track Go notebook source coverage`.

#### Task 2: Process Chapter 2 (`Language Mechanics`, printed 25–40 / PDF 26–41)
**Delivers:** Initial `references/ownership-and-memory.md` and `SKILL.md` routing for value/pointer semantics, escape analysis, constants/iota, and struct layout.
**Blocked by:** Task 1.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md`; expect exit status 1.
- [ ] Extract PDF pages 26–41 (`2.1`–`2.15`) to a disposable `/tmp` file, apply the modernization gate, validate original examples in a disposable `mktemp -d` Go module outside the repository, and write verified rules to `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md` while deduplicating `SKILL.md`.
- [ ] Add the `## References` routing table entry for `references/ownership-and-memory.md` and `SOURCES.md` in `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, preserving all three opening paragraphs (updating the third paragraph to reference `SOURCES.md` while keeping the Uber Apache-2.0 attribution) and `## Version baseline`.
- [ ] Update Chapter 2 rows in `plans/go-notebook-skill/coverage.md`, dated evidence in `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, and `## Resume checkpoint` in `plans/go-notebook-skill/plan.md` (next slice: Chapter 3, printed 41–66 / PDF 42–67).
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify structure/budgets with `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md) -le 200 && rg -q '^## Version baseline$' dot_pi/agent/exact_skills/go-best-practices/SKILL.md && ! rg -q '^## Merge decisions$' dot_pi/agent/exact_skills/go-best-practices/SKILL.md && git diff --check`; expect exit status 0.
- [ ] Preview target diff with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` (do not run `chezmoi apply`) and commit with `docs(skills): add Go language mechanics ownership guidance`.

### Slice 2: Chapter 3 (`Data Structures`, printed 41–66 / PDF 42–67)
#### Task 3: Extend `ownership-and-memory.md` with Chapter 3 slice, array, string, and map mechanics
**Delivers:** Complete `references/ownership-and-memory.md` covering CPU caches/data locality caveats, slice aliasing/capacity/append/retention, UTF-8 byte vs. rune iteration, and map semantics.
**Blocked by:** Task 2.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `rg -q '^\| 3\.[0-9]+ .* \| integrated \|' plans/go-notebook-skill/coverage.md`; expect exit status 1.
- [ ] Extract PDF pages 42–67 (`3.1`–`3.24`) to `/tmp`, apply the modernization gate (checking `slices`, `maps`, `strings.Clone`, `bytes.CutLast`/`strings.CutLast`), test original examples in a `mktemp -d` module, and integrate verified rules into `references/ownership-and-memory.md` and `SKILL.md`.
- [ ] Update Chapter 3 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go data structure ownership guidance`.

### Slice 3: Chapter 4 (`Decoupling`, printed 67–89 / PDF 68–90)
#### Task 4: Create `interfaces-and-design.md` with Chapter 4 receiver, method-set, interface, and embedding rules
**Delivers:** Initial `references/interfaces-and-design.md` and `SKILL.md` routing for receivers, method sets, method values, interfaces, embedding, and exporting.
**Blocked by:** Task 3.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md`; expect exit status 1.
- [ ] Extract PDF pages 68–90 (`4.1`–`4.14`) to `/tmp`, apply the modernization gate, test original examples in a `mktemp -d` module, write `references/interfaces-and-design.md`, and add its routing entry in `SKILL.md`.
- [ ] Update Chapter 4 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go decoupling and receiver guidance`.

### Slice 4: Chapter 5 (`Software Design`, printed 90–118 / PDF 91–119)
#### Task 5: Extend `interfaces-and-design.md` with Chapter 5 composition, interface ownership, and error-handling rules
**Delivers:** Complete `references/interfaces-and-design.md` covering composition vs. inheritance, consumer-owned interfaces, typed-nil interface hazards, and error wrapping/inspection.
**Blocked by:** Task 4.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `rg -q '^\| 5\.[0-9]+ .* \| (integrated|already-covered|omit) \|' plans/go-notebook-skill/coverage.md`; expect exit status 1.
- [ ] Extract PDF pages 91–119 (`5.1`–`5.13`) to `/tmp`, apply the modernization gate (`errors.Is`/`errors.As`/`errors.Join`), test original examples in a `mktemp -d` module, and update `references/interfaces-and-design.md`, `SKILL.md`, `SOURCES.md`, `coverage.md`, and `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go interface composition and error design guidance`.

### Slice 5: Chapter 6 (`Concurrency`, printed 119–150 / PDF 120–151)
#### Task 6: Create `concurrency.md` with Chapter 6 scheduler, race, mutex/atomic, and channel patterns
**Delivers:** `references/concurrency.md` and `SKILL.md` routing covering goroutine lifetime ownership, race detection, atomics vs. mutexes, channel buffering/signaling, and bounded fan-out/pooling/cancellation patterns (`6.1`–`6.11.10`).
**Blocked by:** Task 5.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/concurrency.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/concurrency.md`; expect exit status 1.
- [ ] Extract PDF pages 120–151 (`6.1`–`6.11.10`) in two bounded sub-reads (`6.1`–`6.9` and `6.10`–`6.11.10`), apply the modernization gate (checking Go 1.23+ timer GC/unbuffered channels, Go 1.27 `asynctimerchan` removal, `sync.WaitGroup.Go`, and Uber `go.uber.org/atomic` vs. `sync/atomic`), test original examples in a `mktemp -d` module, write `references/concurrency.md`, and add its routing entry in `SKILL.md`.
- [ ] Update Chapter 6 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/concurrency.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go concurrency and channel pattern guidance`.

### Slice 6: Chapter 7 (`Testing`, printed 151–162 / PDF 152–163)
#### Task 7: Create `testing-and-benchmarking.md` with Chapter 7 unit, table, `httptest`, and subtest guidance
**Delivers:** Initial `references/testing-and-benchmarking.md` and `SKILL.md` routing for unit tests, table tests, `httptest` isolation, and parallel subtest isolation (`7.1`–`7.5`).
**Blocked by:** Task 6.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md`; expect exit status 1.
- [ ] Extract PDF pages 152–163 (`7.1`–`7.5`), apply the modernization gate (Go 1.22+ loop-variable capture vs. earlier baselines, Uber table-test conventions), test original examples in a `mktemp -d` module, write `references/testing-and-benchmarking.md`, and add its routing entry in `SKILL.md`.
- [ ] Update Chapter 7 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go testing guidance`.

### Slice 7: Chapter 8 (`Benchmarking`, printed 163–173 / PDF 164–174)
#### Task 8: Extend `testing-and-benchmarking.md` with Chapter 8 benchmark construction and validation rules
**Delivers:** Complete `references/testing-and-benchmarking.md` covering benchmark accuracy, sub-benchmarks, compiler dead-code/inlining traps, `testing.B.Loop` (Go 1.24+), and `benchstat`.
**Blocked by:** Task 7.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `rg -q '^\| 8\.[0-9]+ .* \| (integrated|already-covered|omit) \|' plans/go-notebook-skill/coverage.md`; expect exit status 1.
- [ ] Extract PDF pages 164–174 (`8.1`–`8.3`), apply the modernization gate (`testing.B.Loop` vs. `b.N`), test original examples in a `mktemp -d` module, and update `references/testing-and-benchmarking.md`, `SKILL.md`, `SOURCES.md`, `coverage.md`, and `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go benchmarking guidance`.

### Slice 8: Chapter 9 (`Generics`, printed 174–199 / PDF 175–200)
#### Task 9: Create `generics.md` with modernized Chapter 9 constraint and collection guidance
**Delivers:** `references/generics.md` and `SKILL.md` routing with pre-release 2021 draft syntax replaced by verified Go 1.18–1.27 semantics (`~T`, `S ~[]E`, `var zero T`, `cmp.Ordered`, generic methods in Go 1.27).
**Blocked by:** Task 8.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/generics.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/generics.md`; expect exit status 1.
- [ ] Extract PDF pages 175–200 (`9.1`–`9.10`), apply the modernization gate against the Go language specification (replacing any pre-1.18 draft `type` list syntax or obsolete restrictions), test original examples in a `mktemp -d` module, write `references/generics.md`, and add its routing entry in `SKILL.md`.
- [ ] Update Chapter 9 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/generics.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go generics guidance`.

### Slice 9: Chapter 10 (`Profiling`, printed 200–219 / PDF 201–220)
#### Task 10: Create `profiling-and-tracing.md` with Chapter 10 profiling, inlining, and escape-analysis diagnosis rules
**Delivers:** Initial `references/profiling-and-tracing.md` and `SKILL.md` routing for profile types, flat vs. cumulative cost, allocation vs. live heap profiles, and `-gcflags='-m'` interpretation (`10.1`–`10.6`).
**Blocked by:** Task 9.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `test -f dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md`; expect exit status 1.
- [ ] Extract PDF pages 201–220 (`10.1`–`10.6`), apply the modernization gate, test original examples in a `mktemp -d` module, write `references/profiling-and-tracing.md`, and add its routing entry in `SKILL.md`.
- [ ] Update Chapter 10 rows in `coverage.md`, evidence in `SOURCES.md`, and `## Resume checkpoint` in `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go profiling guidance`.

### Slice 10: Chapter 11 (`Profiling Live Code`, printed 220–232 / PDF 221–233)
#### Task 11: Extend `profiling-and-tracing.md` with Chapter 11 `gctrace` and live HTTP profiling rules
**Delivers:** Live-service `GODEBUG=gctrace=1` and `net/http/pprof` endpoint safety and memory-profile comparison guidance in `references/profiling-and-tracing.md` (`11.1`–`11.6`).
**Blocked by:** Task 10.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `rg -q '^\| 11\.[0-9]+ .* \| (integrated|already-covered|omit) \|' plans/go-notebook-skill/coverage.md`; expect exit status 1.
- [ ] Extract PDF pages 221–233 (`11.1`–`11.6`), apply the modernization gate, update `references/profiling-and-tracing.md`, `SKILL.md`, `SOURCES.md`, `coverage.md`, and `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go live profiling and gctrace guidance`.

### Slice 11: Chapter 12 (`Tracing`, printed 233–257 / PDF 234–258)
#### Task 12: Extend `profiling-and-tracing.md` with Chapter 12 execution tracing, fan-out/pooling, and GC tuning rules
**Delivers:** Complete `references/profiling-and-tracing.md` covering `runtime/trace` tasks/regions, trace interpretation, `sync.Pool` caveats, and `GOGC`/`GOMEMLIMIT` tuning (`12.1`–`12.10`).
**Blocked by:** Task 11.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md`, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`.
- [ ] Run the focused red check: `rg -q '^\| 12\.[0-9]+ .* \| (integrated|already-covered|omit) \|' plans/go-notebook-skill/coverage.md`; expect exit status 1.
- [ ] Extract PDF pages 234–258 (`12.1`–`12.10`), apply the modernization gate (`GOMEMLIMIT` in Go 1.19+, modern `go tool trace`), test original examples in a `mktemp -d` module, and update `references/profiling-and-tracing.md`, `SKILL.md`, `SOURCES.md`, `coverage.md`, and `plan.md`.
- [ ] Run `(cd dot_pi/agent && npm run test:skills && npm run test:skills:profiles)` and verify `test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/SKILL.md) -le 250 && test $(wc -l < dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md) -le 200 && git diff --check`; expect exit status 0.
- [ ] Preview with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` and commit with `docs(skills): add Go runtime tracing and GC tuning guidance`.

### Slice 12: Final integration, cross-reference deduplication, and fresh-session validation
#### Task 13: Verify full coverage, routing, test suites, and future-agent guidance
**Delivers:** A compact, deduplicated `go-best-practices` skill whose six references and `SOURCES.md` are traceable and verified across all profiles.
**Blocked by:** Tasks 1–12.
**Traces to:** R1–R4.
**Files:** `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`, `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md`, `dot_pi/agent/exact_skills/go-best-practices/references/interfaces-and-design.md`, `dot_pi/agent/exact_skills/go-best-practices/references/concurrency.md`, `dot_pi/agent/exact_skills/go-best-practices/references/testing-and-benchmarking.md`, `dot_pi/agent/exact_skills/go-best-practices/references/generics.md`, `dot_pi/agent/exact_skills/go-best-practices/references/profiling-and-tracing.md`, `plans/go-notebook-skill/coverage.md`, `plans/go-notebook-skill/plan.md`, `AGENTS.md`, `dot_pi/agent/AGENTS.md`.
- [ ] Run the focused red check for any unresolved `pending` or `drafted` row in `plans/go-notebook-skill/coverage.md`: `! rg -q '\| (pending|drafted) \|' plans/go-notebook-skill/coverage.md`; resolve or explicitly document any `blocked` row before proceeding.
- [ ] Deduplicate across `SKILL.md` and all six `references/*.md` files, and run the structural assertion:
  `set skill_dir dot_pi/agent/exact_skills/go-best-practices; test $(wc -l < "$skill_dir/SKILL.md") -le 250; and test ! -e "$skill_dir/VENDOR.md"; and rg -q '^## Version baseline$' "$skill_dir/SKILL.md"; and not rg -q '^## Merge decisions$' "$skill_dir/SKILL.md"; and for f in SOURCES.md references/ownership-and-memory.md references/interfaces-and-design.md references/concurrency.md references/testing-and-benchmarking.md references/generics.md references/profiling-and-tracing.md; test -f "$skill_dir/$f"; and rg -q "$f" "$skill_dir/SKILL.md"; or exit 1; end; and for f in $skill_dir/references/*.md; test $(wc -l < "$f") -le 200; or exit 1; end`
  Expect exit status 0.
- [ ] Record manual routing cases in `plans/go-notebook-skill/coverage.md` for all six topic references plus simple error-only work; check both positive and unnecessary-loading cases.
- [ ] Install locked source test dependencies with `(cd dot_pi/agent && npm ci --ignore-scripts)` and run `(cd dot_pi/agent && npm test && npm run test:all && npm run test:skills:profiles)`; expect exit status 0. Leave `dot_pi/agent/node_modules` present in the worktree so independent read-only `/verify` can rerun `npm test` and `npm run test:all`.
- [ ] Preview target diff with `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices` (do not run `chezmoi apply` during `/execute`) and run `git diff --check`; expect exit status 0.
- [ ] Inspect `AGENTS.md` and `dot_pi/agent/AGENTS.md` for documentation impact. Change `AGENTS.md` only for a demonstrated durable command or trap; otherwise record no change required.
- [ ] Final verification: demonstrate R1–R4 together, including source completeness for Chapters 2–12, explicit exclusion rows for Chapters 1/13/14, blocked-claim handling, routing table completeness, and clean `chezmoi diff`. Commit with `docs(skills): verify Go notebook reference integration`.

## Post-Verification Rollout
Run only after independent `/verify` returns `VERIFIED`:
- [ ] Preview target changes from the worktree root: `chezmoi --source "$PWD" diff ~/.pi/agent/skills/go-best-practices`.
- [ ] Apply only the verified skill directory: `chezmoi --source "$PWD" --exclude scripts apply ~/.pi/agent/skills/go-best-practices` and verify parity with `diff -ru dot_pi/agent/exact_skills/go-best-practices ~/.pi/agent/skills/go-best-practices`.
- [ ] Remove disposable source dependencies after `/verify` is complete: `rm -rf dot_pi/agent/node_modules`.

## Resume checkpoint
- Planning status: plan reviewed and updated; no implementation started. `plans/go-notebook-skill/plan.md` is the only file created in planning; `plans/go-notebook-skill/coverage.md` is created in Slice 1 Task 1.
- Next action: run `/execute plans/go-notebook-skill/plan.md` to execute Slice 1 (Task 1 ledger + Task 2 Chapter 2 `Language Mechanics`).
- Prerequisite status: PR #125 is merged on `main` (`13d2330`). Task 1 rebases/merges `origin/main` (`13d2330` or later) into `maruina/go-notebook-skill` before creating `SOURCES.md` and `coverage.md`.
- First source batch in Slice 1 Task 2: printed Chapter 2 pages 25–40 / PDF 26–41 → `dot_pi/agent/exact_skills/go-best-practices/references/ownership-and-memory.md`. Chapters 1, 13, and 14 are excluded by user decision; Chapters 2–12 execute one chapter per `/execute` slice.
- Unresolved policy choices: none within the agreed framing. Escalate a genuine modern-guidance/Uber conflict rather than silently changing precedence.
- Resume inputs: this tracked plan, relevant rows in `plans/go-notebook-skill/coverage.md`, source PDF with matching hash, `dot_pi/agent/exact_skills/go-best-practices/SKILL.md`, and the target reference file. No transcript or `/tmp` file is required.
