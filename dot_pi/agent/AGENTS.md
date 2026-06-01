# Global Instructions

Staff platform engineer focused on cloud infrastructure, API design, and Kubernetes.

## 1. Think Before Coding

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don’t choose silently.
- Call out simpler approaches and tradeoffs.
- Stop and ask when requirements are unclear.

## 2. Simplicity First

Write the minimum code that solves the problem:
- No unrequested features, abstractions, or configurability.
- No speculative handling for impossible scenarios.
- If the solution feels overcomplicated, simplify.

## 3. Surgical Changes

Change only what the task requires:
- Don’t refactor or “clean up” unrelated code.
- Match the repository’s existing style.
- Remove only unused code introduced by your changes.
- If you find unrelated dead code, mention it; don’t delete it.

Every changed line should map to the request.

## 4. Goal-Driven Execution

Define verifiable success criteria and iterate until met:
- Bug fix: reproduce with a test, then make it pass.
- Validation: add invalid-input tests, then make them pass.
- Refactor: ensure tests pass before and after.

For multi-step work, use a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Workstyle

- Branch naming: `maruina/jira-ticket` when a Jira ticket exists; otherwise `maruina/branch-name`.
- Commit messages: follow Conventional Commits.

## Git Worktree

- Start from an updated `main`.
- Keep Datadog repositories under `~/dd`.
- Create Datadog worktrees under `~/dd/.worktrees/<repo-name>-<branch-slug>`.
- Use one worktree per feature branch or PR; keep the base repository checkout on `main`.
- Open the worktree directory itself in JetBrains IDEs such as GoLand.

## Dynamic Context

A hidden `user-context` extension injects current repo, branch, PR, Jira-key, worktree, and recent-file context. Treat it as hints; follow explicit user instructions and repository guidance first.

## Code Style

- Use US English.
- Markdown: no blank lines between frontmatter and body, or between heading and body; one blank line between sections.
- Comments should explain non-obvious behavior, workarounds, or bug-fix context (with ticket links), not restate code.
- Prefer self-describing, modular, testable code.
- Follow existing observability patterns.

## Tool Use

- Use `gh` for GitHub operations.
- Run `terraform fmt` with `OTEL_TRACES_EXPORTER=`.
- When showing shell commands intended for copy/paste or shell history, prefer single-line commands over backslash-continued multi-line snippets unless readability requires multiple lines.

## Obsidian

- Vault: `~/Documents/main`.
- Weekly snippets: `Datadog/Snippets/Week of <YYYY-MM-DD>.md` (Monday date).
- Use `obsidian-cli`.
- Preserve wikilinks, embeds, Excalidraw references, `.base`, and `.canvas` files.
- Create new notes in the vault root unless a subdirectory is clearly better.
- Do not modify `.obsidian/` unless asked.
