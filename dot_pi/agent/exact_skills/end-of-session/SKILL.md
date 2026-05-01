---
name: end-of-session
description: Wrap up a working session. Writes a weekly snippet to Obsidian, syncs the Jira ticket status, and proposes learnings to save to AGENTS.md. Use at the end of any coding or research session.
---

# End of Session

Complete these steps in order.

## Step 1: Gather context

Run in parallel:
1. `git branch --show-current` — current branch
2. `git log --oneline -20` — recent commits
3. `pwd` — working directory

Then using the branch name:
4. `gh pr list --head <branch> --json number,title,url,state,mergedAt`

### User-provided input

If the user provided arguments (appended after this skill), process them:
- **Free text** — distill into the weekly log format
- **URLs** (GitHub PRs, Confluence, Datadog, Google Docs) — fetch content first (`gh pr view` for PRs, Atlassian MCP for Confluence, `defuddle parse <url> --md` for other pages); include link + brief summary
- **Jira keys** (e.g. CMPT-1234) — fetch title and status via Atlassian MCP
- **Mix** — handle each part accordingly

## Step 2: Write session summary to Obsidian

Run `bash ~/.claude/scripts/snippet-path.sh` to get:
1. Absolute file path (for read/write)
2. Vault-relative path (for Obsidian CLI)

Check if the file exists: `obsidian read file="<vault-relative-path>" 2>/dev/null | tail -n +3`

- File exists (no `Error:`) → read current content and **merge** new bullets into existing project headings, or add headings as needed
- File does NOT exist → `obsidian create path="<vault-relative-path>.md"`

### Format

Weekly log for two audiences: (1) blog readers interested in interesting findings, (2) future-you doing perf reviews. Lead with the interesting bits — unexpected learnings, surprising behaviors, broken assumptions.

```markdown
## <Project Name>
- [CMPT-1234](https://datadoghq.atlassian.net/browse/CMPT-1234) — brief task description
  - [PR #123](url) — status (open/merged)
  - Detail about what was done or why
- **<Interesting finding in bold>**. Why is it surprising? What assumption did it break?
  - Supporting detail, code snippet, or link

## Learnings and Readings
- Link or note about something read/learned

## Open Questions & Next Steps
- Question or follow-up work
```

### Style rules

- **H2 = project or workstream** — e.g. "ComputeCLA", "K8s MAZE Authorization". NOT dates.
- **Top-level bullets = tasks, tickets, or interesting findings** — Jira keys MUST be links. Bold the lead sentence of interesting findings.
- **Lead with the interesting** — put surprising findings above mundane work items.
- **Capture impact** — add a short "so what" clause: what it unblocked, what failure it prevented.
- **Invisible work counts** — code reviews, mentoring, design discussions, helping colleagues debug. Log them even without a PR.
- **Preserve all links** — every PR, doc, dashboard, Jira ticket must be a clickable link.
- **Code snippets welcome** — fenced, kept short.
- **No per-session timestamps**, no outcome headlines.
- **Merging**: append new bullets under existing headings; never duplicate headings.
- Suppress Obsidian CLI stderr: append `2>/dev/null`, pipe through `tail -n +3`.
- To update an existing file: read → merge → write the full file back using the absolute path.

## Step 3: Sync Jira ticket (coding sessions only)

Skip if the session did NOT involve coding or PRs.

If there IS a PR:
1. Ensure PR is assigned to current user: `gh pr edit <number> --add-assignee @me`
2. Extract Jira ticket ID from branch name or PR title (pattern: `[A-Z]+-[0-9]+`)
3. If no ticket found, ask the user. If they say there's none, skip this step.
4. Ensure the Jira ticket is assigned to the current user (`lookupJiraAccountId` → `editJiraIssue`). Skip if already assigned.
5. Transition based on PR state:
   - **Open / in review** → "In Progress" (if not already)
   - **Merged** → "Done" / "Completed"
6. Use `getTransitionsForJiraIssue` then `transitionJiraIssue`. Skip if already in target status.
7. Check existing comments (`getJiraIssue` with comments). Only add a PR link comment if one doesn't already exist for this PR URL.

## Step 4: Capture learnings and revise AGENTS.md

Review the session and **propose** learnings worth saving:
- Bash commands or build patterns discovered
- Code style or architecture conventions observed
- Environment quirks or gotchas
- Testing approaches that worked

Present the list and ask: **"Any of these worth saving, or anything else to add?"**

If no → skip to cleanup. If yes:

1. Scan for agent instruction files: `find . -name "AGENTS.md" -maxdepth 3 2>/dev/null`
2. Ask where the learning should go:
   - `~/.pi/agent/AGENTS.md` — private global (always available, never committed)
   - Repo-root `./AGENTS.md` — shared with the team (show only if it exists)
   - Subdirectory `AGENTS.md` — scoped to a project/service (show only if found)
   - "Create a new `AGENTS.md`" — if none exists and the learning is repo-specific
3. Apply based on choice. Keep additions concise — one line per concept.

## Important

- Do NOT fabricate links or URLs. Only include links with concrete evidence (git log, gh output, tool results).
- If any step fails, report clearly and continue with remaining steps.
- Be terse. These are recall aids, not documentation.
