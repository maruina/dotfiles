# Global Agent Guidance

## Working Principles
Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; do not choose silently.
- Call out simpler approaches and tradeoffs.
- Stop and ask when requirements are unclear.

Write the minimum code that solves the problem:
- Prefer simple, explicit code over clever or compressed code.
- Choose names, package boundaries, and APIs that make the common path obvious.
- Do not add unrequested features, abstractions, configurability, or speculative handling.
- If the solution feels overcomplicated, simplify it before extending it.

## Engineering Quality
For behavior-bearing technical work, optimize in this order: safety and correctness, performance, then developer experience.

- Safety: keep control flow explicit, bound resource growth, validate inputs, make failure modes observable, and test invalid cases.
- Performance: consider scale and resource costs during design, not only after profiling. Watch for unbounded fan-out, retries, queues, polling, allocations, and N+1 behavior.
- Developer experience: prefer clear domain names, include units in names when useful, keep scopes small, and avoid clever abstractions or new dependencies unless they simplify the whole system.
- Prefer APIs that make invalid states and misuse difficult to express. Design away expected misuse and invalid calls when a simple API can do so; keep operational failures observable.
- Keep ownership, lifetime, and cancellation explicit for resources and concurrent work.
- Apply these principles idiomatically for the language and repository; do not override established Go, Kubernetes, Terraform, or repository-specific best practices.

## Workflow
- For multi-step work, state a brief plan with verifiable checks.
- For non-trivial feature work, use `/brainstorm` → `/plan` → `/systematic-review` → `/execute` → `/verify`. Start at `/plan` when problem framing and design are already agreed.
- Use `/simplify` only when requested, after `/execute` and before `/verify`; use `/learn` after work lands when evidence supports durable guidance.
- `/execute` produces the implementation candidate and its evidence. `/verify` is the final independent read-only gate. Do not claim final verification until it returns `VERIFIED`; rerun it after a candidate change. Prompt files are the source of truth for their lifecycle contracts.

## Workstyle
- Branches: `maruina/jira-ticket` when a Jira ticket exists; otherwise `maruina/branch-name`.
- Commit messages follow Conventional Commits.
- Start from an updated `main`. Keep one worktree per feature branch and leave the base checkout on `main`.
- Keep Datadog repositories under `~/dd`; create their worktrees under `~/dd/.worktrees/<repo-name>-<branch-slug>` and open the worktree itself in JetBrains IDEs.
- A hidden `user-context` extension provides repository context. Treat it as a hint; explicit user instructions and repository guidance take precedence.

## Pi Source Layout
- `exact_prompts/*.md` defines global slash commands. Keep lifecycle behavior in those prompts.
- `exact_extensions/*.ts` files are auto-discovered and must export a default factory. Put helpers and tests under `_shared/` or an extension subdirectory.
- Runtime dependencies belong in `~/.pi/agent/node_modules`. Source-worktree dependencies under `dot_pi/agent/node_modules` are disposable and must not be committed or rendered.
- Before `/verify` of changes under `dot_pi/agent/`, run `npm ci --ignore-scripts` in that directory. Keep dependencies until `npm test` and `npm run test:all` complete, then remove them.

## Tooling
- Use `gh` for GitHub operations. Before GitHub operations, check `gh auth status` and select `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`; use `maruina` for all other repositories, including `DataDog/*`.
- Run `terraform fmt` with `OTEL_TRACES_EXPORTER=`.

## Writing
- Use US English.
- In Markdown, use no blank line after frontmatter or headings and one blank line between sections.
- Comments explain non-obvious behavior, workarounds, or bug-fix context; they do not restate code.

## Obsidian
- Vault: `~/Documents/main`.
- Weekly snippets: `Datadog/Snippets/Week of <YYYY-MM-DD>.md` using the Monday date.
- Use `obsidian-cli`. Preserve wikilinks, embeds, Excalidraw references, `.base`, and `.canvas` files. Do not modify `.obsidian/` unless asked.
