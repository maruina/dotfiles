# `/pr-validate` Clarity, Prior-Comment Tagging, and Speed Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/pr-validate` items readable without follow-up questions, tag each item with the bot and human comments that already raised it, and remove the avoidable turns that slowed the dd-source#116539 run.
**Smallest user-feedback slice:** The example report and a rerun show the gate item explaining what the monitor watches, when and why it alerts, and the real harm ("the workflow cannot repair a broken bundle"), with the monitor link in the comment.
**Out of Scope:** A deterministic evidence-collector script (`collect.mjs`), deferred by the user (revisit if prompt instructions alone fail to prevent duplicate GitHub thread queries or token cache rewrites exceed 150k in subsequent benchmark runs); model or thinking-level changes; per-group monitor state queries; pointing the comment box at an existing thread as a reply; flagging resolved threads whose code did not change.
**Architecture:** The prompt `dot_pi/agent/exact_prompts/pr-validate.md` gains an explanation rule for slot 4 and comment text, a prior-comment matching rule, and six speed fixes. The renderer `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs` gains a 90-word `whyBad` limit and a required `priorComments` item field rendered as chips. `example.json` models both, and the existing `node:test` suites pin the contract.
**Tech Stack:** Markdown pi prompt, Node.js ESM renderer, `node:test`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires it | Selected `chezmoi` and `write` from the affected prompt, script, and prose files |
| `learning-lookup` | `prompt-required` | Advisory lookup before decisions | Searched `pr-validate`, `review report`, `tool_search`, `prompt cache`, `bot`, `inline comment`; one partial match ("Verify platform-injected env vars…", dd-source#70697) shows bot findings can be wrong, so the plan tags verified duplicates and keeps independent verification |
| `chezmoi` | `skill-loader` | Files are under the chezmoi source | Targets `exact_prompts` and `exact_scripts`; diff and apply explicit target files |
| `write` | `skill-loader` | Prompt rules and report prose | Its rule "explain behavior the reader can picture before the technical term" is the basis of the slot-4 and comment rules |
| `feature-worktree` | `prompt-required` | Durable plan needs a feature worktree | Created `maruina/pr-validate-clarity` from `origin/main` at `~/dd/.worktrees/dotfiles/maruina-pr-validate-clarity` |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The execution input is an absolute plan path in a worktree | Resolved the owning Git root and branch before reading repository files. |
| `feature-worktree` | `prompt-required` | Execution must continue in the plan's feature worktree | Confirmed the resolved worktree was the intended feature branch. |
| `skill-loader` | `prompt-required` | `/execute` requires execution-stage skill selection and provenance | Selected execution skills from the changed paths and recorded them here. |
| `codebase-research` | `skill-loader` | The renderer validation behavior and nearby tests needed current-code review | Traced the validation limit, fixture, and test patterns before editing. |
| `chezmoi` | `skill-loader` | Changed files are chezmoi source files | Kept edits in source paths; previewed and applied explicit target files, then confirmed no target drift. |
| `write` | `skill-loader` | The prompt and example contain user-facing prose | Wrote the signal explanation in causal order with direct language. |
| `humanizer` | `skill-loader` | The prompt and example contain user-facing prose | Kept prose specific and removed no supported facts. |
| `reviewable-pr-workflow` | `prompt-required` | The slice is ready for a PR handoff | Applied its stack-split signals before preparing a draft PR. |

#### Slice 2 execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The plan path belongs to a feature worktree | Resolved and switched to the owning branch before repository reads. |
| `feature-worktree` | `prompt-required` | Execution must continue in the plan's feature worktree | Confirmed the current worktree owns the open draft PR. |
| `skill-loader` | `prompt-required` | `/execute` requires execution-stage skill selection and provenance | Selected the skills needed for renderer and prompt changes. |
| `codebase-research` | `skill-loader` | Prior-comment validation/rendering crosses prompt, renderer, and test contracts | Traced current validation, rendering, and test patterns before editing. |
| `cli-best-practices` | `skill-loader` | Renderer validation errors and output are CLI behavior | Kept field errors specific and rendered only validated PR comment metadata. |
| `chezmoi` | `skill-loader` | Changed files are chezmoi source files | Previewed and applied only the explicit target files, then confirmed no target drift. |
| `write` | `skill-loader` | Prompt instructions need clear data-collection and matching rules | Stated exact metadata, matching, and fallback behavior. |
| `humanizer` | `skill-loader` | Prompt instructions are human-readable prose | Kept the added guidance direct and specific. |
| `reviewable-pr-workflow` | `prompt-required` | The open draft PR will receive this slice | Will apply its stack-split and PR update guidance. |

## Evidence
Source of truth: the user request, `~/.pi/agent/pr-validate-reports/dd-source-116539.{json,html}`, PR [ddoghq/dd-source#116539](https://github.com/ddoghq/dd-source/pull/116539) threads, and session `01a11acc-1f93-7224-ab02-71cb27d9cfb5`.

### Session breakdown (review run, 09:16:13–09:28:31)
- Wall time 12 min 18 s: model 684 s (93 %), tools 54 s (7 %), 54 assistant turns.
- Tokens: 6.69 M cache read, 426 k cache write, 54.6 k output (36.9 k reasoning). Cost $0.148. Context reached about 200 k tokens.
- Avoidable turns (about 11, 2–3 min):
  - Two late `tool_search` calls changed the tool list and rewrote the prompt cache (118 k + 125 k tokens, 57 % of cache writes, about 20 % of cost).
  - Review threads read four times (about 60 k characters, mostly duplicate).
  - The sentence "In the source repository, it is in `dot_pi/...`" caused a wrong `example.json` path (2 turns, 36 s reasoning).
  - The prompt names the file class `schema/API`; the renderer accepts only `schema`. A non-string `marketplace` failed validation (1 render failure, 2 fix turns).
  - A failed `edit` and a `read` past end of file during fixes (2 turns).
- The follow-up question 40 min later found an expired cache (203 k rewrite, $0.026). A clear first comment removes that turn.

### Comment and slot-4 evidence
- Proposed comment: "monitor 323592288 alerts when clusters have multiple `vaultd.bundle_fingerprint` values. A non-OK result retries here, so the certificate deploy that may repair the state never runs."
- User comment [4217642497](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4217642497): says in plain words what the monitor watches (nodes with different CA bundles), keeps the monitor link, states the effect (the workflow waits and never reaches the deploy), and ends with the harm (the workflow cannot repair a broken situation).
- `whyBad` stopped at the intermediate effect ("the following certificate deploy cannot run") and did not reach the harm. `LIMITS.slot` is 60 words, which leaves no room for the five-part explanation.

### Prior-comment evidence
- The run did not mark duplicates. Bot comments already raised: gate before repair [4167287924](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4167287924), Phase Two replay [4184262278](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4184262278), timeout headroom [4184262293](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4184262293), RPC rollout [4184262288](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4184262288). Human: timeout follow-up [4217663797](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4217663797) and gate [4217642497](https://github.com/ddoghq/dd-source/pull/116539#discussion_r4217642497) (both posted after the run).
- Verified on the PR: REST `user.type` is `Bot` for `dd-agentic-review-platform-14301c[bot]` (6 inline comments, 3 review bodies). GraphQL `author.__typename` is `Bot`, and the GraphQL login is `dd-agentic-review-platform-14301c` without the `[bot]` suffix. Login-based detection would fail on GraphQL data; type-based detection works on both.
- REST `html_url` gives the comment permalink (`…/pull/116539#discussion_r<id>`); top-level comments use `#issuecomment-<id>` and review bodies `#pullrequestreview-<id>`.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Plain-language slot 4 and comment | Prompt rule plus `example.json` model item | `pr-validate.md` Item story; `example.json` is read every run | Marker test; final rerun | Not applicable |
| 90-word `whyBad` | `LIMITS.whyBad` in `render.mjs` | `LIMITS` and `text()` validation, `render.mjs:41-118` | `render.test.mjs` word-limit test | Not applicable |
| Bot and human detection | REST `user.type`, GraphQL `author.__typename`, `html_url`/`url` | Verified on dd-source#116539 | Final rerun lists the four bot links | Set `priorComments` to `[]` and add a Coverage gap naming the missing query |
| Required `priorComments` | `validate()` and `renderItem()` in `render.mjs` | Existing item validation pattern, `render.mjs:165-206` | `render.test.mjs` | Not applicable |
| One early `tool_search` | Prompt instruction in Phase 2 | Session shows two late calls and cache rewrites | Marker test; jq on rerun session | Not applicable |
| Fetch threads once | Prompt instruction for one compact threads file | Session shows four thread reads | Marker test; jq on rerun session | Not applicable |

## Implementation Contract
**Components Affected:**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Prompt | `dot_pi/agent/exact_prompts/pr-validate.md` | Explanation rule, prior-comment rule, speed fixes | `npm run test:prompts` |
| Prompt tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Pin prompt markers | `npm run test:prompts` |
| Renderer | `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs` | `whyBad` limit; validate and render `priorComments` | `npm run test:pr-validate-report` |
| Example | `dot_pi/agent/exact_scripts/pr-validate-report/example.json` | Model item for explanation and prior comments | `npm run test:pr-validate-report` |
| Renderer tests | `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` | Pin limit and field behavior | `npm run test:pr-validate-report` |

**Key Decisions:**
- `priorComments` is required on every item (user decision). An empty array means no earlier comment raised the item, so the model must decide for each item.
- Tag both bot and human comments (user decision). Each entry has `author`, `kind` (`bot` or `human`), and `url`.
- Detect bots by REST `user.type == "Bot"` or GraphQL `author.__typename == "Bot"`, never by login (verified on the PR).
- Keep `schemaVersion` at 1. The renderer reads only fresh JSON from the same run; the missing-field error names `priorComments`, which is clear enough. Bumping the version would touch every fixture for no reader benefit.
- Raise only `whyBad` to 90 words, not the shared `slot` limit, so other slots stay short.
- Keep the evidence-collector script out of scope (user decision: later; revisit trigger documented in Out of Scope).

**Implementation Constraints:**
- The read-only HARD-GATE in `pr-validate.md` does not change.
- Text fields keep the existing inline grammar: only `` `code` `` spans and `[label](https://...)` or `[label](#id)` links. The renderer escapes everything else.
- `priorComments[].url` must start with `https://github.com/<repo>/pull/<number>#` and use `discussion_r`, `issuecomment-`, or `pullrequestreview-` followed by digits, where `<repo>` and `<number>` come from the report. This blocks links to unrelated pages.
- A prior comment matches an item when it raises the same failure at the same code path, including a reply in another thread. Comments by the PR author do not count. Resolution and outdated state do not change the match.
- A match is a tag, not evidence. Pass 2 still verifies the item at the PR head.
- Stop condition: if the existing tests fail on `origin/main` before any change, stop and report.

**Security Requirements:** Prior-comment author names and URLs are PR-derived. Escape the author name as text. Accept only URLs that match the PR permalink pattern above. Do not render comment bodies.

**Observability Requirements:** Not applicable to runtime telemetry; this is a local prompt and renderer. The session JSONL is the observation source for speed: the final verification uses jq on it.

**Failure Modes to Handle:**
| Failure | Expected behavior | Verification |
|---|---|---|
| `priorComments` missing or not an array | Renderer fails with `items[N].priorComments: required array` and writes nothing | `render.test.mjs` |
| URL outside the PR or with a bad fragment | Renderer fails on `items[N].priorComments[M].url` | `render.test.mjs` |
| `kind` not `bot` or `human` | Renderer fails on `items[N].priorComments[M].kind` | `render.test.mjs` |
| GitHub author type unavailable | The prompt records the item with `priorComments: []` and adds a Coverage gap that names the missing query | Marker test |
| `whyBad` above 90 words | Renderer fails with the word count and limit | `render.test.mjs` |

**Rollout and Rollback:** Smallest safe rollout is `chezmoi apply` of the five target files, then one `/pr-validate` run. Fastest rollback is `git revert` of the branch commits and `chezmoi apply` of the same files. Owner: Matteo Ruina.

**Test Strategy:**
- Explanation rule → `lifecycle-prompts.test.mjs` markers (prompt is the only interface the model reads) and the final rerun.
- `whyBad` limit and `priorComments` → `render.test.mjs` through `validate()` and `render()`, the renderer's public exports. No mocks.
- Speed fixes → `lifecycle-prompts.test.mjs` markers and a jq summary of the rerun session.
- Narrow commands expected to fail before implementation: `npm run test:pr-validate-report` (new `priorComments` and `whyBad` tests) and `npm run test:prompts` (new markers), both run from `dot_pi/agent`.

## Acceptance criteria
### Requirement: Items explain external signals before using them
The prompt SHALL require slot 4 (`whyBad`) and `comment.text` to explain a signal (monitor, metric, alert, workflow state) in plain words before they use its identifier. The explanation MUST say what the signal watches, when it alerts and what the alert means, why that state can happen, the direct effect, and the real harm to the user or system. `comment.text` MUST keep the evidence link.

#### Scenario: Example gate item models the rule
- GIVEN `example.json` item `gate-blocks-repair`
- WHEN `npm run test:pr-validate-report` runs
- THEN the item validates, its `whyBad` ends with the harm (the rotation cannot repair the broken trust state), and its `comment.text` contains the monitor link

#### Scenario: whyBad over 90 words fails
- GIVEN an item whose `whyBad` has 91 words
- WHEN `validate()` runs
- THEN it returns an error that names `items[N].whyBad` and the limit 90

#### Scenario: Prompt states the rule
- GIVEN `pr-validate.md`
- WHEN `npm run test:prompts` runs
- THEN markers for "explain the signal before its identifier" and "end with the real harm" are present

### Requirement: Items show which earlier comments already raised them
The renderer SHALL require `priorComments` on every item and SHALL render each entry as a chip that links to the comment, labeled by kind. An empty array SHALL render "Not raised before".

#### Scenario: Bot comment renders as a linked chip
- GIVEN an item with `priorComments: [{author: "review-bot", kind: "bot", url: "https://github.com/example-org/example-service/pull/42#discussion_r1"}]`
- WHEN `render()` runs
- THEN the item HTML contains "Already raised by bot" and a link to that URL

#### Scenario: Human comment renders as a linked chip
- GIVEN an entry with `kind: "human"` and `author: "octocat"`
- WHEN `render()` runs
- THEN the item HTML contains "Already raised by @octocat" and a link to the URL

#### Scenario: Missing or invalid prior comments fail
- GIVEN an item without `priorComments`, or with a URL for another PR, or with `kind: "robot"`
- WHEN `validate()` runs
- THEN it returns an error that names the field

#### Scenario: Prompt defines detection and matching
- GIVEN `pr-validate.md`
- WHEN `npm run test:prompts` runs
- THEN markers for `user.type`/`__typename` bot detection, "never by login", PR-author exclusion, and the chat summary tag are present

### Requirement: The review avoids known wasted turns
The prompt SHALL load all deferred MCP tools in one `tool_search` before large reads, fetch review data once into one compact file, give only the rendered renderer path, use the renderer's file-class keys, state the `marketplace` rule, and fix all renderer errors in one `edit` call.

#### Scenario: Prompt markers
- GIVEN `pr-validate.md`
- WHEN `npm run test:prompts` runs
- THEN the six markers are present, and the text "In the source repository" and "schema/API" are absent

## Task sequence
### Slice 1: Plain-language item explanations
Delivers the user feedback "the gate item explains the monitor and ends with the real harm".

### Task 1: Explanation rule, `whyBad` limit, and example item
**Delivers:** The prompt requires the five-part signal explanation in slot 4 and the comment, the renderer allows 90 words for `whyBad`, and the example gate item models both.
**Blocked by:** None
**Traces to:** Requirement "Items explain external signals before using them"; user points 2 and 3
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/example.json`, `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs`

- [x] Run `npm ci --ignore-scripts` in `dot_pi/agent`, then `npm run test:prompts` and `npm run test:pr-validate-report`; expect both green on the unchanged branch.
- [x] Add a `render.test.mjs` case: a 91-word `whyBad` fails with `items[0].whyBad` and limit 90, and a 75-word `whyBad` passes. Add `lifecycle-prompts.test.mjs` markers for the explanation rule. Run both suites; the new cases fail as expected (`whyBad` reports the old 60-word limit; prompt markers are absent).
- [x] In `render.mjs`, add `whyBad: 90` to `LIMITS` and use it for `item.whyBad`; `npm run test:pr-validate-report` passes.
- [x] In `pr-validate.md` Item story slot 4, require this order: what the signal watches; when it alerts and what the alert means; why that state can happen; the direct effect; the real harm. Tell the model to follow the causal chain past the intermediate effect (for example "the deploy cannot run") to the harm (for example "the workflow cannot repair a broken bundle"). In the `comment.text` rules, require the same plain explanation of the signal first, with its link, then the effect, the harm, and the request; `npm run test:prompts` passes.
- [x] Rewrite `example.json` item `gate-blocks-repair` `whyBad` and `comment.text` with that structure, modeled on comment 4217642497 (fictional monitor 123, under 90 and 120 words); the fixture now names the signal, trigger, cause, effect, and harm, and keeps the monitor link.
- [x] Run `npm run test:prompts` and `npm run test:pr-validate-report`; both pass after rebasing (59 prompt tests and 9 renderer tests).
Execution note: Rebased the plan and implementation commits onto updated `origin/main` twice as upstream advanced; reran both focused suites after the final rebase.

- [x] Commit with `feat(pi): require plain signal explanations in /pr-validate items`.

### Slice 2: Prior-comment tagging
Delivers the user feedback "each item tells me if a bot or a human already raised it, with a link".

### Task 2: `priorComments` field, detection, and matching
**Delivers:** Every item carries a validated `priorComments` array, the report shows linked chips or "Not raised before", and the prompt defines how to detect and match prior comments.
**Blocked by:** None
**Traces to:** Requirement "Items show which earlier comments already raised them"; user request about bot comments and decisions 1–3
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/example.json`, `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs`

- [x] Add `render.test.mjs` cases for the bot chip, the human chip, "Not raised before", a missing field, a URL for another PR, a bad fragment, and a bad `kind`. Add prompt markers for detection, "never by login", PR-author exclusion, and the chat summary tag. Run both suites; the new cases fail as expected.
- [x] In `render.mjs` `validate()`, require `item.priorComments` as an array on every item kind (empty arrays pass). Validate each entry: `author` as short text, `kind` in `["bot", "human"]`, and a same-PR comment URL with an allowed fragment; escape regex metacharacters from `repo`. Required-array, bad-URL, bad-fragment, bad-kind, and dotted-repo cases pass.
- [x] In `renderItem()`, render one line before slot 1: linked bot/human chips or `Not raised before`; escape author and URL values. The focused chip test passes.
- [x] In `example.json`, add `priorComments` to each item: one bot entry on `replay-break`, one human entry on `gate-blocks-repair`, and `[]` on `skip-visibility`; the report renders both tags and the empty state.
- [x] In `pr-validate.md` Phase 2, record for each inline comment, top-level comment, and review body: author login, author type, comment URL, path, line, and thread resolution state. In Pass 2, add the matching rule from the Implementation Constraints. In the Item story, document `priorComments`. In the chat summary, add the prior-comment tag and link to each item line. When author type is unavailable, set `[]` and add a Coverage gap that names the query; prompt markers pass.
- [x] Run `npm run test:prompts` and `npm run test:pr-validate-report`; both pass (60 prompt tests and 13 renderer tests).
- [ ] **In progress:** Commit with `feat(pi): tag /pr-validate items with prior bot and human comments`.

### Slice 3: Faster review
Delivers the user feedback "the review spends fewer turns on known waste".

### Task 3: Remove known wasted turns
**Delivers:** The prompt removes the six wasted-turn causes found in session `01a11acc`.
**Blocked by:** 2 (the single compact review-data file includes the author-type and URL fields from Task 2)
**Traces to:** Requirement "The review avoids known wasted turns"; user point 1
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Add markers for the six fixes and `doesNotMatch` checks for "In the source repository" and "schema/API". Run `npm run test:prompts`; expect failures.
- [ ] In Phase 2, add: load every deferred MCP tool the review can need (Datadog monitors, DDCI CI status) in one `tool_search` before large reads, because each `tool_search` invalidates the prompt cache.
- [ ] In Phase 2, add: write all review data to one compact file in the scratch directory once, and read slices of that file; do not query threads or comments again.
- [ ] In "Render the report", replace the source-repository sentence with the rendered path only, and state that `example.json` is in the same directory as the renderer.
- [ ] In Pass 1, replace the file-class list with the renderer keys `generated`, `build`, `behavior`, `test`, `docs`, `schema`.
- [ ] In "Render the report", add: set `marketplace` to text that records the commit and date, or omit it when discovery was skipped; fix every renderer error in one `edit` call before rerunning.
- [ ] Run `npm run test:prompts`; expect green. Run `npm test` and `npm run test:all` in `dot_pi/agent`; expect green; then remove `dot_pi/agent/node_modules`.
- [ ] Commit with `perf(pi): remove wasted turns from /pr-validate`.

### Task 4: Documentation and future-agent guidance
**Delivers:** Guidance files agree with the new contract.
**Blocked by:** 3
**Traces to:** Documentation requirement for Medium plans
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/render.mjs` (`--help` text), `AGENTS.md` (check only)

- [ ] Confirm that `render.mjs --help` prints the new `whyBad` limit through `LIMITS` and mentions `priorComments`; update the help text if it lists fields.
- [ ] Check `AGENTS.md` and `dot_pi/agent/AGENTS.md` for `/pr-validate` content. Expected: none applies, so record "no change" in the PR body. No README covers the renderer.
- [ ] Commit with `docs(pi): document /pr-validate prior comments` only if a file changed.

## Final verification
- [ ] Run `chezmoi --source "$PWD" diff` on the five target paths under `$HOME` (`~/.pi/agent/prompts/pr-validate.md`, `~/.pi/agent/scripts/lifecycle-prompts.test.mjs`, `~/.pi/agent/scripts/pr-validate-report/render.mjs`, `~/.pi/agent/scripts/pr-validate-report/example.json`, `~/.pi/agent/scripts/pr-validate-report/render.test.mjs`), then `chezmoi --source "$PWD" apply` on them.
- [ ] Rerun `/pr-validate https://github.com/ddoghq/dd-source/pull/116539` in a new session.
- [ ] Report check: the gate item `whyBad` explains what monitor 323592288 watches, when it alerts, what the alert means, why it can happen, and ends with "cannot repair a broken bundle" or an equal harm; its comment keeps the monitor link.
- [ ] Report check: items link to bot comments 4167287924, 4184262278, 4184262293, and 4184262288, and to the human comments 4217642497 and 4217663797 where they match.
- [ ] Session check with jq on the new session JSONL: exactly one `tool_search`, no `ENOENT` tool errors, no renderer schema error for `filesByClass` or `marketplace`, and fewer than 54 assistant turns. Record wall time; a value under 12 min is advisory because model latency varies.

## Documentation impact
Prompt and renderer help text only. No `AGENTS.md` change expected; Task 4 confirms.

## Learning candidates
None yet.
