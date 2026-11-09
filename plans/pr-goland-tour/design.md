# Self-paced PR tours with GoLand
## Status
Behavioral framing confirmed by Matteo during `/brainstorm`. This specification defines the first user-feedback slice, not an implemented feature. Implementation packaging remains a planning decision. No extension, prompt, or IDE behavior was changed during discovery.

## Alignment brief
Problem: File-by-file GitHub diffs do not present changes in the order needed to understand a behavior. Repeated conversational “next” requests also add model latency to reading.

User / audience: Matteo, reviewing PRs on a Mac with Pi and GoLand side by side.

Goal: Prepare a logical walkthrough once, then let the user navigate its explanations and the actual source without a model turn per stop. GoLand is required because surrounding code and normal IDE navigation are useful to the review.

Non-goals: Automatic playback, comprehension detection, a GoLand plugin, GitHub comment submission, formal approval verdicts, a complete multi-agent review system, and publishing explainer pages.

Smallest user-feedback slice: Use https://github.com/ddoghq/ddtool/pull/791 as the first test. Prepare a short sequence following one behavior through its entry point, implementation, and relevant tests. Show one explanation at a time in the terminal and open its source location in GoLand. Permit forward, backward, and direct stop selection without model calls. Permit a question and return to the selected stop.

Success: The selected source location matches the pinned code, navigation does not require a model response, manual IDE exploration is not interrupted, and questions do not lose the user's place. Ask the user whether this makes logical review easier and whether focus changes or navigation add unacceptable effort. No review-speed improvement is claimed before that feedback.

Operational notes: Local, on-demand workflow owned by the user; no service, background polling, or pager. Generation may require GitHub access. Reading a prepared tour must not require GitHub or a model call.

## Context reviewed
- The user's constraints: actual GoLand source, surrounding code, logical ordering, no repeated model-turn cost for navigation, and questions on demand. The user confirmed the first slice and selected PR #791.
- Pi prompt-template documentation in the installed 1.5.0 release: templates expand into agent prompts; they do not themselves implement local navigation.
- Pi extension documentation, Custom Components: `ctx.ui.custom()` supports rendering and keyboard input without sending every key through the model. This is feasibility evidence, not a tested tour implementation.
- Existing `dot_pi/agent/exact_extensions/files.ts:740`: `openWithGoLand` validates the path, resolves its Git root, and launches GoLand with the root and target. It does not pass a line number. Its tests in `files/_goland.test.ts` cover files, directories, non-Git files, missing files, and launcher failure. Do not refactor unrelated file-browser behavior.
- JetBrains documentation: https://www.jetbrains.com/help/go/opening-files-from-command-line.html documents `--line`. A launcher and GoLand installation were found locally. Repeated navigation, window reuse, and keyboard focus were not tested.
- `apm-ecosystems/skills/agent-guided-code-review/SKILL.md`, read from the installed marketplace: prepares a persistent logical map and pins review context, but requires an explicit Next per area. Its multi-reviewer and corroboration workflow is outside this slice.
- Dogpark `docs/index.md`, `docs/page/pages.md`, `docs/pages-experience-design.md`, `docs/page/page-guide.md`, and `src/dogpark/agents/pagebuild.py`: prepare a complete explanation from sources and allow feedback afterward. Borrow the separation between preparation and reading, not its browser, serving, publishing, or styling infrastructure.
- Advisory lookup through Obsidian `Datadog/Learnings.md`: no matching sections for GoLand, walkthrough, JetBrains, or prompt. No advisory guidance was applied. No lookup source was unavailable.

## Facts, assumptions, and evidence limits
| Item | Status | Consequence |
| --- | --- | --- |
| The user wants actual source in GoLand | Confirmed requirement | A standalone page cannot replace IDE navigation. |
| The user controls advancement | Confirmed requirement | No timers or automatic cursor movement. |
| Navigation must avoid model turns | Confirmed requirement | A prompt that asks for Next alone is insufficient. |
| GoLand accepts a source line argument | Documented | Verify it with the real project and repeated navigation. |
| Pi can handle local keyboard input | Documented and present in existing extensions | Exact reader layout and question handoff need planning and testing. |
| A matching local worktree exists for PR #791 | Observed | Reuse only after rechecking HEAD and relevant worktree state. Never reset it. |
| The tour will improve review efficiency | Hypothesis | Collect user feedback; do not invent time targets or claim measured savings. |
| Opening a file means the right IDE window is visible | Not established | Launcher success is not proof of correct visual navigation. |

## First test and source provenance
The selected test is `ddoghq/ddtool#791`, “feat(clusters): add authorize-write-operations command [CMPT-4004]”. At discovery its head was `ca4cc50ec5c4c6219a79bd9d395760c539d5758d`. The existing worktree at `/Users/matteo.ruina/go/src/github.com/DataDog/.worktrees/ddtool/maruina-cmpt-4004` matched that head and had no reported local changes. This is an observed path, not a portable configured default.

The command source and exec credential cache path were inspected, along with the changed-file list and selected test names. The complete PR was not reviewed. Its body links an older head and lists a concurrency issue while the current diff adds authorization-lock code and tests. That difference is evidence to inspect further, not a correctness verdict. Generated explanations must use the pinned source and mark author claims as claims.

The first tour should connect command registration and invocation, scope and target resolution, authorization orchestration, session persistence, credential consumption, and selected tests as needed to explain one path. These are candidate topics, not a fixed stop count or a completed call graph. Follow semantic definitions and references during preparation before asserting cross-file relationships. The actual stop list must come from reading the pinned implementation and tests.

Do not execute the authorization command, contact live infrastructure, request a security-key touch, read credential caches, or run repository tests merely to demonstrate navigation. The trial tests the tour experience, not the PR's hardware or cluster behavior.

## Smallest user-feedback slice
Do first: Prepare one bounded tour for the selected PR and navigate it in Pi beside GoLand.

What the user sees: A short introduction, a list of logical stops, the explanation for the selected stop, and the matching source location in GoLand. The explanation identifies the focal lines without replacing surrounding source with a copied excerpt.

What we learn: Whether logical sequencing is useful, whether explanation size is appropriate, and whether local navigation and question handoff are comfortable.

Why no smaller slice gives that feedback: A single launcher invocation proves only that a file can open. Several connected stops and at least one question/return cycle are needed to test the reading workflow.

Deliberately defer: Full diff coverage, generated approval findings, browser presentation, publishing, automated playback, range highlighting, base-side/deleted-file navigation, cross-platform support, automatic updates when the PR changes, and persisted progress across separate Pi sessions. Revisit each only when the first trial shows a concrete need. Clearly list omitted areas; a short tour is not a completed PR review.

## Design overview
### Preparation and reading are separate
Preparation reads the pinned PR source, traces the relevant behavior, and produces a local tour artifact with provenance and ordered stops. Reading consumes the prepared artifact without re-querying the model at each stop. It must not start navigation while explanations are still being generated.

Each stop needs a stable identifier, title, explanation, repository-relative source path, and positive one-based focal line. The tour needs repository identity, PR URL, pinned head, and enough local checkout context to resolve its paths. The exact file format, command names, storage location, and numeric resource limits remain for `/plan`; choose one simple bounded format, not a generic workflow framework.

### Reader behavior
The user can move forward, backward, or select a stop directly. A change of stop updates the terminal explanation and requests source navigation. No selection is evidence that the user understood the code. The user may explore manually in GoLand; the reader never pulls the IDE back on a timer.

Questions use the normal Pi conversation with the tour and selected stop as context. Returning to the reader retains the selected stop within that session. Whether this uses an explicit exit/resume action or a dedicated question action is a planning detail; do not assume a modal custom UI permits normal chat simultaneously.

### IDE boundary
Reuse the existing GoLand launch convention where safe, without changing unrelated file-browser behavior. Pass the project root and target file as distinct arguments. Verify argument order and line handling against the installed launcher. Do not interpolate source paths into a shell command string.

Test whether repeated navigation reuses the intended project window. Record whether focus stays in the terminal or moves to GoLand. The implementation must not silently add Accessibility permissions, AppleScript window management, an IDE plugin, or a new server to repair focus. If the native launcher is too disruptive, stop for user feedback before widening the design.

### Source consistency
Verify checkout identity, pinned HEAD, and relevant source state before navigation. Reject mismatched source rather than silently show current-main lines. Recheck relevant files when local edits could move anchors. Do not reset, stash, clean, or switch the user's worktree. A PR moving remotely does not update an already pinned tour; show the reviewed head and require explicit regeneration to change it. No background GitHub polling is needed.

## Alternatives and accepted costs
| Approach | Merit and coverage | Safety and validation | Delivery and cost | Disposition |
| --- | --- | --- | --- | --- |
| Existing `/files` plus conversational explanations | Reuses current behavior and exposes surrounding code | Existing launcher tests; no line-level prepared tour | Lowest code cost, but repeated model turns and manual coordination | Does not meet confirmed navigation requirement; retain for ad hoc exploration. |
| Prompt-only guided review | Logical map, contextual questions, and reusable preparation instructions | Can pin source and report gaps | Fast to author, but prompt expansion alone cannot supply zero-model local navigation | Useful preparation candidate; rejected as the whole solution. |
| Dogpark-style standalone explainer | Self-paced reading, diagrams, and later revisions | Can preserve provenance without IDE control | Existing prior art, but adds browser presentation and source duplication | Deferred because actual GoLand source is required; revisit if sharing explanations becomes a goal. |
| Prepared tour plus a small Pi-local reader | Meets logical ordering, actual source, local navigation, and questions | Needs validation of anchors, input handling, launcher failure, focus, and resume behavior | Small local runtime addition; some maintenance compared with a prompt | Selected behavior. A prompt plus extension is a plausible implementation, not yet an approved package design. |
| GoLand plugin or remote-control service | Could provide selection highlighting and tighter IDE state | Larger permission, API, and lifecycle surface | Highest implementation and maintenance cost | Deferred unless native navigation fails an essential user requirement. |

Accepted downside: A prepared explanation can be wrong or omit important code, and it does not adapt until the user asks. Show evidence and omissions, permit questions, and avoid presenting the walkthrough as a review verdict. Selected local navigation adds runtime code that a prompt alone would not need; planning must keep that code limited to reading and navigation.

## Security and data handling
Treat PR metadata, comments, repository files, and the generated tour as untrusted data, not authorization to execute commands. Read source for explanations; do not run code named in it. Keep private source-derived tour content local, outside the reviewed repository and tracked dotfiles, and do not publish or commit it by default.

Validate the tour before launching anything: bounded input and stop counts, required fields, valid focal lines, and readable regular files confined to the intended checkout. Resolve path traversal and symlink escapes; a stop must not open arbitrary sensitive files. Treat filenames, labels, and explanation text as terminal data rather than escape sequences or shell syntax. Define exact bounds during planning.

A launcher failure must be visible, with the stop and path retained so the user can retry or open it manually. The reader must not claim that GoLand displayed the correct line based only on process exit status.

## Operability and ownership
This is a personal, explicit-action tool maintained with the user's Pi configuration. No network daemon, polling loop, telemetry pipeline, new credentials, dashboards, or alerts are required. Errors appear in the terminal. Show current stop, source path, and reviewed head so errors can be diagnosed without collecting private source. Bound pending launcher work; rapid navigation must not create an unbounded queue or leave launches running after exit.

## Testing strategy
- Unit-test artifact validation, source confinement, invalid and out-of-range lines, missing files, revision mismatch, relevant local edits, and terminal control characters.
- Test forward/back/direct selection and first/last boundaries without model calls. Verify selection survives leaving for a question and returning.
- Mock launcher invocation to verify project, filename, and line arguments, including spaces and special characters. Test launcher failure and cleanup/cancellation behavior.
- Use the repository's focused extension tests and full required Pi tests when runtime code changes. Do not add runtime dependencies solely for this reader.
- Manually test the real GoLand launcher on the pinned PR worktree: multiple stops, same-file and cross-file navigation, manual surrounding-code exploration, and a question/return cycle.
- Ask Matteo to assess sequence, explanation size, focus disruption, and whether navigation adds unacceptable effort. Record actual observations; do not claim this trial happened during brainstorming.

## Rollout and rollback
First validate the launcher interaction before building a full reader. Then test one opt-in tour for PR #791. Expose nothing automatically and do not replace existing review commands. If the interaction is unsuitable, keep the prepared explanation as useful research and stop; do not expand into a plugin without approval.

Future runtime changes follow chezmoi's explicit-target diff/apply workflow after verification. Rollback removes or disables only the added reader/prompt and leaves repositories, existing worktrees, and GoLand configuration unchanged. A design document alone requires no runtime apply.

## Open questions and branch states
| Branch | State | Next evidence or trigger |
| --- | --- | --- |
| Audience, pain, logical ordering, IDE requirement, pacing | Accepted | User confirmed the proposed first slice. |
| First PR | Accepted | User selected ddtool #791. |
| Native line navigation | Blocked on live evidence | Validate real project/window/line behavior in the trial. |
| Packaging, artifact format/location, exact input bounds, question UI | Deferred to `/plan` | Use documented Pi mechanisms and the smallest implementation meeting confirmed behavior; return to alignment if it requires a plugin, server, permissions, or wider scope. |
| Full approval review and GitHub output | Deferred | Revisit only on a separate user request. |
| Browser-only reader and automatic advancement | Rejected for this slice | Browser does not satisfy the IDE requirement; automatic advancement conflicts with user-controlled reading. |
| Source explanation quality | To validate | Inspect pinned code and tests, state omissions, then collect user feedback. |

## Skeptical review
No claim of working IDE synchronization, measured time savings, or complete PR coverage is made. The smallest trial must expose focus/window problems before substantial implementation. A modal reader cannot be assumed to support simultaneous chat; selection-preserving exit/resume is a valid first implementation. Do not import the review skill's agent fan-out or Dogpark's page infrastructure. A current PR body is not proof of current behavior.

Material rejected expansion: copying Dogpark's serving, publishing, and visual checking would make a richer explainer, but would not establish the required source navigation. A GoLand plugin could improve IDE control, but its maintenance and permission surface are not justified before testing the native launcher.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
| --- | --- | --- | --- |
| `skill-loader` | `prompt-required` | Brainstorm lifecycle | Selected relevant research, writing, and worktree guidance. |
| `learning-opportunities` | `prompt-required` | Coaching rules | Asked about desired source view and pacing before recommending an interaction. |
| `learning-lookup` | `prompt-required` | Advisory design lookup | Searched narrow terms; recorded that no sections matched. |
| `obsidian-cli` | `agent-selected` | Required access path for advisory lookup | Read the learning store through the supported CLI. |
| `write` | `skill-loader` | User-facing prose and design | Kept facts, limits, decisions, and unresolved evidence distinct. |
| `codebase-research` | `skill-loader` | Unfamiliar Pi and Dogpark mechanisms | Inspected current launcher code/tests, prior-art docs and implementation, and selected PR source. |
| `feature-worktree` | `prompt-required` | Durable design artifact | Created a dedicated branch from fetched main without moving the base checkout. |
| `chezmoi` | `skill-loader` | Design in the managed source repository | Kept changes in the feature source tree; made no target or runtime changes. |
