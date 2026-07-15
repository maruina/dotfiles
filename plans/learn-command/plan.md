# Evidence-Backed Learn Command Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/compound` with an interactive, evidence-gated `/learn` workflow and make `/brainstorm` and `/plan` consume only relevant approved learnings before committing decisions.
**Architecture:** A small Node.js helper performs deterministic local evidence operations: Pi session-window selection, targeted retained-history search, bounded tree context, and selective extraction of atomic learning sections. Prompt templates retain responsibility for evidence adjudication, GitHub and Obsidian orchestration, human preview and approval, lifecycle consumption, and source precedence; `/execute` and `/verify` remain independent of the mutable vault.
**Tech Stack:** Markdown Pi prompt templates, Node.js 25 with `node:test`, Pi 0.80.6 session APIs and RPC mode, GitHub CLI, Obsidian CLI, npm, Git, and chezmoi

---

## Goal and Scope
Implement the behavior approved in `plans/learn-command/design.md` and the confirmed planning alignment brief:

- Replace `/compound` with `/learn` without an alias.
- Support a previous-local-day retrospective and an explicit-context mode.
- Discover candidate evidence from every Pi session branch active in the selected window and from pull requests authored by `maruina` or `matteo-ruina_ddog` and merged in the same window.
- Treat a supplied pull request, review/comment URL, design/plan path, wrong turn, or free-form context as an on-demand evidence source even when a referenced pull request is still open.
- Separate broad candidate discovery from targeted historical adjudication; raw matches never count as independent occurrences.
- Require one of the design's three qualification paths before proposing a learning.
- Present every proposed addition, update, and migration deletion in final form before one approval decision.
- Store approved guidance as compact atomic H2 sections in `Datadog/Learnings.md`, merging overlapping evidence and preserving all source-repository provenance.
- Make `/brainstorm` and `/plan` retrieve only relevant sections, treat them as advisory, and preserve material guidance in committed lifecycle artifacts.
- Keep `/execute` and `/verify` independent of direct vault access.
- Adjudicate the existing `Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md` note through the same evidence gate, then preview its deletion whether or not a replacement learning qualifies.

Out of scope:

- A scheduler, daemon, daily digest, activity report, telemetry, remote knowledge service, custom Pi extension, or custom TUI.
- Pull requests authored by other people or pull requests Matteo only reviewed.
- A `/compound` compatibility alias.
- A taxonomy of repository/topic/category folders or one file per learning.
- Automatic model-based writes, automatic acceptance of raw keyword counts, or a complete copy of Every's compound framework.
- Direct learning retrieval from `/execute`, `/verify`, or unrelated prompts.
- Guaranteeing evidence completeness beyond retained and accessible local sessions and GitHub sources.

## Feasibility Gate
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Discover all Pi entries in the previous local day, including abandoned branches | `learn-evidence.mjs sessions-window` uses Pi's exported `parseSessionEntries()` and each entry's ISO timestamp and `id`/`parentId` tree | Pi 0.80.6 exports the parser and session types; the retained archive contains 476 valid v3 sessions, including 57 branched files | Fixture tests cover local midnight boundaries, a session started earlier, multiple branches, shared ancestors, out-of-window entries, and malformed files | Return structured source errors; `/learn` may use other accessible evidence but MUST report the incomplete session set and MUST NOT claim a complete count |
| Search retained history narrowly and inspect enough branch context | `learn-evidence.mjs sessions-search` returns typed bounded matches and `session-context` returns bounded ancestry/descendant context for selected entry IDs | Session entries expose stable IDs, parent IDs, roles, timestamps, and text content | Fixtures distinguish repeated failures, quotations, repeated tool output, injected custom context, unrelated matches, result limits, and truncation metadata | Refine terms or disclose truncation/inaccessibility; do not convert raw or incomplete matches into recurrence claims |
| Select relevant atomic learning sections without sending the whole store to the model | `learn-evidence.mjs learning-sections` reads Markdown from stdin, parses H2 sections, and returns only sections matching supplied narrow terms | Obsidian CLI can read an exact path, but cannot read a heading directly; local section extraction supplies the missing supported seam | Fixtures include title, tags, repository metadata, body matches, unrelated sections, overlap, and multi-repository provenance | `/brainstorm` and `/plan` record the skipped evidence source and continue; `/learn` stops before preview or mutation when it cannot safely inspect the complete store |
| Discover both GitHub identities' merged pull requests | Capture the exact local time range. While `maruina` is active, run global searches for `--author maruina` and `--author matteo-ruina_ddog`; while `matteo-ruina_ddog` is active, run owner-scoped searches for that author under `ddoghq` and `ddoghq-sandbox`. Every command uses `--merged --merged-at "$SEARCH_START_DATE..$SEARCH_END_DATE" --limit 1000`; deduplicate by PR URL, fetch `mergedAt` with `gh pr view`, and retain only exact-range merges | Both accounts are authenticated with `repo` and `read:org` scopes; the installed CLI exposes the required search and JSON fields; this routing follows `dot_pi/agent/AGENTS.md` | Controlled daily run reports account, owner scope, author, exact range, retained PRs, inaccessible sources, deduplication, and possible truncation when a search reaches 1000 results | Report the account/source as inaccessible and continue only with an explicitly incomplete evidence set; do not treat inaccessibility as no matching PRs |
| Inspect pull-request evidence surfaces | `gh pr view --json` for metadata, files, commits, reviews, and conversation comments; `gh pr diff`; GraphQL `reviewThreads` for inline comments and resolution state | The installed CLI returned PR #22 metadata and accepted the tested `reviewThreads` query | Contextual smoke run reports every inspected surface and whether thread status was known | Mark the unavailable surface explicitly; do not infer review acceptance from missing comments or unknown resolution state |
| Preserve the original GitHub account | Read the active login with `gh auth status --json hosts`; switch to each required identity; restore the captured login on every normal and error path | The installed CLI returns stable `login`, `active`, and `state` fields and supports explicit `gh auth switch` | Compare active login before and after daily, contextual, and injected-failure procedures | Stop further GitHub and vault mutation work, report the failed restoration, and require manual account repair |
| Require one stable human confirmation | A prompt-template turn shows all exact proposed changes and ends; the next user turn accepts or rejects the complete set | Pi prompt templates expand into normal persisted conversation turns | Contextual rejection proves no mutation; approved rollout proves exact read-back | Rejection or ambiguous approval performs no vault mutation |
| Apply all approved vault changes or restore the snapshots | Before preview, save mode-0600 snapshots of `Learnings.md` and the legacy note's existence/content; after approval, use Obsidian create/overwrite and optional delete, inspect CLI output, read back exact state, and compensate on any failure | Obsidian CLI supports exact-path read, create/overwrite, and delete; observed missing-file errors return status 0, so output and state verification are required | Controlled failure test injects a delete failure after a successful write and verifies both files match their snapshots | Restore both snapshots, verify the restoration, report any restoration failure, and never claim the approved transaction succeeded |
| Discover `/learn` and remove `/compound` | Chezmoi renders top-level `exact_prompts/*.md` into Pi's non-recursive global prompt directory; Pi RPC `get_commands` enumerates prompt templates | Pi prompt-template and RPC docs define both mechanisms; the current RPC response includes `/compound` | Source-layout RPC check before apply and rendered-layout RPC check after apply assert `/learn` exists exactly once and `/compound` is absent | Block rollout; do not add an alias or extension fallback |
| Validate prompt semantics proportionately | Fixture-driven helper tests, prompt-contract tests, source/rendered RPC discovery, and reproducible manual model runs | The repository uses `node:test`, npm gates, and Pi RPC smoke tests | Focused tests, `npm test`, `npm run test:all`, targeted chezmoi diffs, and the controlled procedures in this plan | Block the affected requirement; do not substitute file-presence checks for missing behavioral evidence |

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Deterministic evidence helper | `dot_pi/agent/exact_scripts/learn-evidence.mjs`, `dot_pi/agent/exact_scripts/learn-evidence.test.mjs` | Parse supported Pi sessions, select local-day entries from every branch, search retained text, return bounded tree context, and select matching learning sections as versioned JSON | `node --test exact_scripts/learn-evidence.test.mjs` |
| Test registration | `dot_pi/agent/package.json` | Run helper and prompt-contract tests in source and rendered layouts as part of the normal npm gate | `npm test` and `npm run test:all` |
| Learn command | `dot_pi/agent/exact_prompts/learn.md`, `dot_pi/agent/exact_prompts/compound.md` | Own invocation modes, source collection, adjudication, qualification, exact preview, one approval gate, vault transaction, and legacy-note migration; remove the old command | Prompt-contract tests, source RPC discovery, controlled prompt procedures, and targeted chezmoi diff |
| Learning consumers | `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md` | Derive narrow terms during discovery, load only matched sections, apply source precedence, record material guidance or a retrieval gap, and continue safely when the advisory store is absent/unavailable | Prompt-contract tests and controlled consumer procedure |
| Lifecycle guidance | `dot_pi/agent/exact_prompts/simplify.md`, `dot_pi/agent/AGENTS.md` | Replace durable `/compound` lifecycle references with `/learn` without duplicating the command's detailed contract | Prompt-contract tests and complete diff inspection |
| Prompt contracts | `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` | Guard command discovery shape, qualification/write gates, consumer behavior, lifecycle references, security rules, and the absence of direct vault lookup in `/execute` and `/verify` | `node --test exact_scripts/learn-prompts.test.mjs` |

**Key Decisions**
- Keep one helper with explicit subcommands for deterministic local evidence operations. The helper owns no qualification, candidate wording, approval, GitHub calls, or vault mutation.
- Reuse Pi's exported session parser rather than implement another version/migration layer. Parse every retained file independently so one malformed file can be reported without hiding other evidence.
- Emit schema-versioned JSON on stdout and diagnostics on stderr. Include the local date/timezone, inclusive `startIso`, exclusive `endIso`, UTC `searchStartDate`/`searchEndDate` values covering that interval for GitHub's date-only qualifier, searched source bounds, total and returned counts, truncation, file-level errors, entry IDs, roles/types, and timestamps so agents do not infer hidden state.
- Index only visible text blocks and labeled tool-result text needed to locate errors. Omit image data, assistant thinking blocks, tool-call arguments, and `custom_message` content from candidate search output; retain type metadata needed to exclude injected context during adjudication.
- Use bounded excerpts for discovery and targeted context expansion for adjudication. Never dump the complete retained archive into model context.
- Resolve the helper from `dot_pi/agent/exact_scripts/learn-evidence.mjs` when validating from this source worktree and from `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs` in normal rendered use.
- Search both author identities with account routing from `dot_pi/agent/AGENTS.md`: use `maruina` for global searches accessible to the personal account, including `DataDog`, and use `matteo-ruina_ddog` only for owner-scoped `ddoghq` and `ddoghq-sandbox` searches. Deduplicate overlapping public results by PR URL. Use broad date qualifiers only for discovery and exact `mergedAt` timestamps for the local-day decision.
- Route per-PR inspection with the same account rule: use `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`, and `maruina` for every other repository, including `DataDog/*`. Capture and restore the original GitHub login around search and inspection. A restoration failure is a safety failure and blocks vault mutation.
- Treat reviewer guidance as accepted only after inspecting the final diff and available thread/reply/resolution evidence; review presence alone does not qualify a learning.
- Treat all raw history matches as candidate locators. The prompt must group messages from one wrong turn into one occurrence and independently adjudicate material equivalence.
- Use one approval turn for the exact complete candidate set. No approval is requested when no learning qualifies, except that legacy-note migration always previews and requests approval for the deletion.
- Rewrite `Datadog/Learnings.md` once per approved transaction from an exact staged final document, then perform an approved legacy deletion when applicable. Verify and compensate both paths because Obsidian's exit status alone is not trustworthy.
- Use one H2 section per behavioral intervention. Required fields are `Use when`, `Do`, and `Evidence`; `Avoid` and `Why` remain optional. Keep approximately three to six bullets.
- List every distinct evidence repository as an individual code span on the metadata line. The date is the last approved update date; evidence bullets retain source-specific links or safe local references.
- Treat an absent `Learnings.md` as an empty store. `/learn` fails closed when Obsidian or complete-store inspection is unavailable; `/brainstorm` and `/plan` continue and record the evidence gap.
- Keep current code, tests, tool behavior, and authoritative documentation above learnings. Correct stale guidance instead of allowing it to override stronger sources.
- Do not change `/execute` or `/verify`. Contract tests ensure they gain no `Learnings.md`, Obsidian, or helper invocation.

**Security Requirements**
- The workflow MUST NOT copy access tokens, credentials, secrets, assistant thinking blocks, raw private-message dumps, unrelated conversation content, or tool-call arguments into helper output, previews, or `Learnings.md`.
- The workflow MUST NOT use `gh auth status --show-token`, print tokens, or persist tokens in temporary files, commands, or evidence output.
- Session and vault content MUST remain local except for the portions deliberately sent to the current Pi model for this workflow. The workflow MUST NOT call an additional model or external service solely to analyze private evidence.
- Temporary snapshots and staged final content MUST use mode 0600, MUST live outside the repository and vault, and MUST be deleted on success, rejection, and recoverable failure.
- Source links MAY be omitted when sharing the link would cross an access boundary. Local session paths and entry IDs are private evidence references, not public links.
- The helper MUST reject structurally invalid arguments and paths with structured errors; it MUST NOT normalize arbitrary paths into a different evidence source.
- The approval preview MUST omit or redact sensitive evidence while remaining specific enough to justify qualification.

**Observability Requirements**
- `/learn` MUST report the selected local-time range, session and GitHub sources inspected, malformed/inaccessible/truncated sources, original/final GitHub login, candidates rejected by the qualification gate, exact qualifying previews, approval outcome, vault transaction result, and final affected paths.
- Helper JSON MUST include schema version, source bounds, totals, returned counts, and truncation/error fields.
- `/brainstorm` and `/plan` MUST record material learning guidance in their committed artifact and MUST record when Obsidian retrieval was unavailable. They need not add noise when `Learnings.md` is simply absent.
- No metrics, traces, alerts, dashboards, service logs, scheduler logs, or on-call runbook are required. This is an interactive local workflow owned by Matteo.

**Failure Modes to Handle**
- A malformed or unreadable session file: report the file and continue with an explicitly incomplete retained-history set.
- Result truncation: refine the query or disclose the bound; never present the returned count as a complete recurrence count.
- One GitHub identity or PR surface is inaccessible: report it and continue only with labeled incomplete evidence.
- GitHub account restoration fails: stop before preview/write, report current and intended logins, and require manual repair.
- Obsidian is unavailable to `/learn`, the complete store cannot be inspected, or the legacy note cannot be snapshotted during migration: stop without vault mutation.
- Obsidian is unavailable to `/brainstorm` or `/plan`: continue with repository discovery and record the skipped evidence source in the durable artifact.
- `Learnings.md` does not exist: treat it as empty; do not misclassify Obsidian's status-0 missing-file message as file content.
- No candidate qualifies: report why and do not ask for approval or write, except for the separately previewed legacy-note deletion during migration.
- User rejects or gives ambiguous approval: delete temporary snapshots and leave both vault paths unchanged.
- Approved write/delete or read-back fails: restore both pre-approval snapshots, verify restoration, report the failed step, and retain no partial-success claim.
- An overlapping section exists: update that section's guidance/evidence/provenance instead of adding a second H2 section.
- A learning conflicts with stronger current evidence: omit or correct the stale guidance and cite the stronger source.

**Rollout and Rollback**
- Smallest safe implementation candidate: land the helper/tests, `/learn` rename, consumers, and lifecycle wording as reviewable commits on `maruina/learn-command`; do not apply managed targets during `/execute`.
- Before `/verify`, install locked source dependencies with `npm ci --ignore-scripts`, run all source gates, inspect the complete source diff, and leave ignored `dot_pi/agent/node_modules` present for the independent read-only verification run.
- After a fresh `VERIFIED` result, inspect targeted rendered diffs and apply only `~/.pi/agent/scripts`, `~/.pi/agent/prompts`, `~/.pi/agent/AGENTS.md`, and `~/.pi/agent/package.json` from the verified worktree. Then run rendered npm/RPC checks before the live migration.
- Run the contextual PR #22 migration through the newly rendered `/learn`, inspect its exact addition/update/deletion preview, and approve or reject it as an independent human decision. A rejection leaves the old note for a later run and does not invalidate the source rollout.
- Fastest source rollback: revert the implementation commits, inspect the same targeted chezmoi diff, and apply the same targets. This restores `/compound` and removes `/learn` and its helper/consumer behavior.
- Fastest vault rollback: use the transaction snapshot during the active run or Obsidian file history after completion to restore the prior `Learnings.md` and legacy note. The owner is Matteo; there is no remote service cleanup.

**Test Strategy**
- Test pure helper behavior with temporary JSONL and Markdown fixtures. Import exported pure functions for focused behavior and invoke the CLI for argument, JSON schema, exit-status, stdout/stderr, and truncation contracts.
- Mock no helper internals. Fixture files are the supported session/Markdown boundaries.
- Prompt-contract tests inspect durable semantic markers and prohibited references rather than exact full prose. They do not claim that a model followed the prompt.
- Use Pi RPC `get_commands` for actual prompt discovery in the source and rendered layouts.
- Use real GitHub and Obsidian only in the explicit manual procedures. Snapshot all mutable state, compare account/file state before and after, reject before the first live write, and reserve the approved migration write for post-`VERIFIED` rollout.
- Full LLM behavior is not automated because it depends on model judgment, private retained evidence, two authenticated GitHub accounts, and a human approval turn. The manual procedures below define exact preconditions, invocation, observable output, state comparison, and cleanup.
- The first narrow red commands are `node --test exact_scripts/learn-evidence.test.mjs` after the test imports the absent helper, and `node --test exact_scripts/learn-prompts.test.mjs` while `learn.md` is absent and `compound.md` remains.

## Acceptance Requirements
### Requirement R1: Complete bounded daily discovery
The system SHALL discover candidate evidence from every accessible Pi entry added during the previous local calendar day and every accessible pull request authored by either configured identity and merged during that exact local-time window.

#### Scenario R1.1: Session started before the selected day
- GIVEN a v3 session whose header and initial messages predate the selected local day and whose later entries fall inside and after that day
- WHEN `sessions-window` scans the selected date
- THEN it returns the in-window entries with the session path, working directory, entry IDs, parent IDs, roles/types, and exact range
- AND it excludes the earlier and later entries from the activity set while preserving their availability for bounded context

#### Scenario R1.2: Abandoned branch is retained
- GIVEN a session tree with two children from one parent and activity on both branches during the selected day
- WHEN `sessions-window` scans the file
- THEN it returns unique in-window entries from both branches regardless of the file's current leaf
- AND shared ancestors are not counted as multiple independent events

#### Scenario R1.3: Exact merged pull-request range
- GIVEN search results for both identities that include a merge just before, inside, and just after the local-day interval
- WHEN `/learn` resolves each candidate's `mergedAt`
- THEN only the inside merge enters candidate discovery
- AND the report names the account, exact interval, inaccessible surfaces, and possible search truncation

### Requirement R2: Evidence-backed qualification
The system SHALL propose a learning only when it is actionable, likely to improve future `/brainstorm` or `/plan` decisions, broader than one exact diff, and supported by at least one approved qualification path.

#### Scenario R2.1: Repeated equivalent model mistake
- GIVEN retained matches containing two independent materially equivalent wrong decisions, one quotation, one repeated tool result, and one unrelated event
- WHEN `/learn` deep-reads targeted branch context and adjudicates occurrences
- THEN it counts only the two independent wrong decisions
- AND the preview states retained source/date bounds without implying completeness

#### Scenario R2.2: One costly disproven wrong turn
- GIVEN one model-directed approach that caused material rework and current source, tests, documentation, or tool behavior clearly disproves it
- WHEN `/learn` applies the qualification gate
- THEN it may propose one behavioral intervention without recurrence
- AND its evidence identifies the failed decision, disproving source, and future condition where the intervention applies

#### Scenario R2.3: Accepted reviewer guidance
- GIVEN a reviewer supplied generalizable guidance in a review body, inline thread, or PR conversation comment and the final change materially incorporated it
- WHEN `/learn` inspects the discussion, resolution/reply state when available, diff, and final merged result
- THEN it may qualify the guidance without recurrence
- AND review presence without demonstrated acceptance does not qualify

#### Scenario R2.4: Routine information is rejected
- GIVEN a dependency bump, changelog fact, mechanical edit, obvious documentation, or unsupported model assertion
- WHEN `/learn` applies the qualification gate
- THEN it reports no learning for that topic
- AND it does not pad the store or ask for approval unless the migration deletion exception applies

### Requirement R3: Exact preview and transactional approval
The system SHALL mutate the vault only after one explicit approval of the complete exact candidate set and SHALL leave or restore all affected vault paths to their pre-approval state on rejection or failure.

#### Scenario R3.1: Complete preview
- GIVEN one new section, one overlapping section update, and the approved migration deletion are proposed
- WHEN `/learn` reaches the write gate
- THEN it shows each candidate's `Why save this`, adjudicated evidence, exact final H2 section, and exact deletion
- AND it asks once whether to apply the complete set

#### Scenario R3.2: Rejection
- GIVEN snapshotted `Learnings.md` and legacy-note state and an exact preview
- WHEN the user rejects or does not clearly approve
- THEN neither vault path changes
- AND temporary snapshots are removed

#### Scenario R3.3: Approved addition and overlap update
- GIVEN one new topic and one materially overlapping existing section
- WHEN the user approves the complete preview
- THEN `Learnings.md` contains one new H2 section and one updated existing H2 section
- AND it contains no duplicate overlap
- AND each section lists all distinct source repositories and source-specific evidence

#### Scenario R3.4: No learning qualifies during migration
- GIVEN the legacy note fails the qualification gate and no other learning qualifies
- WHEN migration runs
- THEN `/learn` previews the legacy-note deletion and adjudication reason as the explicit exception to the no-candidate rule
- AND rejection retains the note while approval removes it

#### Scenario R3.5: Partial operation fails
- GIVEN an approved staged `Learnings.md` rewrite succeeds and the subsequent approved legacy-note deletion fails
- WHEN post-operation verification detects the mismatch
- THEN `/learn` restores both pre-approval snapshots and verifies them
- AND it reports failure rather than partial success

### Requirement R4: Compact deduplicated learning store
The system SHALL store each approved behavioral intervention as one concise atomic H2 section and SHALL update overlap rather than create a near-duplicate.

#### Scenario R4.1: Required section format
- GIVEN an approved learning
- WHEN `/learn` renders its final section
- THEN the section has an actionable H2 title, last-approved date, one code span per source repository, technique-level tags, and required `Use when`, `Do`, and `Evidence` bullets
- AND `Avoid` and `Why` appear only when useful
- AND the section remains approximately three to six bullets

#### Scenario R4.2: Cross-repository update
- GIVEN an existing learning from `maruina/dotfiles` and materially equivalent accepted evidence from `DataDog/k8s-release-mgmt-resources`
- WHEN `/learn` checks title, tags, repositories, evidence links, and body content
- THEN it updates the existing section
- AND the metadata line lists both repositories without making either repository the applicability scope

### Requirement R5: Selective advisory consumption
`/brainstorm` and `/plan` SHALL retrieve only relevant learning sections during discovery, give stronger current sources precedence, and preserve material guidance or a visible retrieval gap in their durable artifact.

#### Scenario R5.1: Relevant and unrelated sections
- GIVEN one learning matching the request's technology/pattern terms and one unrelated section
- WHEN `/brainstorm` or `/plan` performs discovery
- THEN the helper returns the complete relevant H2 section only
- AND the command records material guidance in `design.md` or `plan.md` without loading the unrelated section

#### Scenario R5.2: Stronger current evidence conflicts
- GIVEN a matched learning conflicts with current code, tests, tool behavior, or authoritative documentation
- WHEN the lifecycle command evaluates the conflict
- THEN it follows the stronger current source
- AND it records that the learning was stale, corrected, or omitted rather than silently applying it

#### Scenario R5.3: Store absent or Obsidian unavailable
- GIVEN `Datadog/Learnings.md` is absent
- WHEN `/brainstorm` or `/plan` searches for guidance
- THEN it treats the store as empty and continues without warning noise
- AND GIVEN Obsidian itself is unavailable
- WHEN retrieval fails
- THEN the command reports and records the skipped advisory source while continuing repository discovery

### Requirement R6: Command and lifecycle boundary
Pi SHALL discover `/learn`, SHALL not discover `/compound`, and SHALL keep `/execute` and `/verify` independent of direct learning-store access.

#### Scenario R6.1: Prompt discovery after rename
- GIVEN the source prompt directory and, after rollout, the rendered prompt directory
- WHEN Pi RPC returns `get_commands`
- THEN exactly one prompt command is named `learn`
- AND no command is named `compound`

#### Scenario R6.2: Daily and contextual invocation
- GIVEN `/learn` with no arguments and `/learn` with a supplied PR, comment URL, artifact path, or wrong-turn description
- WHEN each invocation expands
- THEN no-argument mode selects the previous local day
- AND contextual mode analyzes the current conversation plus supplied context under the same qualification and approval rules

#### Scenario R6.3: Mutable-store boundary
- GIVEN the final managed prompt set
- WHEN prompt contracts inspect lifecycle consumers
- THEN only `/learn`, `/brainstorm`, and `/plan` reference `Datadog/Learnings.md` or the helper's learning-section lookup
- AND `/execute` and `/verify` contain no direct Obsidian or learning-store retrieval behavior

### Requirement R7: Private-source and account safety
The system SHALL preserve authenticated account state and SHALL not persist secrets or unrelated private content in the knowledge store or temporary artifacts.

#### Scenario R7.1: Account restoration
- GIVEN `maruina` is active before a daily run that must inspect both identities
- WHEN one identity search succeeds or fails
- THEN the final active login is `maruina`
- AND a failed restoration blocks vault mutation and reports the repair needed

#### Scenario R7.2: Sensitive match
- GIVEN a matching session or review contains a credential-like value or unrelated private conversation
- WHEN `/learn` builds evidence and a proposed entry
- THEN the preview and final section omit the sensitive/unrelated content
- AND retain only redacted reusable guidance and safe evidence references

## Implementation Tasks
### Task 1: Add deterministic local evidence extraction
**Traceability:** R1.1, R1.2, R2.1, R4.2, R5.1, and the deterministic seams used by all later tasks.

**Files:**
- Create `dot_pi/agent/exact_scripts/learn-evidence.mjs`.
- Create `dot_pi/agent/exact_scripts/learn-evidence.test.mjs`.
- Modify `dot_pi/agent/package.json`.

- [x] From `dot_pi/agent`, run `npm ci --ignore-scripts` so tests use the locked Pi 0.80.6 API. Leave ignored `node_modules` present through `/verify` as required by repository guidance.
- [x] Add a `test:learn` package script that resolves `exact_scripts` in the source layout or `scripts` in the rendered layout and runs the existing `learn-*.test.mjs` files. The helper test created in this task guarantees the glob has at least one match; the prompt test added in Task 2 joins the same command automatically. Add `npm run test:learn` to `npm test` without changing unrelated gates.
- [x] Write fixture-driven tests first for local-day range calculation, R1.1, R1.2, malformed/unreadable session reporting, stable unique IDs, and local timezone behavior across a daylight-saving boundary. Assert inclusive `startIso`, exclusive `endIso`, and the UTC date-only `searchStartDate`/`searchEndDate` values that cover the exact interval for GitHub discovery.
- [x] Add search/context tests for R2.1: two independent equivalent assistant mistakes, a quoted user mention, duplicated tool output, injected `custom_message`, assistant thinking, tool-call arguments, and an unrelated match. Assert output labels candidate locations without claiming adjudicated occurrence counts.
- [x] Add bounded-output tests that assert schema version, searched bounds, total/returned counts, truncation, deterministic ordering, and structured stderr/exit behavior for invalid arguments.
- [x] Add Markdown-section tests for R4.2 and R5.1: matching by title, tags, repository metadata, evidence URL, and body; complete-H2 return; unrelated-section exclusion; one section with multiple repository code spans; and empty input.
- [x] Run `node --test exact_scripts/learn-evidence.test.mjs`; verify the focused red result is the absent `learn-evidence.mjs` import rather than a dependency or fixture failure.
- [x] Implement the smallest helper and explicit CLI subcommands needed by the tests: `sessions-window`, `sessions-search`, `session-context`, and `learning-sections`. Reuse `parseSessionEntries()` from `@earendil-works/pi-coding-agent`; use Node built-ins for traversal, dates, stdin, and JSON.
- [x] Keep stdout machine-readable JSON and stderr diagnostic-only. Exclude thinking, image data, tool-call arguments, and custom-message content from searchable output; retain role/type labels and bounded visible text needed for adjudication.
- [x] Rerun the focused helper test; expect every fixture and CLI case to pass.
- [x] Refactor only after green to share traversal, text extraction, bounds, and JSON-envelope code without combining session and Markdown domain logic.
- [x] Run `npm run test:learn`; expect the helper suite to pass. Confirm the `learn-*.test.mjs` glob expands to the existing helper test and does not pass a literal unmatched path to Node.
- [x] Run `npm test`; expect unit, learn-helper, skill, and dependency validation to pass.
- [x] Run `git diff --check -- dot_pi/agent/exact_scripts/learn-evidence.mjs dot_pi/agent/exact_scripts/learn-evidence.test.mjs dot_pi/agent/package.json`; expect no whitespace errors.
- [ ] Commit only Task 1 files with `feat(pi): add learn evidence helper`.

### Task 2: Replace `/compound` with evidence-gated `/learn`
**Traceability:** R1.3, R2, R3, R4, R6.1, R6.2, and R7.

**Files:**
- Create `dot_pi/agent/exact_prompts/learn.md`.
- Delete `dot_pi/agent/exact_prompts/compound.md`.
- Create `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`.
- Modify `dot_pi/agent/exact_prompts/simplify.md`.
- Modify `dot_pi/agent/AGENTS.md`.

- [x] Write prompt-contract tests first that require `learn.md`, reject the presence of `compound.md`, and assert the durable contracts for both invocation modes, all three qualification paths, raw-match adjudication, exact candidate preview, one approval, no-candidate behavior, migration deletion exception, transaction snapshot/read-back/compensation, GitHub login restoration, sensitive-data exclusion, source precedence, and multi-repository metadata.
- [x] Add lifecycle-contract assertions that `simplify.md` and `dot_pi/agent/AGENTS.md` name `/learn` and contain no `/compound` reference.
- [x] Run `node --test exact_scripts/learn-prompts.test.mjs`; verify the red result reports missing `learn.md`, present `compound.md`, and stale lifecycle references.
- [x] Create `learn.md` with prompt frontmatter and an optional context argument. Make the hard gate prohibit repository mutation and all unapproved vault mutation; allow only read-only evidence collection, mode-0600 temporary snapshots, and the exact approved vault transaction.
- [x] Encode daily discovery in this order: invoke source/rendered `sessions-window` for the previous local date and print its local timezone, inclusive `startIso`, and exclusive `endIso`; verify Obsidian and complete-store access; capture the active GitHub login; while `maruina` is active, globally search both author identities with the helper's covering UTC `searchStartDate`/`searchEndDate`; while `matteo-ruina_ddog` is active, search that author separately under `ddoghq` and `ddoghq-sandbox`; deduplicate PR URLs; exact-filter each `mergedAt` against `[startIso, endIso)`; inspect PR bodies/diffs/reviews/inline threads/conversation comments; restore and verify the original login; report every account/owner scope and incomplete source.
- [x] Encode contextual discovery for PR URLs/numbers, review or conversation comment URLs, design/plan paths, wrong turns, and free-form context. Route GitHub URLs to `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*` and to `maruina` otherwise, then restore the original login. Permit open-PR comment analysis in contextual mode while retaining merged-only daily behavior.
- [x] Encode targeted historical adjudication with narrow identifiers, helper search/context calls, independent-occurrence grouping, retained source/date bounds, and explicit exclusion of injected instructions, quotations, repeated output, mentions, and unrelated causes.
- [x] Encode the qualification gate and final preview format exactly enough for prompt-contract tests to distinguish actionable intervention, future applicability, qualification evidence, and exact proposed entry from a digest or fact collection.
- [x] Encode complete-store overlap detection and one final staged `Learnings.md` document. Require one code span per distinct source repository and source-specific evidence links or safe local references.
- [x] Encode the one-turn approval boundary: rejection/ambiguity cleans snapshots and changes nothing; approval applies only the exact preview; no qualifying candidate produces no prompt except the approved migration deletion exception.
- [x] Encode transactional mutation: inspect Obsidian output despite status 0, compare exact read-back, compensate both `Learnings.md` and the legacy note to mode-0600 snapshots after any partial failure, verify restoration, and clean temporary files.
- [x] Encode the PR #22 migration source and legacy-note path. Require the normal qualification process, exact replacement preview when qualified, deletion preview in all migration outcomes, and retained legacy note on rejection.
- [x] Remove `compound.md` and replace lifecycle wording in `simplify.md` and `dot_pi/agent/AGENTS.md` without duplicating `/learn`'s detailed contract in `AGENTS.md`.
- [x] Rerun `node --test exact_scripts/learn-prompts.test.mjs`; expect all Task 2 command, safety, and lifecycle contracts to pass.
- [x] Run source prompt discovery from the repository root:
  `printf '%s\n' '{"type":"get_commands"}' | PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts" | jq -e '[.data.commands[] | select(.source == "prompt") | .name] as $names | (($names | map(select(. == "learn")) | length) == 1 and ($names | index("compound") == null))'`.
  Expect exit 0 and `true`.
- [x] Run `npm run test:learn` and `npm test`; expect all helper, prompt, existing unit, skill, and dependency checks to pass.
- [x] Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts` from the repository root; use `--verbose` for the reviewed file-level diff and expect only the reviewed `/learn` addition, `/compound` deletion, and `simplify.md` change at this stage.
- [ ] Commit only Task 2 files with `feat(pi): replace compound with learn`.

### Task 3: Add selective learning consumption to `/brainstorm` and `/plan`
**Traceability:** R5 and R6.3.

**Files:**
- Modify `dot_pi/agent/exact_prompts/brainstorm.md`.
- Modify `dot_pi/agent/exact_prompts/plan.md`.
- Modify `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`.

- [x] Extend prompt-contract tests first for R5.1-R5.3 and R6.3. Require narrow terms, helper-based complete-H2 selection, no repository filter, advisory precedence, material guidance in durable artifacts, absent-store silence, unavailable-Obsidian recording, and no direct learning lookup in `execute.md` or `verify.md`.
- [x] Run `node --test exact_scripts/learn-prompts.test.mjs`; verify the focused red result identifies missing consumer discovery behavior rather than Task 2 regressions.
- [x] Add the learning lookup to `/brainstorm` discovery after the request/repository context is understood but before design decisions are confirmed. Derive narrow technology, error, API, tool, and pattern terms; read through Obsidian; pipe locally into `learning-sections`; and pass only returned H2 sections into reasoning.
- [x] Require `/brainstorm` to cite or summarize material guidance in `design.md`, record a retrieval-unavailable gap, treat an absent file as empty, and follow current source/tests/tool behavior/docs over a conflicting learning.
- [x] Add the same selective lookup and precedence to `/plan` after resolving the design/input and repository context but before implementation recommendations, feasibility decisions, or the planning alignment brief.
- [x] Require `/plan` to map material guidance into the committed plan and record an unavailable retrieval source without blocking planning. Do not let an advisory learning override the design's agreed WHAT.
- [x] Keep both prompts' existing interaction gates, worktree policies, lifecycle boundaries, and exact handoffs unchanged outside the new discovery/source-recording behavior.
- [x] Rerun the focused prompt-contract test; expect all R5 and R6.3 cases to pass.
- [x] Run `npm run test:learn`, `npm test`, and `npm run test:all`; expect all deterministic suites and the offline Pi smoke test to pass with no `[Extension issues]` output.
- [x] Run source RPC discovery again; expect `/brainstorm`, `/plan`, and `/learn` once each and no `/compound`.
- [x] Run targeted diffs:
  `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/prompts/plan.md`.
  Expect only the selective retrieval, precedence, and artifact-recording behavior.
- [ ] Commit only Task 3 files with `feat(pi): retrieve learnings during design`.

### Task 4: Run controlled prompt behavior procedures
**Traceability:** R1.3, R2.2-R2.4, R3.1-R3.2, R3.5, R5, R6.2, and R7.

**Files:** No repository files. Use mode-0600 files under a disposable `mktemp -d` directory and remove the directory after each procedure.

Automation cannot prove model adjudication or a cross-turn human gate. These procedures use the source prompt directory before apply, inspect explicit observable output/state, and reject all live vault changes before `/verify`.

- [x] **Daily discovery procedure:** Record `gh auth status --json hosts --jq '.hosts["github.com"][] | select(.active) | .login'` and mode-0600 snapshots of the current `Datadog/Learnings.md` and legacy note, including existence markers because missing-file output exits 0. From the repository root, start Pi with `pi --no-session --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"`, invoke `/learn` with no arguments, and inspect the report. Expect the previous local-day interval, all accessible session/GitHub source summaries, exact incomplete/truncation disclosures, restored original login, and either qualified previews or an explicit no-learning result. Reject any offered write. Compare both vault snapshots and active login byte-for-byte/value-for-value, then remove snapshots.
- [x] **Contextual migration rejection procedure:** Recreate the state snapshots, start the same source-template Pi command, and invoke `/learn https://github.com/maruina/dotfiles/pull/22`. Expect PR metadata/diff/reviews/inline-thread/conversation-comment inspection, targeted session adjudication, and an exact legacy-note deletion preview whether or not a replacement section qualifies. Reject once. Verify both vault paths and the active GitHub login are unchanged; remove snapshots.
- [x] **Routine-fact procedure:** In the source-template Pi session, invoke `/learn https://github.com/maruina/azath/pull/241`. This merged dependency update is the concrete routine-change source. Expect no learning unless independently adjudicated evidence establishes a non-routine behavioral intervention; if no learning qualifies, expect no approval prompt. Reject any unexpected proposal and record its evidence as a blocking prompt defect rather than accepting it.
- [x] **Consumer selection procedure:** Create a disposable mode-0600 backup of `Datadog/Learnings.md`. With explicit approval for test setup, create a temporary store containing one section about chezmoi custom template data and one unrelated Kubernetes section. Invoke the source `/brainstorm` and `/plan` prompts with `chezmoi execute-template map has no entry for key profile` as context. Expect each command to report only the complete chezmoi section, apply source precedence, and include the material guidance in its proposed durable artifact. Reject artifact creation, restore the original store through Obsidian CLI, verify exact restoration, and delete the backup.
- [x] **Qualification and injected transaction-failure procedure:** User-approved deviation on 2026-07-15: do not complete the synthetic `gh`/Obsidian transaction harness. The completed daily, contextual, routine, and temporary-store consumer procedures, prompt contracts, and deterministic helper tests provide sufficient evidence for Matteo to exercise approved live learning writes manually after verification.
- [ ] Record concise command/status/state evidence for each procedure in the plan execution notes. Do not paste private session content, tokens, or full vault contents.

### Task 5: Complete documentation review and verification readiness
**Traceability:** All requirements and the mandatory documentation/future-agent review.

**Files to inspect:**
- `README.md` if present.
- `AGENTS.md`.
- `dot_pi/agent/AGENTS.md`.
- `dot_pi/agent/exact_prompts/weekly-summary.md`.
- `dot_pi/agent/exact_prompts/session-note.md`.
- `dot_pi/agent/exact_prompts/execute.md`.
- `dot_pi/agent/exact_prompts/verify.md`.
- `plans/learn-command/design.md`.
- `plans/learn-command/plan.md`.
- Relevant user/developer docs, runbooks, examples, and generated references discovered during implementation.

- [x] Inspect user-facing docs and prompt descriptions. Confirm `/learn` is self-documenting at its supported interface and that no stale user-facing `/compound` reference remains, or update only the narrowest existing document that is inaccurate.
- [x] Inspect developer docs and READMEs. Confirm the helper's `--help`, versioned JSON, tests, design, and plan provide sufficient maintenance guidance, or update an existing document if implementation reveals a durable command or source-of-truth rule.
- [x] Inspect runbooks and operational docs. Record that this local interactive workflow has no service, scheduler, alert, dashboard, or on-call requirement; do not create an operational document without a real operator need.
- [x] Inspect examples and generated references. Record why no generated artifact or separate example is required, or update the canonical existing example if one directly covers managed prompt/script resources.
- [x] Inspect every relevant `AGENTS.md`. Keep the lifecycle rename made in Task 2; add only durable source-layout, test, generation, or rollout knowledge that future agents cannot obtain from the prompt/helper itself.
- [ ] Search the complete candidate for stale references with `rg -n '/compound|Datadog/Compound|compound\.md' dot_pi/agent --glob '!node_modules/**'`. Expect no runtime lifecycle reference; allow only an intentional migration-path literal inside `learn.md` or a prompt-contract assertion proving absence elsewhere.
- [x] Run focused tests together from `dot_pi/agent`: `node --test exact_scripts/learn-evidence.test.mjs exact_scripts/learn-prompts.test.mjs`; expect all cases to pass.
- [x] Run `npm test`; expect all unit, learn, skill, and Pi dependency validations to pass.
- [x] Run `npm run test:all`; expect all repeated deterministic suites and the Pi smoke test to pass with no extension issues.
- [x] Run source RPC discovery and assert `/learn` once and `/compound` absent.
- [ ] From the repository root, run `chezmoi --source "$PWD" diff ~/.pi/agent/scripts ~/.pi/agent/prompts ~/.pi/agent/AGENTS.md ~/.pi/agent/package.json`; expect only the helper/tests, command rename, two consumers, lifecycle wording, prompt tests, and package test wiring described by this plan.
- [x] Run `git diff --check origin/main...HEAD` and `git diff --check`; expect no whitespace errors or conflict markers in committed or ledger changes.
- [ ] Inspect `git status --short`, `git log --oneline origin/main..HEAD`, and the complete `origin/main...HEAD` diff. Confirm there are no implementation files outside the plan's affected set, no vault files, no dependency-version changes, no direct `/execute` or `/verify` retrieval, and no unrelated modifications.
- [ ] If documentation inspection changes tracked files beyond Task 2's lifecycle wording, run the relevant focused/full checks and commit only those documentation changes with `docs(pi): document learn workflow`. If no additional file is needed, record the rationale in execution notes and do not create an empty commit.
- [ ] Leave `dot_pi/agent/node_modules` present and ignored for `/verify`. Do not run `chezmoi apply`, approve the live migration, remove the legacy note, push the branch, or claim final verification from `/execute`.

## Post-Verification Rollout and Migration
Run only after `/verify plans/learn-command/plan.md` returns a fresh `VERIFIED` verdict for the unchanged candidate.

1. Re-run the targeted chezmoi diff from Task 5 and confirm it matches the verified candidate.
2. Apply only the reviewed targets from the verified worktree:
   `chezmoi --source "$PWD" apply ~/.pi/agent/scripts ~/.pi/agent/prompts ~/.pi/agent/AGENTS.md ~/.pi/agent/package.json`.
3. From the rendered `~/.pi/agent`, run `npm test` and `npm run test:all`; expect all suites and smoke checks to pass.
4. Run rendered RPC discovery:
   `printf '%s\n' '{"type":"get_commands"}' | PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-extensions --no-skills | jq -e '[.data.commands[] | select(.source == "prompt") | .name] as $names | (($names | map(select(. == "learn")) | length) == 1 and ($names | index("compound") == null))'`.
   Expect exit 0 and `true`.
5. Start a new Pi session and invoke `/learn https://github.com/maruina/dotfiles/pull/22`. Inspect the exact replacement/update and legacy deletion. Approve only if the adjudicated evidence and final transaction match the design. Verify `Datadog/Learnings.md` read-back and legacy-note presence/absence match the approved preview.
6. Invoke `/learn https://github.com/maruina/dotfiles/pull/22` again. If the learning qualified, expect overlap handling to propose an update or no change, never a duplicate H2 section; reject any redundant write. If no learning qualified, expect no learning proposal and no obsolete note remaining after an approved deletion.
7. Run one no-argument `/learn` daily retrospective and inspect the selected previous-day range and source report before relying on the workflow. Approval remains optional and evidence-dependent.
8. Push the verified branch according to the repository completion workflow. Remove source-worktree `dot_pi/agent/node_modules` only after the complete verification and rollout checks no longer need it.

## Controlled Test-Double Contract
The Task 4 test doubles are manual validation infrastructure under one disposable directory, not repository artifacts.

- `obsidian` accepts only the exact commands used by `/learn`, stores both fixture files under the disposable directory, writes a call log, emits the same status-0 `Error: File ... not found.` shape observed from the real CLI, and supports one configured post-write delete failure. Any other command exits non-zero.
- `gh` returns a fixed active login, records switches, provides one PR #22-shaped metadata/diff/review/comment/thread fixture with a generalizable reviewer request incorporated by the final diff plus a routine-comment distractor, and supports a configured source failure. It never invokes the real CLI or emits a token.
- The fixture session directory contains only synthetic v3 JSONL from `learn-evidence.test.mjs`, including branched activity and adjudication distractors. It contains no copied private session text.
- The Pi process inherits the disposable `PATH` and `PI_CODING_AGENT_SESSION_DIR`; the source helper path is used from the repository root. Cleanup removes the entire disposable directory after hash and call-log assertions.

## Requirement Traceability
| Requirement | Primary tasks | Automated evidence | Manual/additional evidence |
|---|---|---|---|
| R1 | Tasks 1 and 2 | Session/date/tree fixtures; prompt contracts | Daily discovery procedure and source reports |
| R2 | Tasks 2 and 4 | Search distractor fixtures; qualification prompt contracts | Contextual PR #22, routine PR #241, and synthetic costly-wrong-turn/accepted-review procedures |
| R3 | Tasks 2 and 4 | Approval/transaction prompt contracts | Rejection snapshots, injected failure compensation, post-verification approval/read-back |
| R4 | Tasks 1 and 2 | Markdown-section and multi-repository fixtures; format contracts | PR #22 migration and repeated-context duplicate check |
| R5 | Tasks 1 and 3 | Section-selection fixtures; consumer/precedence/fallback contracts | Controlled consumer procedure |
| R6 | Tasks 2, 3, and 5 | Prompt-contract assertions and source RPC discovery | Rendered RPC discovery after apply |
| R7 | Tasks 2 and 4 | Sensitive-content/account-restoration prompt contracts | Real and fake active-login comparisons; redacted state evidence |

## Execution Notes
`/execute` uses this section as the concise evidence ledger. Append dated bullets only for completed task outcomes, exact manual-procedure verdicts, approved deviations, documentation no-change rationales, and post-verification rollout state; do not paste private evidence, full command logs, tokens, or vault contents.

- 2026-07-15: Task 1 completed. Installed locked dependencies with `npm ci --ignore-scripts`; the focused test first failed only because the helper was absent, then passed after implementation. `npm run test:learn`, `npm test`, and the Task 1 whitespace check passed. The helper imports the public package-root `parseSessionEntries()` export.
- 2026-07-15: Task 2 completed. The prompt-contract test first identified the missing `/learn`, existing `/compound`, and stale lifecycle references; it passes with the new command. `npm run test:learn`, `npm test`, source RPC discovery, and the reviewed verbose chezmoi prompt diff passed. `chezmoi diff` needs `--verbose` to display changes for the exact prompt directory.
- 2026-07-15: Task 3 completed. Consumer contract tests first failed only for missing selective retrieval behavior, then passed. `npm run test:learn`, `npm test`, `npm run test:all`, source RPC discovery, targeted verbose chezmoi diffs, and whitespace checks passed.
- 2026-07-15: Task 4 daily and contextual source-template runs reported the expected local range/source summaries, legacy-deletion preview, and restored `maruina` login. Print-mode nonapproval left both snapshotted vault paths unchanged. The routine PR produced a candidate only after independent costly-wrong-turn/PR #22 evidence, which is permitted by the procedure. The authorized temporary-store consumer procedure restored the absent store exactly; after strengthening the consumer prompts, both commands reported only the chezmoi section and omitted the Kubernetes section.
- 2026-07-15: The disposable RPC test-double attempt kept the synthetic vault unchanged, but the fake `gh` responses did not satisfy every discovery call needed to reach the exact preview and approval boundary. No synthetic `obsidian create` or legacy `delete` call occurred. Matteo approved omitting this synthetic procedure because the completed evidence is sufficient and he will exercise approved live learning writes manually after verification.

## Documentation and Operational Impact
- `learn.md` is the user-facing workflow contract; helper `--help`, versioned JSON, tests, design, and this plan are the developer maintenance references.
- `dot_pi/agent/AGENTS.md` needs only the lifecycle rename unless implementation reveals a durable source/test rule not already covered.
- No README, runbook, dashboard, metric, trace, alert, generated reference, or external documentation is expected. Task 5 must inspect and record the final decision.
- The only persistent user data is the explicitly approved `Datadog/Learnings.md` content and approved legacy-note deletion. GitHub and session sources remain read-only.
- Operational ownership is Matteo. The fastest rollback is a source revert plus targeted chezmoi apply and, when needed, Obsidian history restoration.
