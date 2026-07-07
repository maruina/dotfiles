---
description: Review a GitHub PR by building system understanding first, then producing an evidence-backed review
argument-hint: "<GitHub PR URL> [familiarity: 0-3 or context sentence]"
---
# PR Review
PR request: `$ARGUMENTS`

Review the PR by understanding the system first, then assessing the change. Do not edit files, post GitHub comments, approve, or request changes unless the user explicitly asks.

## Inputs
Parse:
- PR URL: required. Extract `ORG`, `REPO`, and `PR_NUMBER`.
- Familiarity: optional. Accept `0`, `1`, `2`, `3`, or a free-text sentence describing what the user already knows.

If the PR URL is missing, ask for it and stop. If familiarity is missing, choose a concise default for a staff engineer familiar with Datadog platform infrastructure but new to the specific subsystem. Do not block on it.

Familiarity levels:
| Level | Reader profile | Depth |
|---|---|---|
| `0` | New to this stack | Explain underlying technologies, domain terms, and local patterns before using them. |
| `1` | Knows Datadog, new to this service | Explain service architecture, ownership, APIs, and domain concepts. |
| `2` | Knows the service, new to this area | Focus on the changed area, control flow, and non-obvious integration points. |
| `3` | Expert | Be concise: delta, rationale, risks, and tests. |

## Phase 1: Locate repository and establish workspace
1. Inspect the current repository with `git remote -v` and `git status --short`.
2. If the current repository matches `ORG/REPO`, use it.
3. If not, look for an existing local checkout in likely locations, especially:
   - `~/dd/REPO`
   - `~/go/src/github.com/ORG/REPO`
4. If no checkout exists:
   - If `ORG` is `DataDog`, clone into `~/dd/REPO`: `git clone git@github.com:DataDog/REPO ~/dd/REPO`. Do not ask first.
   - Otherwise, ask the user where to clone before proceeding.
5. For full review, create an isolated worktree from the PR head:
   - path: `~/dd/.worktrees/REPO-pr-PR_NUMBER-review`
   - if a worktree already exists at that path, fetch and reset it to the current PR head before reusing it:
     ```bash
     git -C ~/dd/.worktrees/REPO-pr-PR_NUMBER-review fetch origin
     git -C ~/dd/.worktrees/REPO-pr-PR_NUMBER-review reset --hard origin/<headRefName>
     ```
   - otherwise create it fresh, removing a stale worktree at that path only after confirming it is for the same PR
   - store the path as `WORKTREE`
6. All file reads for the PR code should come from `WORKTREE` when available.

Use Bash syntax for commands executed with the pi `bash` tool. If showing commands for the user to copy, use Fish syntax unless repository conventions require otherwise.

## Phase 2: Gather PR data
Collect:
- PR metadata: title, body, author, state, base/head refs, labels, additions, deletions, changed files.
- Full diff.
- Inline review comments.
- Top-level comments and review bodies.
- Review thread resolution state when available. Prefer GitHub GraphQL `reviewThreads` for resolved/unresolved status. If thread resolution is not available, say `unknown`; do not guess.

Assess the PR description:
- Does it explain why, not just what?
- Does it call out edge cases, limitations, rollout, or test strategy?
- What context is absent that a reviewer needs?

Classify changed files:
- implementation
- tests
- config/build/deployment
- generated code
- docs
- schema/API surface

## Phase 3: Load review guidance
Before reviewing code, load relevant skills when the PR matches their domain:
- Kubernetes CRDs/API types/schema evolution: `k8s-api-design`
- controller-runtime reconcilers, watches, status, finalizers, background runnables: `k8s-controller-dev`
- Go code not covered by a more specific Kubernetes skill: `go-best-practices`
- CLI behavior, flags, prompts, output, errors: `cli-best-practices`
- shell scripts or CI shell snippets: `script-best-practices`
- prose, docs, PR descriptions, or review comments: `write`

For Datadog repositories, follow repository guidance. Use `bzl` for builds/tests; do not use `bazel` directly or language-specific test commands unless the repo explicitly requires it.

## Phase 4: Build system context before judging
Do not start with bug-finding. First build a working model of the system the PR changes.

Discover context from local files first:
- `README.md`, `README`
- `service.datadog.yaml`
- `rapid.json`
- `package.json`
- `BUILD.bazel`
- `AGENTS.md`, `CLAUDE.md`, or repository guidance files
- CODEOWNERS
- nearby sibling files implementing similar patterns
- callers, registrations, interfaces, generated types, tests, and deployment/config files

Use CODEOWNERS/team ownership as a best-effort hint. Do not rely on custom CODEOWNERS parsing as authoritative.

Use LSP tools for semantic inspection when useful:
- `lsp_context` for key Go/TypeScript/YAML/Helm symbols
- `lsp_go_to_definition` to follow entry points, interfaces, and helpers
- `lsp_find_references` to understand impact
- `lsp_diagnostics` when type/schema health matters

If local files do not explain the design and the PR references docs/tickets, use the appropriate MCP or `gh`/Atlassian lookup if available. Prefer local evidence over stale docs.

For each significantly changed file:
1. Read the full file, not only the diff.
2. Read 1-2 neighboring files for pattern context.
3. Identify entry points, data flow, contracts, invariants, and existing tests.

Scope heuristic:
- 10 or fewer changed files: inspect all significant files fully.
- More than 10 changed files: focus on entry points, public API/schema changes, new interfaces, control-flow changes, tests, and deployment/config. Explicitly state what was skipped and why.

## Phase 5: Determine logical order
Do not explain files in diff order or alphabetical order. Find the entry point and explain outward.

Examples:
- route or command registration → handler → service/client → helpers/types → tests/config
- reconciler setup → watches/predicates → reconcile path → status/finalizers → tests
- public API/schema → conversion/validation → callers → persistence/deployment
- config change → code that consumes it → operational effect

When the call path crosses a package, service, or ownership boundary, say so explicitly.

## Phase 6: Build the narrative
Write the narrative as a concise literate-programming walkthrough: enough system context to review the PR, then the change. Prefer connected explanations over disconnected bullets when explaining system behavior.

Start with:
1. Problem statement: what the PR is trying to accomplish and why.
2. Reader profile: the inferred or provided familiarity level.
3. System model: service/component role, entry points, data/control flow, key contracts.
4. Core intuition: the smallest mental model that makes the PR make sense.
5. Solution map: table of changed components and the problem each solves.

For core intuition:
- Explain the essence before the implementation details.
- Use a small toy example with concrete inputs and outputs when it clarifies non-obvious behavior.
- Use a compact diagram when it reduces cognitive load. Prefer Mermaid flowcharts or Markdown tables in normal chat output. Reuse the same diagram shape across the walkthrough when explaining variants.
- Keep comprehension separate from judgment: explain neutrally first, then assess.

For each logical step, include:
1. **How it works today** — existing behavior, abstractions, contracts, and relevant code path.
2. **What changed and why** — the PR delta and the motivation.
3. **Downstream effect** — callers, data flow, timing, compatibility, deployment, operations, or user impact.

Use evidence:
- cite file paths and line ranges where available
- include short code snippets only when needed to explain a non-obvious point
- use before/after snippets for structural changes such as registration lists, config ordering, schemas, or control-flow branches

Callout labels:
- `NOTE:` non-obvious behavior or tricky implementation detail
- `Good pattern:` deliberate positive design choice worth preserving
- `CONCERN:` issue, risk, or open question that may affect review outcome

Rules:
- Explain why for every non-obvious design choice.
- State timing, retries, timeouts, ordering, idempotency, and concurrency constraints where relevant.
- For levels `0` and `1`, include a short glossary only for terms needed to understand the PR.

## Phase 7: Review assessment
After the narrative, assess correctness and review readiness.

Cover:
- Existing discussions: summarize open, resolved, and unknown-status threads. Attribute concerns to authors when relevant.
- Risks and concerns not already covered by existing discussions.
- Missing tests: name the behavior change and the missing assertion or scenario.
- Compatibility and rollout risk: API/schema changes, migrations, feature flags, config rollout, rollback behavior.
- Security/privacy/permissions implications when relevant.
- Observability implications when behavior changes operationally.
- PR description quality.

Do not invent issues. If evidence is insufficient, say what was not verified.

## Phase 8: Optional validation
Run tests or validation only when the expected command is clear and scoped. For Datadog repositories, prefer `bzl test //path:all` or the repository's documented `bzl` target. Do not run broad or expensive commands without explaining why.

If validation is skipped, state why and what command would be appropriate.

## Phase 9: Output format
Produce Markdown in this structure:

```markdown
## Summary
- PR: ORG/REPO#PR_NUMBER — title
- Worktree: WORKTREE or `metadata-only`
- Reader profile: ...
- Verdict: ready as-is | needs discussion | needs changes | not enough evidence

## System context
...

## Core intuition
...

## Solution map
| Component | Files | Purpose |
|---|---|---|

## Walkthrough
### 1. ...
...

## Existing discussions
### Open
- ...
### Resolved
- ...
### Unknown status
- ...

## Review assessment
### Concerns
- ...
### Missing tests
- ...
### PR description
- ...
### Validation
- ...

## Reviewer comprehension checks
- 3-5 short questions a reviewer should be able to answer after reading the review. Focus on behavior, edge cases, invariants, rollout, and tests. Do not make them gotchas.

## Suggested review comment
A concise draft the user can edit before posting. If no comment is needed, say so.
```

Keep the verdict short. Do not post it.

If the user asks for `html` or a shareable artifact, also write an HTML explanation outside the repo at `/tmp/YYYY-MM-DD-pr-review-ORG-REPO-PR_NUMBER.html`. Include CSS and, if using interactive comprehension checks, JavaScript. Use Mermaid diagrams when they reduce cognitive load, rendered from the CDN with `<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"; mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "strict" });</script>`. Put Mermaid source in `<pre class="mermaid">` blocks. Note that the HTML artifact needs network access to render Mermaid diagrams. Do not use ASCII diagrams in HTML output. Use simple HTML diagrams when Mermaid is not needed, and use `<pre>` tags for code blocks.

## Phase 10: Follow-up
End by saying that follow-up questions should refer to `WORKTREE` when available. Use that worktree for any follow-up reads.
