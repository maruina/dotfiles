# `/to-html` local response preview design
## Summary
Add a manual Pi `/to-html` command that renders the latest assistant response as local HTML and opens it in the platform default browser. The command renders Markdown, highlighted code, and local Mermaid diagrams in their original document order.

This replaces `/pr-review`'s optional, review-specific HTML artifact and removes the corresponding `/pr-cleanup` deletion path. The command does not modify the Pi transcript or session.

## Goals
- Render the latest assistant response from the active session branch.
- Render ordinary Markdown even when the response contains no Mermaid fence.
- Render complete Mermaid fences locally and in place among surrounding prose.
- Highlight fenced code blocks.
- Open the generated document with the default browser.
- Use pinned local dependencies. Rendering must not require a CDN, remote scripts, fonts, icons, images, or a running server.
- Keep extension-owned temporary files bounded and clean stale files safely.
- Report concise failures through Pi notifications.

## Non-goals
- Automatic rendering after `agent_settled`.
- A Pi TUI preview, terminal-image support, headless Chrome, screenshots, or browser process management.
- Persistent previews, a response-content cache, a reopen command, or artifact export.
- Rendering raw HTML from an assistant response.
- Changing Mermaid output conventions for source files, documents, Obsidian, Confluence, or explicit source requests.
- Keeping `/pr-review`-specific HTML artifacts or cleanup behavior.

## Context reviewed
- `dot_pi/agent/package.json` and `package-lock.json` — dependencies and test commands.
- `dot_pi/agent/exact_extensions/answer.ts`, `files.ts`, `user-context.ts`, and `user-context.test.mjs` — local TypeScript extension and test patterns.
- `dot_pi/agent/exact_prompts/pr-review.md:238` — current optional CDN-backed HTML artifact.
- `dot_pi/agent/exact_prompts/pr-cleanup.md` — current review-artifact deletion behavior.
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` — assertion of the current review HTML path.
- Pi 0.80.6 extension and TUI documentation — command registration, session state, lifecycle, notifications, dependency resolution, and browser-independent extension behavior.
- Pi 0.80.6 terminal-image source — reviewed for the original approach; no longer used.
- `dot_pi/agent/exact_skills/mermaid-best-practices/SKILL.md` — current Mermaid fence convention.

## Current behavior
`/pr-review` optionally instructs the assistant to write `~/dd/.worktrees/REPO-pr-PR_NUMBER-review.html`, load Mermaid from jsDelivr, and open a shareable HTML artifact. `/pr-cleanup` then removes that HTML file. This creates a separate rendering path, depends on network access for Mermaid, and ties preview cleanup to PR-specific paths.

Pi extensions can register commands and read the active session branch through `ctx.sessionManager`. This provides a deterministic source for the latest assistant response that a prompt or skill alone cannot obtain reliably.

## Design overview
### Command and response selection
Create `dot_pi/agent/exact_extensions/to-html.ts`, a single-file auto-discovered extension entry point that exports the default Pi extension factory.

The extension registers `/to-html`. Its handler:
1. Requires interactive TUI mode. It reports a concise notification in unsupported modes.
2. Reads `ctx.sessionManager.getBranch()` and walks backward to the most recent assistant message.
3. Concatenates only text content blocks from that message. It does not use tool results, thinking content, or another branch.
4. Rejects an empty response and reports a concise notification.
5. Applies a bounded input limit before rendering. The initial limit is 1 MiB of UTF-8 response text and 20 Mermaid fences. A response over either limit is rejected rather than partially rendered.

`/to-html` is intentionally generic: Mermaid is optional. This lets it replace the PR-review artifact even for reviews with no diagram.

### Local rendering pipeline
Use three exact-version runtime dependencies:
- `marked` — Markdown parsing in Node.
- `highlight.js` — server-side code highlighting in Node.
- `mermaid` — browser-side local diagram rendering.

The extension renders Markdown in Node rather than treating response Markdown as browser HTML. Node-side rendering has a smaller browser trust boundary and avoids a browser-side Markdown parser dependency.

The HTML generator must:
- use a `marked` renderer that escapes raw HTML instead of passing it through;
- render ordinary fenced code as escaped, server-side-highlighted HTML;
- render Mermaid fenced code as `<pre class="mermaid">` containing escaped Mermaid source;
- disable Markdown images or render them as inert alt-text/link text so document rendering does not fetch remote assets;
- permit normal links but never automatically load external resources;
- include minimal static CSS in the document;
- inline Mermaid's local browser bundle and initialize it with `securityLevel: "strict"`;
- initialize Mermaid only after the document exists and show each diagram's source/error locally if Mermaid rejects it.

Inlining the local Mermaid bundle makes each preview independent of the extension's `node_modules` path and lets the browser reload the preview while the temporary file exists. The downside is larger HTML files; cleanup bounds control this deliberately.

The command uses no CDN, network fetch, browser automation, or watch server.

### Preview files and cleanup
Store only extension-generated files in `path.join(os.tmpdir(), "pi-to-html")`. Use a generated filename such as `response-<timestamp>-<random>.html` and create the directory with owner-only permissions where the platform supports them.

Before each render, and at `session_start`, clean only files in this directory that match the extension's filename pattern. Retain the newest files while enforcing all limits:
- maximum age: 24 hours;
- maximum file count: 10;
- maximum aggregate size: 50 MiB.

The current output file is created after cleanup, then opened. It remains until a later cleanup pass so browser refresh and restore work. The extension does not delete arbitrary temporary files, does not persist preview metadata, and has no content hash cache.

### Browser opening
Use the platform default opener:
- macOS: `open <file>`;
- Linux: `xdg-open <file>`;
- Windows: the Node-supported shell opener strategy selected during implementation.

Use Pi's process helper or a small Node child-process wrapper with a timeout. If the opener fails, keep the HTML file for inspection and show the command's concise error. Do not launch or manage a browser process directly.

### Prompt changes
Remove the optional HTML/shareable-artifact paragraph from `/pr-review`. The review remains a normal Markdown response. When a user wants browser rendering, the assistant can tell them to run `/to-html` after the response settles.

Remove `HTML` path computation, deletion, and HTML status reporting from `/pr-cleanup`. It continues to clean only the validated review worktree.

Do not change `mermaid-best-practices` in this slice. It already requires fenced Mermaid, which `/to-html` supports. A later, narrowly scoped instruction can mention `/to-html` only if interactive responses consistently need that discoverability; it must not alter document/source output rules.

## Security and data handling
Treat all assistant response content as untrusted, including copied web or repository content.

- Escape raw Markdown HTML.
- Escape Mermaid source before inserting it into the page.
- Use Mermaid strict security mode.
- Do not emit remote script, stylesheet, image, font, or icon URLs.
- Do not include response content in notifications, logs, file names, or command arguments.
- Store preview files only in an owner-scoped temporary directory and remove them according to the bounded cleanup policy.

A user who opens the generated file still gives their local browser access to the local document. The extension's output must therefore be static except for the pinned local Mermaid runtime.

## Failure behavior
- No assistant response or no text content: notify and do not create a file.
- Input exceeds the documented bound: notify and do not create a file.
- Markdown/HTML generation fails: notify and remove the newly created partial file.
- Browser opener fails: notify, retain the generated file, and include its path only when safe to display.
- A Mermaid syntax error affects that diagram's in-document error panel; it does not prevent surrounding prose or other diagrams from rendering.
- Cleanup errors do not prevent a new preview unless the preview directory cannot be created or remains above the hard storage bound.

## Alternatives considered
### Automatic in-TUI PNG preview
**Merit:** Keeps the response and diagram view inside Pi and can open automatically.

**Rejected for this slice:** Requires settled-response coordination, custom TUI lifecycle, inline-image capability handling, headless Chrome, screenshot bounds, and browser cleanup. It is substantially more complex than the manual browser need.

### `/to-html` as a prompt or skill only
**Merit:** Avoids a TypeScript extension and new runtime code.

**Rejected for this slice:** A prompt or skill cannot deterministically read the latest assistant session message. It would depend on the model reconstructing or re-reading content, which is unreliable and may alter the response.

### Retain `/pr-review`'s dedicated HTML artifact
**Merit:** Produces a named PR-specific file that can be shared or archived.

**Rejected for this slice:** Duplicates rendering policy, uses CDN Mermaid, creates PR-specific cleanup coupling, and does not help with ordinary assistant responses.

### Reference Mermaid from `node_modules` with a file URL
**Merit:** Produces smaller generated HTML files.

**Rejected for this slice:** Browser file-module restrictions and package-relative imports make it fragile; previews also depend on a stable local dependency path. Inlining the local browser bundle is more predictable.

### Use a browser-side Markdown renderer
**Merit:** Keeps the document-generation logic entirely in HTML.

**Rejected for this slice:** Adds browser-side parsing and sanitization complexity. Node-side Markdown parsing makes the generated browser document simpler and narrows the execution boundary.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Assistant text tries to execute browser HTML or scripts | Escape raw HTML; render only controlled static markup and strict Mermaid. |
| Mermaid accepts invalid or expensive diagrams | Cap input and diagram count; isolate errors to the individual diagram. |
| Preview files accumulate | Use extension-owned directory, age/count/size limits, and cleanup at startup and invocation. |
| Default opener is unavailable | Detect platform, fail with a concise notification, and retain the generated file. |
| Large inline Mermaid runtime grows each preview | Bound aggregate preview storage; accept this deliberate simplicity instead of fragile module-path imports. |
| Existing prompt tests encode retired behavior | Update lifecycle-prompt assertions with the prompt changes. |

## Testing strategy
### Unit tests
Add focused tests in the existing Node test style for:
- selecting the last assistant text response from branch entries;
- empty/missing response handling;
- raw HTML escaping;
- Markdown/prose/code/Mermaid ordering, including multiple Mermaid fences;
- Mermaid source escaping and strict initialization;
- code highlighting fallback for unknown languages;
- input and diagram-count bounds;
- preview filename/path ownership checks;
- age, count, and aggregate-size cleanup behavior;
- platform opener command selection.

Keep tests browser-free. Test generated HTML as text and inject filesystem/time/opener seams where needed.

### Integration and manual checks
- Run `npm ci --ignore-scripts`, then `npm test` and `npm run test:all` from `dot_pi/agent` before final verification, following repository guidance.
- Render a local response containing prose before/between/after two Mermaid fences, known and unknown code languages, Markdown links, an image, and raw HTML.
- Disconnect network or run with network disabled and verify diagrams still render.
- Verify the browser opens the file, raw HTML does not execute, Mermaid errors remain local to the failing diagram, and cleanup retains only bounded recent previews.
- Confirm `/pr-review` no longer creates review HTML and `/pr-cleanup` only acts on the review worktree.

## Rollout and rollback
The feature is opt-in through `/to-html`; it has no automatic behavior. Reload Pi to activate the extension after applying the chezmoi source change.

Rollback consists of removing the extension and its dependencies, restoring the old prompts only if the dedicated PR artifact is still desired, and deleting `os.tmpdir()/pi-to-html`. Existing preview files expire naturally under the cleanup policy.

## Open questions
None. The exact package versions and final constants remain implementation details, but Mermaid must be an exact pinned runtime dependency and all versions will be lockfile-resolved.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `codebase-research` | agent-selected | The extension, prompts, and tests are an unfamiliar repository area | Guided the source map, current-behavior trace, and evidence-based design. |
| `mermaid-best-practices` | agent-selected | `/to-html` renders Mermaid fences | Preserved the existing fenced-Mermaid convention and avoided changing document/source output behavior. |
| `obsidian-cli` | prompt-required | Brainstorm requires an advisory learning lookup | Read `Datadog/Learnings.md`; applied the relevant initialized-chezmoi-template testing guidance. |
| `write` | agent-selected | Durable design-spec drafting | Kept the spec concrete, concise, and reviewable. |

## Self-review
- **Chosen-direction downside:** Inline Mermaid makes each preview file larger; bounded cleanup is the deliberate tradeoff for browser-reload reliability.
- **Rejected alternatives:** Each alternative has a documented merit and a concrete reason it does not fit this slice.
- **Rejected concern:** Reusing the `/pr-review` HTML instructions was rejected because they rely on a CDN and intentionally create a shareable, PR-specific artifact, unlike `/to-html`.
