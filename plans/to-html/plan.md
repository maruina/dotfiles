# `/to-html` Local Response Preview Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Pi `/to-html` command that safely renders the latest completed assistant response as offline local HTML, opens it in the default browser, and replaces retired PR-review HTML artifacts.
**Architecture:** A single auto-discovered TypeScript extension owns response extraction, bounded local preview lifecycle, static HTML generation, and browser invocation. Node renders Markdown and code server-side; each generated document embeds the locked local Mermaid browser bundle and renders diagrams independently. Existing prompt templates retain review and worktree-cleanup responsibilities, with only their obsolete HTML-artifact branches removed.
**Tech Stack:** TypeScript, Node.js 25, Pi 0.80.6 extension APIs, `marked@18.0.10`, `highlight.js@11.12.0`, `mermaid@11.17.0`, Node `node:test`, npm, and chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | The planning input named a design file in another worktree. | Resolved `plans/to-html/design.md` to the `maruina/to-html` worktree and performed planning there. |
| `skill-loader` | prompt-required | `/plan` requires affected-file-based skill selection. | Identified the applicable chezmoi, prose, unfamiliar-code, Mermaid, and learning-lookup guidance; confirmed no Go, Terraform, or shell-script trigger applies. |
| `codebase-research` | skill-loader | Pi extension, prompt, and test behavior is an unfamiliar repository area. | Mapped extension entry points, active-branch selection, package gates, test harnesses, and the retired PR artifact flow before selecting mechanisms. |
| `chezmoi` | skill-loader | All affected files are chezmoi-managed source. | Applied source-only editing, exact-directory rendering, targeted diff/apply, and Pi npm validation requirements. |
| `write` | skill-loader | This durable plan and the prompt changes are reader-facing prose. | Kept task instructions, scope boundaries, and behavior contracts concise and explicit. |
| `obsidian-cli` | prompt-required | Planning requires advisory learning lookup. | Read `Datadog/Learnings.md` and queried `learning-sections`; none of the four stored sections matched the rendering/extension terms, so no advisory guidance affects this plan. |
| `mermaid-best-practices` | agent-selected | The extension consumes fenced Mermaid diagrams. | Preserved the repository’s existing fenced-Mermaid convention and kept source/document output conventions outside this work. |

## Goal and Scope
Implement the approved `plans/to-html/design.md` behavior:

- Add manual `/to-html` rendering for the latest completed assistant response on the active session branch.
- Support ordinary Markdown, highlighted fenced code, and in-place Mermaid diagrams without a CDN, server, or browser automation.
- Treat assistant content as untrusted; keep output static except for the local, strict Mermaid runtime.
- Bound response input, Mermaid fences, temporary files, file count, and aggregate preview storage.
- Open successfully generated previews with the platform default browser handler and retain a file when the opener fails.
- Remove the optional `/pr-review` HTML artifact and `/pr-cleanup` HTML deletion path.

Out of scope:

- Automatic previews, TUI image rendering, persistent previews, response caching, a reopen command, artifact export, browser process management, headless browsers, screenshots, or a preview server.
- Rendering raw assistant HTML, downloading external assets, or changing existing Mermaid source/document conventions.
- PR-specific replacement artifacts, review-worktree behavior, or changes to `mermaid-best-practices`.

## Feasibility Gate
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Global `/to-html` command | `pi.registerCommand()` in a top-level file under `dot_pi/agent/exact_extensions/` | `answer.ts` and `files.ts` are auto-discovered extension entry points; Pi 0.80.6 documents command registration | Registration harness invokes the stored handler; `npm run test:smoke` exits 0 without `[Extension issues]` | Block; do not replace the extension with a prompt template. |
| Latest active-branch response | `ctx.sessionManager.getBranch()` reverse-scan, assistant text blocks only, `stopReason === "stop"` | `answer.ts` uses this API; Pi session-format documentation defines assistant content and stop reasons | Unit tests cover latest text, no text, no assistant response, and rejected non-terminal responses | Notify and create no preview. |
| Offline Markdown, code, and Mermaid | Direct exact dependencies: `marked@18.0.10`, `highlight.js@11.12.0`, and `mermaid@11.17.0` | npm metadata resolves each version; Mermaid’s package manifest contains `dist/mermaid.esm.min.mjs` | Generated-document tests plus browser manual validation with network disabled | Block dependency addition if the locked install cannot resolve every package. |
| Default browser launch | `pi.exec()` with a 10-second timeout: `open`, `xdg-open`, or `cmd.exe /d /s /c start "" "<path>"` | Pi documents `pi.exec`; `files.ts` uses it for existing local opening behavior | Unit tests assert platform command construction; macOS manual smoke validation observes browser opening | Retain the output file and notify the user of the opener failure. |
| Safe bounded temporary storage | `os.tmpdir()/pi-to-html`, owner-only directory/file modes, regular-file-only cleanup, age/count/aggregate limits, and output-size reservation | Node filesystem APIs; `cost-optimization.ts` exercises temporary-resource cleanup | Temporary-directory tests cover limits, unsafe entries, and errors | Reject rendering only when safe directory preparation or final hard capacity cannot be achieved. |
| Retired review artifacts | Surgical edits to `pr-review.md`, `pr-cleanup.md`, and `lifecycle-prompts.test.mjs` | The design and current prompt contracts name the exact legacy path and CDN behavior | Contract tests reject the retired HTML/CDN/deletion behavior | Block the prompt slice; do not retain two rendering paths. |

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Runtime dependencies and test gate | `dot_pi/agent/package.json`, `dot_pi/agent/package-lock.json` | Declare exact production dependencies and include the new extension test in the standard unit gate | `npm ci --ignore-scripts`; `npm test` |
| Local preview extension | `dot_pi/agent/exact_extensions/to-html.ts` | Register command and startup cleanup; select response, render static safe HTML, manage previews, and open the browser | Focused `node --experimental-strip-types --test exact_extensions/to-html.test.mjs`; TypeScript diagnostics |
| Extension tests | `dot_pi/agent/exact_extensions/to-html.test.mjs` | Verify observable rendering, limit, filesystem, and opener contracts through exported helpers and injected boundaries | Focused test exits 0 |
| Review prompt | `dot_pi/agent/exact_prompts/pr-review.md` | Keep review output Markdown-only and point a user requesting local browser display to `/to-html` | Lifecycle prompt contract test |
| Cleanup prompt | `dot_pi/agent/exact_prompts/pr-cleanup.md` | Remove only the validated PR review worktree; stop computing, deleting, and reporting an HTML artifact | Lifecycle prompt contract test |
| Prompt contract | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Assert the retired artifact workflow is absent and the normal review/worktree-cleanup contracts remain | `node --test exact_scripts/lifecycle-prompts.test.mjs` |

**Key Decisions**
- Reject, rather than downgrade to an older response, when the newest assistant message is absent, has no text, or did not end with `stopReason: "stop"`.
- Keep the extension in one top-level `to-html.ts` file. Export small pure helpers and inject clock, filesystem, and opener boundaries for tests instead of introducing an extension framework or package directory.
- Add third-party runtime packages to `dependencies` with exact versions. Pi loads global extensions from the rendered agent directory, so dev-only dependencies are not a valid runtime contract.
- Render Markdown in Node. Configure `marked` renderers to escape raw HTML, render images as inert escaped text, and allow only static relative, fragment, `http:`, `https:`, and `mailto:` link destinations. Unsupported destinations render as inert text.
- Render normal fenced code through registered `highlight.js` languages; fall back to escaped plaintext when a language is unknown. Render Mermaid fences as escaped `<pre class="mermaid">` source in original document position.
- Inline the package’s local `dist/mermaid.esm.min.mjs` into each preview. Initialize Mermaid with `securityLevel: "strict"`, read diagram source through text content, and render each diagram individually so an invalid diagram produces a local source/error panel without preventing later diagrams or prose.
- Create only regular files matching the extension-owned filename pattern in `os.tmpdir()/pi-to-html`. Before writing, calculate generated HTML bytes, retain at most nine prior previews, and evict old matching regular files until adding the output preserves the final 10-file and 50-MiB limits.
- Use `pi.exec()` rather than a new subprocess wrapper, with a bounded 10-second opener invocation. Unsupported platforms and failed openers are user-visible errors; a failed opener never deletes a valid preview.
- Replace the PR-specific artifact instructions with `/to-html` discoverability. Do not alter review verdict, worktree, or review-report behavior.

**Security Requirements**
- Assistant response content MUST NOT be emitted as unescaped HTML, JavaScript, CSS, file names, notifications, logs, or opener command arguments.
- Markdown raw HTML, code text, Mermaid text, image source/alt text, and unsupported link destinations MUST be escaped or rendered inert before insertion into the document.
- The generated document MUST NOT reference a remote script, stylesheet, image, font, icon, or browser-loaded Markdown parser.
- Mermaid source MUST enter the DOM through escaped text and Mermaid MUST use strict security mode.
- The preview directory MUST be created with mode `0700` and preview files with mode `0600` where the platform honors POSIX modes. Cleanup MUST ignore symlinks, directories, and non-matching files.
- The command MUST cap accepted response text at 1 MiB UTF-8 and 20 complete Mermaid fences before rendering; it MUST reject excess input rather than partially render it.

**Observability Requirements**
- Use concise Pi notifications for unsupported mode, missing/incomplete response, input-limit rejection, directory/write/render failure, unsupported platform, and opener failure.
- Success notification MAY identify the created local path. No response content may appear in notifications.
- Mermaid failures are observable in the generated document beside only the rejected diagram.
- No metrics, traces, dashboards, alerts, logs, or runbook are required: this is an opt-in local command with no long-running process or on-call owner.

**Failure Modes to Handle**
- No assistant message, no text blocks, or a non-`stop` assistant message: notify and create no file.
- More than 1 MiB UTF-8 or more than 20 complete Mermaid fences: notify and create no file.
- Markdown generation, Mermaid bundle loading, directory preparation, or atomic preview writing failure: notify; remove only the partial extension-owned output when one was created.
- An invalid Mermaid diagram: render surrounding Markdown and other diagrams; show escaped source plus a local error panel for only that diagram.
- Cleanup scan/remove error: continue only when the owner-scoped directory remains safe and can meet final file-count and storage bounds; otherwise notify and create no file.
- Browser-opener timeout, nonzero result, or thrown execution error: retain the completed file and notify with the safe local path.
- Unsupported platform: retain no newly generated file and notify before attempting a shell command.

**Rollout and Rollback**
- Smallest safe rollout: land the extension/dependency commit and prompt-retirement commit on `maruina/to-html`; run `/verify` before applying managed targets.
- After fresh verification, inspect `chezmoi --source "$PWD" diff ~/.pi/agent/extensions ~/.pi/agent/prompts ~/.pi/agent/package.json ~/.pi/agent/package-lock.json`, then apply only those targets and reload Pi.
- Fastest rollback: revert the two implementation commits, inspect the same targeted chezmoi diff, apply the reverted targets, and remove only `os.tmpdir()/pi-to-html` if local preview files should be discarded immediately.
- Owner: Matteo. The command has no server-side rollout, migration, or persistent data recovery path.

**Test Strategy**
- Use `node:test` with exported pure helpers and a minimal Pi command-registration harness. Inject filesystem, time, random identifier, Mermaid-bundle reader, and opener seams; do not mock `marked`, `highlight.js`, or Mermaid bundle content.
- Test generated HTML as text. Browser execution is not automated because headless browser tooling is explicitly out of scope.
- Run manual browser validation only after source checks pass and after the targeted chezmoi apply. Disconnect networking or block outbound traffic before opening the generated document, then verify the visible diagrams still render.
- The first narrow red command is `node --experimental-strip-types --test exact_extensions/to-html.test.mjs` after the test imports the not-yet-created `to-html.ts`; it MUST fail for that missing implementation rather than an unrelated package or fixture issue.

## Acceptance Requirements
### Requirement R1: Select the latest completed assistant response
The system SHALL render only text blocks from the latest assistant message on the active session branch when that message completed with `stopReason: "stop"`.

#### Scenario R1.1: Text response on the active branch
- GIVEN an active branch whose newest assistant message contains multiple text blocks and non-text blocks
- WHEN the user invokes `/to-html` in interactive TUI mode
- THEN the extension SHALL concatenate only those text blocks in message order
- AND it SHALL not inspect inactive branches, tool results, or thinking blocks.

#### Scenario R1.2: Incomplete latest response
- GIVEN the newest assistant message has `stopReason: "toolUse"`, `"length"`, `"error"`, or `"aborted"`
- WHEN the user invokes `/to-html`
- THEN the extension SHALL create no preview file
- AND it SHALL notify that the latest assistant response is incomplete.

#### Scenario R1.3: Missing usable response
- GIVEN the active branch has no assistant message with text blocks
- WHEN the user invokes `/to-html`
- THEN the extension SHALL create no preview file
- AND it SHALL emit a concise error notification without response content.

### Requirement R2: Render an offline, safe, ordered document
The system SHALL generate static HTML that preserves Markdown prose, code fences, and complete Mermaid fences in original order without loading remote resources or executing assistant-provided markup.

#### Scenario R2.1: Mixed Markdown content
- GIVEN a response with prose before, between, and after two Mermaid fences and two ordinary code fences
- WHEN `/to-html` generates the document
- THEN prose, code, and Mermaid placeholders SHALL occur in the same order as the source
- AND known code languages SHALL be server-side highlighted while unknown languages SHALL be escaped plaintext.

#### Scenario R2.2: Untrusted markup and media
- GIVEN a response includes raw HTML, script-like tags, Mermaid text containing closing-tag syntax, a Markdown image, a safe HTTPS link, and a `javascript:` link
- WHEN `/to-html` generates the document
- THEN raw HTML, code, and Mermaid source SHALL be escaped
- AND the image and unsafe destination SHALL be inert text with no remote resource element
- AND the HTTPS link SHALL remain a user-initiated static link.

#### Scenario R2.3: Invalid Mermaid diagram
- GIVEN a response contains valid Mermaid fences surrounding one invalid Mermaid fence
- WHEN the generated document opens in a browser
- THEN the valid diagrams SHALL render with strict Mermaid security
- AND the invalid diagram SHALL show only its local error/source panel without suppressing surrounding document content.

#### Scenario R2.4: Bounded input
- GIVEN a completed response exceeding 1 MiB UTF-8 or containing more than 20 complete Mermaid fences
- WHEN the user invokes `/to-html`
- THEN the extension SHALL reject the request before writing a file
- AND it SHALL report the exceeded bound concisely.

### Requirement R3: Bound extension-owned previews and open them safely
The system SHALL create and retain only bounded extension-owned local preview files, then ask the platform to open a successful preview with its default browser handler.

#### Scenario R3.1: Preview creation and browser open
- GIVEN a valid completed response and available storage capacity
- WHEN the user invokes `/to-html` on macOS, Linux, or Windows
- THEN the extension SHALL create a mode-`0600` matching HTML file under the mode-`0700` `pi-to-html` temporary directory
- AND it SHALL invoke the platform-specific opener with a 10-second timeout.

#### Scenario R3.2: Cleanup limits
- GIVEN the temporary directory contains matching regular preview files that exceed the 24-hour, 10-file, or 50-MiB bounds plus an unrelated file and a symlink
- WHEN startup cleanup or pre-render cleanup runs
- THEN it SHALL remove only eligible matching regular files needed to satisfy the final bounds
- AND it SHALL leave the unrelated file and symlink untouched.

#### Scenario R3.3: Opener failure
- GIVEN preview generation succeeds but the default opener exits nonzero, times out, or throws
- WHEN `/to-html` attempts to open the document
- THEN it SHALL retain the completed preview for inspection
- AND it SHALL show a concise opener-error notification with a safe local path.

### Requirement R4: Retire PR-specific HTML artifacts
The review workflow SHALL remain Markdown-first and SHALL not create, depend on, clean up, or advertise the retired CDN-backed PR-review HTML artifact.

#### Scenario R4.1: Browser display requested during review
- GIVEN a user requests browser rendering while running `/pr-review`
- WHEN the review response is produced
- THEN `/pr-review` SHALL keep the report as normal Markdown
- AND it SHALL direct the user to run `/to-html` after the response settles.

#### Scenario R4.2: PR cleanup
- GIVEN a valid PR URL passed to `/pr-cleanup`
- WHEN the matching review worktree is clean or absent
- THEN the prompt SHALL report only the worktree cleanup result
- AND it SHALL not compute, remove, or report a PR-review HTML path.

## Implementation Tasks
### Task 1: Add the safe local HTML command and focused test coverage
**Traceability:** R1, R2, and the preview-generation portion of R3.

**Files:**
- Modify `dot_pi/agent/package.json`.
- Modify `dot_pi/agent/package-lock.json`.
- Create `dot_pi/agent/exact_extensions/to-html.ts`.
- Create `dot_pi/agent/exact_extensions/to-html.test.mjs`.

- [ ] From `dot_pi/agent`, update production dependencies and the lockfile with `npm install --package-lock-only --save-exact marked@18.0.10 highlight.js@11.12.0 mermaid@11.17.0`; update `test:unit` so the normal gate includes `exact_extensions/to-html.test.mjs`. Inspect the lockfile diff and confirm it resolves only the three declared direct runtime packages and their transitive dependencies.
- [ ] Run `npm ci --ignore-scripts` from `dot_pi/agent` before TypeScript analysis or tests. Keep the ignored source `node_modules` directory through `/verify`, as required by `dot_pi/agent/AGENTS.md`.
- [ ] Write `to-html.test.mjs` first. Import the absent extension’s named helpers and register its command through a minimal fake `ExtensionAPI`; cover R1.1-R1.3 and assert the initial focused command fails because `to-html.ts` does not exist.
- [ ] Extend the same test file before implementation for R2.1-R2.4: byte/fence bounds, ordering, raw HTML escaping, inert image handling, safe/unsafe links, escaped Mermaid source, strict Mermaid initialization, independent Mermaid-error handling markup, known-language highlighting, and unknown-language plaintext fallback.
- [ ] Implement `to-html.ts` as one top-level default extension factory plus exported pure helpers. Register `/to-html` with a concise description and enforce `ctx.mode === "tui"` before reading the session branch.
- [ ] Reverse-scan `ctx.sessionManager.getBranch()` for the latest assistant entry. Reject a missing text response or a newest assistant entry whose `stopReason` is not `"stop"`; concatenate only `type: "text"` blocks from the accepted message.
- [ ] Enforce the UTF-8 byte and complete Mermaid-fence bounds before rendering. Use `marked` tokens to distinguish complete Mermaid code fences from ordinary Markdown and malformed fences.
- [ ] Configure controlled `marked` renderers for raw HTML, links, images, and fenced code. Escape all inserted response content; use `highlight.js` only for a resolved language; convert Mermaid code tokens into escaped `<pre class="mermaid">` elements; and use escaped plaintext for unknown languages.
- [ ] Read Mermaid’s local `dist/mermaid.esm.min.mjs` from the installed package and inline it into the static document. Add only local inline CSS and a module script that initializes strict Mermaid and converts each Mermaid placeholder independently, retaining escaped source/error information when a render rejects.
- [ ] Create the minimal safe preview write path required for an end-to-end command test: establish the extension directory, use a random matching filename, write the complete generated document with exclusive creation, and call the injected/default opener. Task 2 will add cleanup policy and capacity reservation before this path is committed.
- [ ] Run `node --experimental-strip-types --test exact_extensions/to-html.test.mjs`; expect every R1/R2 test and the initial command-harness success case to pass.
- [ ] Run `lsp_diagnostics` for `dot_pi/agent/exact_extensions/to-html.ts`; expect no TypeScript diagnostics after `npm ci --ignore-scripts` supplies the workspace TypeScript dependency.
- [ ] Run `git diff --check -- dot_pi/agent/package.json dot_pi/agent/package-lock.json dot_pi/agent/exact_extensions/to-html.ts dot_pi/agent/exact_extensions/to-html.test.mjs`; expect no whitespace errors.
- [ ] Do not commit this incomplete storage slice. Continue directly to Task 2 so the first feature commit satisfies the complete preview-lifecycle contract.

### Task 2: Enforce preview lifecycle bounds and platform opener behavior
**Traceability:** R3.

**Files:**
- Modify `dot_pi/agent/exact_extensions/to-html.ts`.
- Modify `dot_pi/agent/exact_extensions/to-html.test.mjs`.

- [ ] Add focused tests first for `pi-to-html` directory preparation, owner modes where supported, matching filename recognition, regular-file-only cleanup, 24-hour expiration, newest-file retention, final 10-file count, final 50-MiB aggregate capacity, and output-size reservation.
- [ ] Add tests for cleanup error boundaries: unrelated files and symlinks remain untouched; an unsafe/non-directory preview root is rejected; an unreadable or undeletable eligible file fails only when final capacity cannot be met; and a stale-file cleanup error that still leaves capacity does not prevent rendering.
- [ ] Add tests for macOS, Linux, Windows, and unsupported-platform opener selection. Assert the precise `pi.exec()` command/arguments, 10-second timeout, successful notification behavior, and R3.3 retention/error behavior when execution returns nonzero, times out, or throws.
- [ ] Run `node --experimental-strip-types --test exact_extensions/to-html.test.mjs`; expect focused failures for the absent cleanup/capacity/opener behavior, not dependency-loading failures.
- [ ] Implement safe directory preparation with `lstat` checks, mode `0700` creation, and no symlink traversal. Limit cleanup to matching regular files created by this extension and apply age, count, and aggregate-size eviction in deterministic oldest-first order while retaining the newest eligible files.
- [ ] Render the document in memory, calculate its UTF-8 bytes, reserve capacity before writing, and reject an output that cannot fit within the 50-MiB hard limit. Create the output with a mode-`0600`, random matching filename and exclusive write. Run cleanup at `session_start` on a best-effort basis and before each command invocation with the current output’s reservation.
- [ ] Implement the opener through `pi.exec()`: `open` on Darwin, `xdg-open` on Linux, and `cmd.exe` with `/d`, `/s`, `/c`, and `start "" "<path>"` on Windows. On nonzero, timeout, or thrown failure, retain the preview and notify without response content.
- [ ] Rerun `node --experimental-strip-types --test exact_extensions/to-html.test.mjs`; expect all R1-R3 unit tests to pass.
- [ ] Run `npm test`; expect the new test and all existing unit, prompt, skill, and Pi-dependency validation gates to pass.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Commit Task 1 and Task 2 files only with `feat(pi): add local response HTML preview`.

### Task 3: Remove the PR-review HTML artifact path
**Traceability:** R4.

**Files:**
- Modify `dot_pi/agent/exact_prompts/pr-review.md`.
- Modify `dot_pi/agent/exact_prompts/pr-cleanup.md`.
- Modify `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [ ] Extend `lifecycle-prompts.test.mjs` first to require `/to-html` discoverability wording in `/pr-review`, forbid the retired review HTML filename and jsDelivr Mermaid URL, and forbid `HTML` artifact calculation/deletion/reporting in `/pr-cleanup` while preserving the no-`--force` worktree removal assertion.
- [ ] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect failures caused by the current retired artifact instructions.
- [ ] Remove only the optional review-artifact paragraph from `pr-review.md`. Keep the normal Markdown review contract intact and add the narrow instruction to direct a user requesting a local browser rendering to run `/to-html` after the response settles.
- [ ] Remove `HTML` path calculation, `rm -f` behavior, and artifact status reporting from `pr-cleanup.md`. Update its title/summary and report contract to cover only the validated review worktree.
- [ ] Rerun `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all lifecycle prompt contracts to pass.
- [ ] Run `npm test`; expect the changed prompt contract and all existing repository gates to pass.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/pr-review.md ~/.pi/agent/prompts/pr-cleanup.md` from the repository root; expect only the retired review HTML/CDN/delete behavior to disappear and `/to-html` discoverability to appear in the review prompt.
- [ ] Commit only Task 3 files with `refactor(pi): retire review HTML artifacts`.

### Task 4: Review documentation, validate the complete candidate, and prepare verification
**Traceability:** R1-R4 and the mandatory documentation/future-agent review.

**Files to inspect:**
- `AGENTS.md`.
- `dot_pi/agent/AGENTS.md`.
- `README.md` if it exists.
- `plans/to-html/design.md`.
- `plans/to-html/plan.md`.
- `dot_pi/agent/exact_skills/mermaid-best-practices/SKILL.md`.
- Relevant Pi extension/package documentation and examples already identified during planning.

- [ ] Inspect user-facing documentation, prompt descriptions, developer docs, READMEs, examples, generated references, runbooks, and every relevant `AGENTS.md`. Update only an existing document that became inaccurate or lacks durable source-layout, dependency, validation, or rollout knowledge; otherwise record in the execution notes that `/to-html`’s command description, design, and plan are sufficient and that this local opt-in command needs no operational runbook.
- [ ] If the inspection changes documentation, list each exact changed path, run its relevant focused validation, and commit only it with `docs(pi): document local HTML previews`. If no documentation file needs modification, do not create an empty documentation commit.
- [ ] Run `npm ci --ignore-scripts`, then from `dot_pi/agent` run `npm test` and `npm run test:all`; expect all suites to pass and the offline Pi smoke test to emit no `[Extension issues]` output.
- [ ] Run `lsp_diagnostics` for `dot_pi/agent/exact_extensions/to-html.ts`; expect no diagnostics after the final TypeScript candidate is installed.
- [ ] Run `git diff --check origin/main...HEAD` and `git diff --check`; expect no whitespace errors or conflict markers.
- [ ] Run `rg -n 'REPO-pr-PR_NUMBER-review\.html|cdn\.jsdelivr\.net/npm/mermaid' dot_pi/agent --glob '!node_modules/**'`; expect no runtime prompt reference to the retired artifact/CDN path.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/extensions ~/.pi/agent/prompts ~/.pi/agent/package.json ~/.pi/agent/package-lock.json`; expect only the new extension/test dependencies, retired prompt behavior, and reviewed prompt-contract change.
- [ ] Inspect `git status --short`, `git log --oneline origin/main..HEAD`, and `git diff origin/main...HEAD`. Confirm the candidate changes only files named by this plan, contains no home-directory targets or temporary preview files, and has no direct changes to Mermaid source conventions.
- [ ] Leave ignored `dot_pi/agent/node_modules` installed for the independent `/verify` run. Do not apply chezmoi targets, reload Pi, push, or claim final verification during `/execute`.

## Post-Verification Rollout
Run only after `/verify plans/to-html/plan.md` returns a fresh `VERIFIED` verdict for the unchanged candidate.

1. Re-run the targeted chezmoi diff from Task 4 and confirm it matches the verified candidate.
2. Apply only the reviewed targets from the feature worktree: `chezmoi --source "$PWD" apply ~/.pi/agent/extensions ~/.pi/agent/prompts ~/.pi/agent/package.json ~/.pi/agent/package-lock.json`.
3. From `~/.pi/agent`, run `npm test` and `npm run test:all`; expect the rendered resource set to pass all tests and the offline smoke test to show no extension issue.
4. Reload Pi, generate a completed response containing prose around two Mermaid fences, known and unknown language code fences, a Markdown image, safe and unsafe links, raw HTML, and one malformed Mermaid fence, then invoke `/to-html`.
5. Disable network access before opening the preview. Verify the default browser opens the local file, valid diagrams render, the malformed diagram stays local to its source/error panel, raw markup does not execute, no remote assets load, and a browser refresh works while the file remains within retention limits.
6. Verify `/pr-review` returns only Markdown and directs browser rendering to `/to-html`; verify `/pr-cleanup` reports only the review worktree state.
7. Remove `dot_pi/agent/node_modules` only after rendered validation completes. Push the verified commits following normal repository workflow.
