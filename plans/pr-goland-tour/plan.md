# Self-paced PR Tours with GoLand Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare one logical walkthrough of ddoghq/ddtool PR #791, then navigate its explanations and pinned source locally in Pi and GoLand without a model turn per stop.
**Smallest user-feedback slice:** Read several connected stops, explore surrounding source, ask one question, and resume at the selected stop.
**Out of Scope:** Full diff coverage, approval findings, GitHub comments, multi-agent review, browser presentation, publishing, automatic playback, comprehension detection, range highlighting, base-side/deleted-file navigation, cross-platform support, automatic PR updates, cross-session progress, plugins, servers, window automation, and extra OS permissions.
**Architecture:** A preparation prompt produces a complete private JSON artifact before reading begins. An opt-in Pi extension validates the artifact and pinned checkout, handles local selection, and requests native GoLand line navigation. Questions leave the custom reader for normal chat; an explicit command resumes in-memory selection.
**Tech Stack:** TypeScript, Node.js standard library, Pi extension and TUI APIs, Git CLI, macOS GoLand launcher, Markdown prompt, Node test runner, and chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Planning lifecycle | Selected applicable workflow and domain guidance. |
| `resolve-worktree` | prompt-required | Explicit design path | Resolved the artifact and continued in its owning worktree. |
| `feature-worktree` | prompt-required | Durable artifact | Reused the clean feature branch without moving main. |
| `codebase-research` | skill-loader | Unfamiliar reader mechanisms | Inspected launcher implementation/tests, installed APIs, examples, and package scripts. |
| `chezmoi` | skill-loader | Managed source repository | Kept runtime targets unchanged and specified explicit-target deployment. |
| `cli-best-practices` | skill-loader | Slash-command interface | Required explicit inputs, interactive-mode checks, and actionable errors; no standalone CLI is added. |
| `learning-lookup` | prompt-required | Advisory planning lookup | Searched relevant terms and recorded the empty result. |
| `obsidian-cli` | agent-selected | Learning-store access | Used the supported CLI for the advisory lookup. |
| `write` | skill-loader | Plan prose | Distinguished verified facts, proposed mechanisms, and manual evidence. |
| `diataxis` | skill-loader | User documentation | Separated goal-oriented usage instructions from artifact reference. |

## Source, alignment, and discovery
- Source of truth: `plans/pr-goland-tour/design.md`.
- Classification: Medium, local and opt-in. Matteo confirmed the planning alignment brief, independent launcher, explicit question/resume flow, and three-slice boundary in this planning conversation.
- Existing behavior: `dot_pi/agent/exact_extensions/files.ts:740` opens a project and target through `open -na GoLand.app --args` on macOS, without a focal line. `files/_goland.test.ts` verifies its argument arrays and failure notifications. Leave both unchanged.
- Pi 1.5.0 installed documentation supports extension commands, local `ctx.ui.custom()` input, `setEditorText()`, and `pi.exec()` with timeout, cancellation, cwd, and output limits. The installed `examples/extensions/qna.ts` demonstrates returning from custom UI to the editor. Commands do not require a model turn; prompt templates alone cannot implement keyboard navigation.
- The installed `goland` wrapper forwards arguments through macOS `open`. Native window reuse, focus, and focal-line correctness are not yet observed. Slice 1 is a blocking visual trial, not a claim of working integration.
- The selected ddtool checkout matched head `ca4cc50ec5c4c6219a79bd9d395760c539d5758d` and was clean during planning. Recheck during execution. Its PR URL is `https://github.com/ddoghq/ddtool/pull/791`. Do not silently substitute another PR or revision.
- Advisory lookup: Obsidian `Datadog/Learnings.md` returned no sections for GoLand, walkthrough, custom UI, or source anchors. No advisory guidance applied; no advisory source was skipped.
- No applicable reader ADR or existing tour implementation was found. Preserve repository instructions in `AGENTS.md` and `dot_pi/agent/AGENTS.md`, especially extension discovery, dependency handling, worktrees, and explicit-target chezmoi commands.

## Feasibility map
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| R1: native focal-line navigation | macOS launcher, distinct project/file arguments and `--line` | Existing launcher, installed wrapper, JetBrains line-option documentation cited in design | Slice 1 visual trial plus argument-array tests | Stop for user feedback before building reader; no window automation. |
| R2: pinned, confined source | Git HEAD and tracked-blob checks, realpath confinement, bounded byte comparisons | Git checkout and standard Git/Node interfaces | Real temporary Git fixtures with drift and escapes | Reject navigation without modifying checkout. |
| R3: local reading | Registered command and `ui.custom()` keyboard handler | Installed Pi docs and existing `/files` custom UI | Drive actual component/handler through fake host; assert no model/network calls | Block rather than substitute conversational navigation. |
| R4: questions and resume | Close reader, prefill editor, retain memory state | Installed Pi docs and qna example | Handler tests and normal chat/resume trial | Stop if host API cannot preserve the contract. |
| R5: bounded launch lifecycle | One active launch, no pending queue, abort controller and timeout | Documented `pi.exec` options | Rapid-input, timeout, exit, and rejection tests | Do not permit unbounded or uncancellable work. |
| R6: prepared PR tour | Markdown preparation prompt, complete JSON artifact | Prompt-template docs and existing prompt layout | Prompt contract tests, validate generated artifact, source-led trial | Report source/auth gaps; do not fabricate stops or start partial reading. |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Entry point | `dot_pi/agent/exact_extensions/pr-tour/index.ts` | Default factory; command parsing, interactive/idle guards, session-local state and cleanup | `command.test.ts`, smoke test |
| Artifact/source boundary | `dot_pi/agent/exact_extensions/pr-tour/artifact.ts` | Versioned schema, limits, provenance, paths, pinned source and line validation | `artifact.test.ts`, real Git fixtures |
| Reader | `dot_pi/agent/exact_extensions/pr-tour/reader.ts` | Selected explanation, stop list, input, scrolling, handoff outcomes | `reader.test.ts`, visual Pi trial |
| IDE adapter | `dot_pi/agent/exact_extensions/pr-tour/goland.ts` | Bounded argument-array launch and lifecycle | `goland.test.ts`, real GoLand trial |
| Preparation | `dot_pi/agent/exact_prompts/pr-tour-prepare.md` | Source-led generation and private artifact handoff | `dot_pi/agent/exact_scripts/pr-tour-prompts.test.mjs` |
| Test registration | `dot_pi/agent/package.json` | Include reader tests in `test:unit`; existing prompt glob discovers prompt test | `npm test`, `npm run test:all` |
| Usage/reference | `dot_pi/agent/exact_extensions/pr-tour/README.md` | Workflow, keys, schema, safety limits, failure recovery and rollback | Documentation review and actual trial |
| Execution evidence | `plans/pr-goland-tour/plan.md` | Task tracking and non-sensitive visual/user observations | Review actual results, not inferred success |

### Key Decisions
- Use a preparation prompt plus an independent reader, not a prompt-only workflow. Prompt-only costs less runtime code but cannot meet zero-model navigation.
- Keep `/files` unchanged. Extending its launcher would centralize behavior but changes a shared interface and expands regression scope. The accepted independent adapter duplicates only a small launch convention and isolates this trial. No existing shared API, schema, or configuration key changes.
- Use explicit question/exit/resume, not a persistent overlay. An overlay could reduce actions but adds focus and lifecycle complexity. Do not replace the global editor or intercept unrelated chat.
- Use a versioned JSON file with plain-text explanations. Markdown is easier to edit by hand but would require an extra parser and more terminal-rendering rules.
- Keep source private and local. Reading a prepared tour performs no GitHub lookup or model invocation. Explicitly submitted questions use the configured Pi model as normal; explain that boundary.

### Interfaces and limits
- `/pr-tour <artifact-path> <checkout-path>` opens a complete artifact against an explicitly supplied checkout. Support quoted paths; reject ambiguous or extra arguments with usage guidance. `/pr-tour` resumes the selected stop in the same session; without state, report how to open a tour.
- `/pr-tour-prepare <PR URL>` is an agent prompt, not a local reader command. It loads `skill-loader`, relevant source-language skills, and repository/worktree guidance before tracing code.
- Schema version 1 includes repository identity (`owner/repo`), HTTPS PR URL, full pinned commit ID, introduction, omissions, a source manifest, and ordered stops. Each stop has a unique stable ID, title, explanation, manifest-relative source path, and positive one-based line. Each manifest entry identifies a repository-relative path and SHA-256 of the source bytes used in preparation. Store the observed checkout path only as context, never as launch authority.
- Reject unsupported versions, malformed identities, mismatched PR/repository identity, invalid hashes, missing fields, duplicate IDs/paths, empty tours, and stops absent from the manifest. No remote URL from the artifact is executed.
- Artifact maximum: 256 KiB, measured before bounded reading and parsing. At most 32 stops, 8 KiB per explanation, 64 manifest files, 2 MiB per source file, and 16 MiB total source bytes. Cap labels/IDs/paths at 256/64/4096 UTF-8 bytes respectively; cap introduction and omissions at 8 KiB each. Reject excess rather than truncate explanations silently.
- Resolve the explicitly supplied checkout to its Git toplevel; verify repository identity without network access using its configured origin, accepting ordinary GitHub SSH/HTTPS forms and rejecting unknown forms. Do not print credential-bearing remote URLs. Verify exact HEAD before every source navigation.
- Only tracked, readable regular files at the pinned head are eligible. Reject symlink entries, symlink escapes, absolute paths, `..` components, NUL, and control characters in paths. Resolve real paths and enforce checkout confinement. Compare manifest hashes, current bytes, and raw pinned Git blobs; validate all manifest files at open and before each source navigation. Unrelated local edits do not block reading.
- Treat manifest files as all source evidence used to ground explanations, not just opened stops. Fail on missing/changed evidence rather than silently downgrade provenance. Do not run Git filters, external diff tools, repository code, or hooks to validate source.
- Plain explanation text may contain LF and tabs; reject other C0/C1 controls, escape sequences, and Unicode bidi formatting controls in artifact text. Render literal text with wrapping/scrolling through Pi TUI components, not a shell or artifact-supplied ANSI styling. Apply the same control-safety rule to displayed external errors.
- Keys: left/right or p/n for previous/next, g for a directly selectable stop list, up/down and page keys for explanation scrolling, r to retry the selected source launch, ? to leave for a question, and Escape to leave without a question. First/last boundaries do not wrap or relaunch. Direct selection of the same stop does not relaunch; r is explicit retry.
- Display introduction/omissions access, ordered stop labels, current index/title, explanation, relative path/line, pinned head, launch status, and key help. Selection is not comprehension or approval.
- On question action, close custom UI, retain the selected stop, and prefill a bounded plain-text context containing repository/PR/head, artifact location, selected stop/path/line/explanation, and a question field. Do not submit it or call `sendUserMessage`. Preserve existing unsent editor text; do not overwrite it. Escape does not inject context.
- Resume revalidates source and shows the retained stop. It does not open GoLand until the user chooses another stop or retries, so returning from a question does not interrupt manual exploration.
- Restrict reader to interactive, idle Pi on macOS. Other modes fail visibly without prompting, launching, or starting a turn. No model API belongs in reader modules.
- Allow one launch at a time and no queued navigation work. While launching, reject further navigation/retry input with visible busy state; keep exit available. Give each Git/launcher subprocess a 5-second timeout. Cap launcher and Git metadata output at 1 MiB; cap each raw Git blob output at 2 MiB, consistent with the source-file bound, and enforce the 16 MiB aggregate source bound. Abort on reader exit/session shutdown. Report timeout, failure, and truncation distinctly; do not retry automatically.

### Implementation Constraints
- No new runtime dependency, service, credentials, telemetry pipeline, or background polling. Use Node, installed Pi/TUI APIs, and Git.
- Put entrypoint at `pr-tour/index.ts`; helpers/tests stay within that directory so they are not independent extension entrypoints.
- Before implementation, read relevant installed extension/TUI docs and examples fully as required by repository guidance. Use LSP context/references for existing TypeScript symbols when materially relevant, and diagnostics after non-trivial TypeScript changes.
- Add `deliberate:` comments only for intentional limits, such as the validation-to-launch race and session-only selection, with the likely upgrade path. Do not refactor unrelated code.
- Fail closed if source identity or evidence cannot be verified. Never reset, stash, clean, switch, or edit the reviewed worktree.
- Source validation cannot stop concurrent edits after the last check. State this limit; do not add locks or claim atomic IDE synchronization.
- Stop if the native launcher requires permissions, plugins, a server, or window automation, or if exact line/window behavior is unacceptable. User approval is required to widen scope.

### Security Requirements
Private source-derived artifacts must be outside both repositories and tracked dotfiles. Use a private directory under `~/.local/state/pi/pr-tours/` (0700) and files at 0600; refuse locations inside the reviewed repository or dotfiles source. Never copy artifact contents into documentation, fixtures, commits, or published pages. Tests use synthetic content. Treat PR text/source as untrusted evidence, not execution instructions. A user-submitted question sends its selected context to the configured model; ordinary reading does not.

### Observability Requirements
Show current stop, source anchor, reviewed head, busy/launch-request status, and actionable failures in Pi. Do not report “line displayed” based on launcher exit. No metrics, dashboards, alerts, or pager apply to this explicit local workflow. Record only non-sensitive visual observations and user feedback in this plan; keep prepared explanations private.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Malformed/oversized artifact, unsupported schema, unsafe terminal text | Reject before source navigation; show safe error | Artifact tests |
| Wrong checkout/origin/head, missing/edited source, invalid line, path/symlink escape | No launcher call; identify mismatch without repairing checkout | Real Git fixture tests |
| Git failure/timeout/truncation | Fail closed; retain session selection | Command/source tests |
| Launcher unavailable/nonzero/timeout | Retain selected stop and anchor; offer r/manual opening | Adapter and command tests |
| Rapid navigation during launch | No queue or concurrent launches | Deferred-promise host test |
| Exit or shutdown during launch | Abort owned subprocess; ignore stale completion | Cancellation tests |
| Existing editor draft during question handoff | Preserve draft and add clearly separated context without submitting | Command test |
| New session/reload, resume without state | No stale selection claim; require explicit open | Session handler tests |
| Native focus/window unsuitable | Record observation; stop for user decision | Slice 1 visual gate |

### Rollout and Rollback
Owner: Matteo. First test native navigation, then expose one opt-in reader and one private tour. Do not replace review commands or change IDE settings. Apply only new reader files, its README, and the prompt after automated verification; use `chezmoi --source "$PWD" diff` and `apply` with explicit target file paths, not a directory-only verification. Package test registration is source-only. Roll back by reverting the feature source commit, removing only its added managed runtime files through explicit chezmoi targets, and reloading Pi. Stop any active reader first. Leave reviewed worktrees, existing `/files`, GoLand settings, and private artifacts untouched unless the user asks to delete them.

### Test Strategy
Use the actual registered command/custom component through a small fake Pi host; justify this seam because a live TUI is not a deterministic automated interface. Use real temporary Git repositories for identity, blobs, dirty files, and symlinks. Mock only the host/model boundary and IDE subprocess boundary, not internal collaborators. Tests must fail if local navigation calls a model/message API or performs network access. Adapter tests assert exact argv including paths with spaces and shell metacharacters. Do not use implementation helpers alone as proof of command behavior.

Focused command after dependencies are installed: `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/pr-tour/*.test.ts`. The first failing behavior is a valid artifact opening through the registered command with the correct first source request and zero model calls. Invalid-source tests must fail before their guard exists. Prompt command: `cd dot_pi/agent && node --test exact_scripts/pr-tour-prompts.test.mjs`.

Before runtime verification, run `cd dot_pi/agent && npm ci --ignore-scripts`. Keep dependencies until `npm test` and `npm run test:all` pass; then remove only the disposable source `node_modules` installed for the work. Read the test command behavior and add the `pr-tour/*.test.ts` glob to `test:unit`.

Real IDE checks use the same pinned checkout and anchors for baseline/native invocation and reader invocation. No traffic, queues, jobs, infrastructure calls, or service telemetry are involved. Isolation means no reviewed-code execution, credential cache access, Git mutation, or background launch queue. Mocks establish arguments/control flow, not visual focus, line correctness, or explanation quality. The live trial and Matteo's feedback are required for those claims; absent errors are not success evidence.

## Acceptance requirements
### R1: Native source navigation
The reader SHALL request navigation to the selected pinned file and focal line only on explicit open, stop change, or retry.
- GIVEN the pinned PR checkout, WHEN several same-file and cross-file stops are opened, THEN GoLand shows the expected project/file/line, as visually confirmed by Matteo.
- GIVEN manual IDE exploration or resume after a question, WHEN no navigation action occurs, THEN the reader SHALL NOT move the IDE. A failed launcher SHALL NOT be reported as visual success.

### R2: Source and artifact safety
The reader SHALL reject invalid artifacts or inconsistent source before launching GoLand.
- GIVEN a valid artifact and matching checkout, WHEN opened or navigated, THEN all manifest evidence and the focal line validate.
- GIVEN revision drift, relevant byte changes, missing source, unsafe text, excessive bounds, invalid line, or an escaping path, WHEN opened/navigated, THEN no IDE request occurs and a safe error identifies the failure. Unrelated local edits alone SHALL NOT block reading.

### R3: Local self-paced reading
The reader SHALL show one selected explanation and permit bounded forward, backward, direct selection, and scrolling without model or network calls.
- GIVEN a complete tour, WHEN keys select connected stops, THEN explanation and anchor follow the selected stop, including direct selection and first/last boundaries.
- GIVEN a boundary action or unsupported mode, WHEN invoked, THEN no model response or unwanted launch occurs. No comprehension/approval verdict is emitted.

### R4: Questions and place retention
The reader SHALL permit explicit normal-chat questions and preserve the selected stop within that session.
- GIVEN a selected stop, WHEN ? leaves the reader, THEN its context is available in the editor without submission; WHEN the user asks and later runs `/pr-tour`, THEN the same stop appears without an automatic IDE jump.
- GIVEN an existing draft, WHEN leaving for a question, THEN the draft is preserved. Escape alone SHALL NOT inject question context; a different session SHALL NOT inherit selection.

### R5: Bounded failures and lifetime
The reader SHALL bound subprocess work and keep failures visible without losing selection.
- GIVEN a slow or failing launcher, WHEN navigation is requested, THEN at most one launch runs, failures/timeouts are visible, and retry remains explicit.
- GIVEN busy launch work, WHEN more navigation is requested, THEN no queue grows; WHEN the reader exits or session shuts down, THEN owned subprocess work is aborted and stale completion does not update UI.

### R6: Source-led preparation and useful first trial
Preparation SHALL produce a complete private tour grounded in pinned PR #791 source and tests, with provenance and omissions.
- GIVEN accessible pinned source, WHEN `/pr-tour-prepare` finishes, THEN a bounded valid artifact connects one behavior through entry point, implementation, and selected test evidence. Reading works without GitHub/model access.
- GIVEN misleading PR prose, unavailable evidence, or incomplete generation, WHEN preparing, THEN claims remain labeled, omissions/gaps are explicit, and no partial tour starts automatically. No review verdict or measured speed improvement is claimed.

## Execution sequence
### Slice 1: See whether native GoLand navigation is acceptable
#### Task 1: Run the visual feasibility gate
**Delivers:** Observed project/file/line behavior and a user decision before reader implementation.
**Blocked by:** None.
**Traces to:** R1, R5, design rollout gate.
**Files:** Update only `plans/pr-goland-tour/plan.md` with non-sensitive observations; inspect ddtool source read-only.

- [ ] Resolve PR #791's existing worktree with `feature-worktree`; recheck exact HEAD and clean relevant source. Do not reset it. If GitHub metadata is needed, use `gh` account routing and restore/verify the original login on all paths.
- [ ] Read `internal/cmd/cluster_write_session.go`, `internal/cmd/auth_kube.go`, and relevant test anchors to choose two same-file lines and one cross-file line. Do not run their code/tests or access caches.
- [ ] With Matteo ready to observe, test the native invocation shape `open -na GoLand.app --args <checkout> --line <positive-line> <absolute-file>` using argument arrays and substituted real anchors. Verify argument order against installed launcher/JetBrains docs; this pins an interface, not a shell string to interpolate.
- [ ] Observe repeated navigation, project-window reuse, exact lines, terminal/IDE focus, and manual exploration. There is no reliable headless visual assertion; Matteo reports actual outcomes. Cleanup requires no project changes or persistent helper.
- [ ] Record observations and ask whether focus/navigation effort is acceptable. If not, stop; do not build Slice 2 or expand design.
- [ ] Commit evidence with `docs: record GoLand navigation trial` if an evidence update is made.

### Slice 2: Read a prepared tour and return from a question
#### Task 2: Deliver the validated local reader
**Delivers:** A synthetic prepared tour can be read, navigated, questioned, and resumed safely through the registered command.
**Blocked by:** Task 1 accepted by Matteo.
**Traces to:** R1–R5.
**Files:** Create `dot_pi/agent/exact_extensions/pr-tour/{index,artifact,reader,goland}.ts`, `dot_pi/agent/exact_extensions/pr-tour/{command,artifact,reader,goland}.test.ts`, and an initial `dot_pi/agent/exact_extensions/pr-tour/README.md`; modify `dot_pi/agent/package.json`.

- [ ] Read applicable installed extension/TUI docs and examples, then install source test dependencies with `cd dot_pi/agent && npm ci --ignore-scripts`.
- [ ] Add the focused failing registered-command test with a real temporary Git checkout and a synthetic private artifact. Run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/pr-tour/*.test.ts`; expect failure until the opening/navigation contract exists.
- [ ] Implement only the schema/source checks, command, local UI, question/resume state, and IDE adapter needed for the accepted vertical behavior. Add failure/negative tests from R1–R5 and the failure-mode table before their guards where practical.
- [ ] Test the actual component at narrow widths, with long explanations, scrolling, direct selection, first/last boundaries, draft preservation, resume, and session cleanup. Use no generated private source in committed fixtures.
- [ ] Verify real Git/source drift cases, literal paths with spaces/metacharacters, exact launch arguments, busy rejection, cancellation, safe error text, and zero model/network calls during reading.
- [ ] Add the test glob to `test:unit`, run LSP diagnostics, rerun focused tests, and run `cd dot_pi/agent && npm test` and `cd dot_pi/agent && npm run test:all`; expect all tests green. Refactor only after green and rerun.
- [ ] Write enough initial README usage/reference for a synthetic-tour demo. Record native invocation evidence separately from mocked launch success.
- [ ] Follow explicit-file chezmoi diff/apply only after verification; reload Pi and demonstrate the reader with synthetic content before preparing private source.
- [ ] Commit with `feat(pi): add local pinned-source PR tour reader`.

### Slice 3: Prepare PR #791 and assess the complete experience
#### Task 3: Deliver source-led preparation
**Delivers:** A reusable preparation prompt produces one complete private tour and hands off to the local reader without starting it automatically.
**Blocked by:** Task 2.
**Traces to:** R6 and R2 artifact contract.
**Files:** Create `dot_pi/agent/exact_prompts/pr-tour-prepare.md` and `dot_pi/agent/exact_scripts/pr-tour-prompts.test.mjs`; update `dot_pi/agent/exact_extensions/pr-tour/README.md`.

- [ ] Add focused failing prompt-contract tests following existing `*-prompts.test.mjs` patterns; run `cd dot_pi/agent && node --test exact_scripts/pr-tour-prompts.test.mjs`.
- [ ] Implement prompt instructions for skill loading, GitHub account restoration, worktree resolution, source pinning, semantic tracing, bounded schema, private storage, author-claim labeling, omissions, and explicit reader handoff. Require complete validation before declaring preparation done.
- [ ] Reuse existing tools/Node facilities for manifest byte hashes and permissions; do not add a custom generation service or runtime dependency. Prompt contract tests check required instructions, not the truth of generated explanations.
- [ ] Rerun prompt and full Pi tests; expect green. Apply only the explicit prompt target and reload as needed after verification.
- [ ] Prepare PR #791's actual private artifact under `~/.local/state/pi/pr-tours/`, outside tracked repositories. Trace the pinned implementation/test definitions and references before naming the final stops. Do not execute the authorization command or ddtool tests.
- [ ] Validate the complete artifact through `/pr-tour <artifact-path> <checkout-path>`. Correct generation errors rather than weakening validation. Mark omitted areas and distinguish a walkthrough from a full review.
- [ ] Commit only source changes with `feat(pi): add source-led PR tour preparation prompt`; never stage the generated artifact.

#### Task 4: Complete live feedback, documentation, and future-agent guidance
**Delivers:** A verified end-to-end trial with honest limits and enough guidance to repeat or roll back it.
**Blocked by:** Task 3.
**Traces to:** R1–R6, design success criteria, documentation and operational instructions.
**Files:** Update `dot_pi/agent/exact_extensions/pr-tour/README.md` and `plans/pr-goland-tour/plan.md`; inspect `AGENTS.md` and `dot_pi/agent/AGENTS.md`, modifying them only if a durable nonduplicated procedure/trap is needed.

- [ ] In Pi beside GoLand, traverse several connected PR stops, use direct/back selection, explore surrounding source manually, ask one normal-chat question, and resume. Verify no model turn occurs for navigation, and no unexpected IDE jump occurs while exploring or resuming.
- [ ] Ask Matteo whether logical order helps, whether explanation size is suitable, and whether focus/navigation effort is acceptable. Record actual non-sensitive feedback; do not claim measured review-speed gains.
- [ ] Complete the README how-to and schema/key reference: preparation versus reading, private storage, exact invocation examples with real-safe paths, questions, source drift, retry, focus limits, bounds, and explicit rollback. Avoid embedding private tour content.
- [ ] Review both relevant `AGENTS.md` files. Record why no edit is needed if existing extension/test/chezmoi instructions cover the feature; add only a discovered durable trap or procedure, not prompt behavior or duplicated usage documentation.
- [ ] Run final focused, prompt, `npm test`, and `npm run test:all` verification. Keep source dependencies through both full commands, then remove only the disposable installed source dependencies. Preview/apply/verify every changed runtime target explicitly with `chezmoi --source "$PWD"`; do not trust an empty directory-only diff.
- [ ] **Final verification:** R1–R6 require both automated tests and the observed PR #791 question/resume trial. If visual evidence or user feedback is unavailable, mark that acceptance blocked rather than infer success from passing tests.
- [ ] Commit guidance with `docs(pi): document PR tour workflow and trial limits`; push verified feature commits when repository state is safe. Do not publish private artifacts.

## Self-review and handoff constraints
- All implementation tasks trace to R1–R6 or explicit workflow/documentation instructions. Task 1 is a genuine native-integration blocker; Task 2 delivers reading across all layers; Task 3 adds preparation; Task 4 establishes real experience evidence.
- The user confirmed the independent adapter rather than modifying the shared `/files` launcher. No shared-consumer migration is needed; its existing regression tests remain in the full suite.
- This plan does not authorize a plugin, server, permissions, publishing, infrastructure operations, or broader review system. Any required expansion returns to user alignment.
- A plan-only change requires no runtime chezmoi apply. Commit only this plan during planning; implementation and live navigation belong to execution after systematic review.
