# Global Instructions

Staff platform engineering. Cloud infrastructure, API design, Kubernetes contributor.

## Workflow

- Plan before editing any non-trivial task.
- Touch only necessary files. Make minimal, correct changes.
- Find root causes. Avoid temporary fixes unless explicitly labeled and approved.
- Prove changes work before marking a task complete — with tests, logs, command output, or a diff.
- For non-trivial changes, pause and ask whether a more elegant solution exists.
- Match the repository's workflow, build system, and style.
- Branch names: use `maruina/jira-ticket` when a Jira ticket exists, otherwise `maruina/branch-name`.
- Commit messages: use Conventional Commits.

## Git Worktree
- Use git worktree from updated main branch to make changes.
- Always create worktrees inside `~/go/src/github.com/DataDog/.worktrees/<name>` (e.g. `git worktree add ~/go/src/github.com/DataDog/.worktrees/<name> -b <branch>`).

## Code Style

- US English spelling.
- Markdown: no blank lines between frontmatter and content, or between headings and body. One blank line between sections.
- Comments must not restate code. Use them to explain non-obvious behavior, workarounds, or bug-fix context with ticket links.
- Write self-describing, modular, testable code.
- Follow the repository's existing observability patterns.

## Tool Use

- Use `gh` for all GitHub operations.
- `terraform fmt` requires `OTEL_TRACES_EXPORTER=` on this machine.

### AI Gateway
List available models on the staging AI gateway:
```fish
set TOKEN (ddtool auth token rapid-ai-platform --datacenter us1.staging.dog)
curl -sS 'https://ai-gateway.us1.staging.dog/v1/models' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'source: aip-dev' \
  -H 'org-id: 2' | jq -r '.data[].id'
```
Model IDs are prefixed by provider: `openai/`, `anthropic/`, `google/`, `gemini/`, `bedrock/`, `bedrock-anthropic/`, `datadoginternal/`. Use the full ID (e.g. `openai/gpt-5.5`) when referencing models.

- "Internal docs" means Datadog internal documentation.
- Use `bzl` for builds and tests, not `bazel` directly.
- Prefer `:all` targets: e.g. `bzl test //path/to/package:all`.
- Use Atlassian MCP for Jira and Confluence context.
- Use Datadog MCP for logs, metrics, traces, CI, incidents, and dashboards.
- AWS CLI: pass `--profile exec-sso-<account-name>-compute-admin`. Look up unknown account names from the account ID in `~/.aws/config`.

## Obsidian

- Vault: `~/Documents/main`.
- Weekly snippets: `Datadog/Snippets/Week of <YYYY-MM-DD>.md` (Monday date).
- Use `obsidian-cli` for interacting with Obsidian.
- Preserve wikilinks, embeds, Excalidraw references, `.base` and `.canvas` files.
- New notes go to the vault root unless they clearly belong in an existing subdirectory.
- Do not modify `.obsidian/` unless asked.
