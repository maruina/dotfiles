# Global Instructions
Staff software engineer. Cloud infrastructure, backend systems, API design, platform engineering.

## Behavior

- Terse by default. Brevity in context windows, communication, and artifacts (commits, PRs).
- Treat my proposals as hypotheses. Surface hidden assumptions, trade-offs, failure modes. Propose at least one alternative.
- Lead with "why": why something fails, why one approach beats another. Skip praise.
- Present code as narrative: logical execution order, specific evidence (`file_path:line_range`), clear component interactions.
- Do NOT read or edit files until the user's full request is clear. If a message seems incomplete, wait.
- When a sub-agent fails, complete the task directly.
- On ambiguous errors, investigate before asking — exhaust diagnostic tools first.
- After ANY correction: capture the lesson in auto-memory so it doesn't recur.
- Do not start work the user hasn't requested. If given specific PR feedback to address, implement only what's asked — don't add extra commits, start migrations, or expand scope without explicit approval.

## Core Principles

- **Minimal, correct changes**: Touch only what's necessary. Find root causes — no temporary fixes. Simplest solution that works.

## Code Style

- Fish shell exclusively. Scripts, functions, shell examples — all Fish syntax unless the project dictates otherwise.
- **Markdown style**: No extra blank lines between frontmatter and content, or between headings and body. Single blank line to separate sections only.
- US English spelling. Match surrounding module style.
- Comments should not duplicate the code. Dispel confusion, don't cause it. Valid reasons: explain unidiomatic code, clarify non-obvious behavior, document bug-fix context (with ticket links), explain workarounds. Never restate what the code already says.
- Self-describing code. Modular, testable, clean.
- Follow existing observability patterns (logs/tracing).
- **Mermaid diagrams**: Avoid special characters (parentheses, brackets, quotes) in node labels. Use simple alphanumeric labels and test syntax before committing. GitHub rendering is strict.

## Tools

- **This file is chezmoi-managed.** Edit source at `~/.local/share/chezmoi/dot_claude/CLAUDE.md`, apply with `chezmoi apply`. Never edit `~/.claude/` directly.
- `gh` CLI for all GitHub operations.
- Dry-run bulk text replacements on a small sample first. Verify match scope before applying broadly.
- `codex` CLI for code review:
  - `codex review --uncommitted` — staged/unstaged/untracked changes.
  - `codex review --base <branch>` — diff against a base branch.
  - `codex review --commit <sha>` — a specific commit.
  - Accepts a custom `[PROMPT]` for targeted review.
- Never use Bash for operations that have dedicated tools:
  - Use `Grep` to locate relevant sections, then `Read` with `offset`/`limit` for large files.
  - Use `Read` (no offset) for small files instead of `cat`, `head`, or `tail`.
  - Use `Glob` instead of `ls` or `find`.
- Only use Bash for commands that genuinely require shell execution (build, test, install).
- `terraform fmt` requires `OTEL_TRACES_EXPORTER=` (unset) to avoid telemetry init errors on this machine.


## Workflow

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- Before researching the codebase, read any architecture or design docs first (Confluence, Notion, internal wikis). Codebase research fills in the gaps; docs establish the intended design.
- If something goes sideways, STOP and re-plan — don't keep pushing.
- Use subagents liberally: one task per subagent, keep main context clean.
- Never mark a task complete without proving it works (tests, logs, diff).
- For non-trivial changes: pause and ask "is there a more elegant way?" Skip for obvious fixes.
- **Git worktrees**: Always check out the requested branch — never offer to remove the worktree. Confirm the correct branch name before pushing. Never use absolute paths in shared config files (CLAUDE.md, skills). After creating a worktree, fetch and rebase onto origin/main if local HEAD is behind — `git worktree add` branches from local HEAD, not the remote.

## Obsidian

- Personal vault at `~/Documents/main`. Weekly snippets go to `Datadog/Snippets/Week of <YYYY-MM-DD>.md`.
- See `~/Documents/main/CLAUDE.md` for CLI usage, gotchas, and conventions.
- To overwrite an existing file: `obsidian create path="<path>.md" overwrite content="..."`. There is no `write` or `edit` command.

## Repos

- Dotfiles: `~/` (chezmoi source — see project CLAUDE.md)
- Obsidian vault: `~/Documents/main`
- Datadog work: `~/dd/<repo>` — each repo has its own CLAUDE.md

## Datadog

These rules apply only in Datadog repositories (`~/dd/`, `~/go/src/github.com/DataDog/`).

- "Internal docs" = Datadog internal documentation.
- `bzl` for all builds and tests — never `bazel` directly, never language-specific commands (`go test`, `pytest`, `npm test`). Always `:all` target. Example: `bzl test //domains/ai-devx/apps/apis/aidevx-claude-export:all`.
- Atlassian MCP for ticket context.
- `datadog-systems-researcher` for internal system questions (private repos, internal tools, processes). `web-researcher` for external tech research and Datadog public docs.
- GitLab CI logs: query `*:COMMIT_SHA @ci.is_failure:true` on Datadog prod MCP, then iterate. Never fetch from gitlab.com (no access).
- GitHub: `gh` only; never WebFetch repos (no access). PR reviews: `gh pr view --json reviews,comments,reviewDecision,reviewRequests`.
- AWS CLI: always pass `--profile exec-sso-<account-name>-compute-admin`. If the account name is unknown, look it up from the account ID in `~/.aws/config`.
