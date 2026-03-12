---
description: "Wrap up a session: summary to Obsidian, Jira sync, learnings."
argument-hint: "[notes/context to include in summary]"
model: opus
---

# End of Session

You are closing out a working session. Complete these steps in order.

## Step 1: Gather context

Run these Bash commands in parallel:
1. `git branch --show-current` — get current branch
2. `git log --oneline -20` — recent commits
3. `pwd` — current working directory

Then, using the branch name from (1):
4. `gh pr list --head <branch> --json number,title,url,state,mergedAt` — PRs for this branch

Also read `~/.claude/session-scratchpad.md` if it exists — this contains context saved before compaction.

### User-provided input (optional)

**Input:** $ARGUMENTS

If `$ARGUMENTS` is provided, process it before writing:
- **Free text** — treat as raw content to include in the snippet. The user may paste conversation fragments, notes, or bullet points. Distill into the weekly log format.
- **URLs** (GitHub PRs, Google Docs, Confluence pages, Datadog notebooks/dashboards) — fetch/read them first to extract context. Use `gh pr view` for GitHub PRs, Atlassian MCP for Confluence, `defuddle parse <url> --md` for other web pages. Include the link and a brief summary of what it is.
- **Jira ticket keys** (e.g. CMPT-1234) — fetch the ticket title and status via Atlassian MCP to generate a meaningful bullet.
- **Mix of all the above** — handle each part accordingly.

This is useful when:
- Conversation context has been compacted and git signals alone aren't enough
- Resuming a session and providing what happened since
- Quickly logging work that didn't involve this Claude session (meetings, reviews, reading)

## Step 2: Write session summary to Obsidian

Run `bash ~/.claude/scripts/snippet-path.sh` to get two lines:
1. **Absolute file path** (for Read/Write tools)
2. **Vault-relative path** (for Obsidian CLI commands)

**Check if the file exists first** using `obsidian read file="<vault-relative-path>" 2>/dev/null | tail -n +3`.

- If the file exists (no `Error:` in output) → read current content and **merge** new bullets into existing project headings, or add new headings as needed
- If it does NOT exist → use `obsidian create` with `path="<vault-relative-path>.md"`

### Format

The file is a weekly log that serves two audiences: (1) blog readers who want interesting findings, and (2) future-you doing perf reviews who needs the work trail. Structure accordingly: keep the worklog (tasks, PRs, Jira links) but **lead with the interesting bits** — unexpected learnings, surprising behaviors, counterintuitive findings.

Multiple sessions in the same week contribute to the same file.

```markdown
## <Project Name>
- [CMPT-1234](https://datadoghq.atlassian.net/browse/CMPT-1234) — brief task description
  - [PR #123](url) — status (open/merged)
  - Detail about what was done or why
- **<Interesting finding in bold>**. Explain *why* it's surprising or useful. What assumption did it break?
  - Supporting detail, code snippet, or link
- Another task or finding
  - Sub-detail

## <Another Project>
- ...

## Learnings and Readings
- Link or note about something read/learned

## Open Questions & Next Steps
- Question or concern raised during the session
```

### Style rules

- **H2 = project or workstream** — e.g. "ComputeCLA", "K8s MAZE Authorization", "Release Management Plane". NOT dates.
- **Top-level bullets = tasks, tickets, OR interesting findings** — tasks/tickets anchor the work trail (Jira keys MUST be links). Interesting findings get **bold lead text** to stand out.
- **Lead with the interesting** — within each project section, put surprising findings, broken assumptions, and non-obvious learnings *above* or alongside the mundane work items. Bold the lead sentence. Explain *why* it's surprising or what assumption it challenges.
- **Sub-bullets for details** — what was done, why it matters, PR links, context. Indented under the parent.
- **Capture impact** — for worklog items, add a short clause on *so what*: what it unblocked, who it helped, what metric moved, what failure it prevented. "Fixed duplicate downtime errors" → "Fixed duplicate downtime errors — unblocked cluster decommission." One clause is enough.
- **Invisible work counts** — code reviews, mentoring, design discussions, helping colleagues debug, interviewing, onboarding new hires, process improvements. These fall under the radar at perf review time. Log them even when there's no PR.
- **Preserve all links** — every URL encountered (PRs, docs, dashboards, notebooks, Jira tickets) must appear as a clickable link. Never strip a link to plain text.
- **Code snippets welcome** — if a snippet illustrates an interesting point, include it inline (fenced). Keep it short.
- **Diagrams** — if the session involved architecture decisions, data flows, or complex interactions, add a simple Mermaid or ASCII diagram. Only when it adds clarity.
- **Tone** — curious, concise, technically precise. Work items can be terse. Interesting findings should read like you're telling a colleague something cool over coffee.
- **"Learnings and Readings"** section at the bottom for side reading, articles, notebooks reviewed. Only add if there were any.
- **"Open Questions & Next Steps"** section — add if there are unresolved questions or follow-up work. Omit if everything was cleanly wrapped up.
- **No per-session timestamps**, no outcome headlines.
- **Merging**: if the file already has a heading for the same project, append new bullets under it. Don't duplicate headings.
- Suppress Obsidian CLI stderr: always append `2>/dev/null` and pipe through `tail -n +3` when reading output.
- To update an existing file: read the content, merge in new bullets, then write the full file back using the Write tool on the **absolute path** returned by the script.

## Step 3: Sync Jira ticket (coding sessions only)

Skip this step entirely if the session did NOT involve coding or PRs.

If there IS a PR:
1. Ensure the PR is assigned to the current user: `gh pr edit <number> --add-assignee @me`
2. Extract the Jira ticket ID from the branch name or PR title (pattern: `[A-Z]+-[0-9]+`)
3. If no ticket ID found, ask the user for it. If they say there's no ticket, skip this step.
4. Ensure the Jira ticket is assigned to the current user. Use `lookupJiraAccountId` with the user's email to get their account ID, then `editJiraIssue` to set the assignee. Skip if already assigned.
5. Check the PR state:
   - **PR is open / in review** → transition the Jira ticket to "In Progress" (if not already)
   - **PR is merged** → transition the Jira ticket to "Done" / "Completed"
6. Use the Atlassian MCP tools (`getTransitionsForJiraIssue`, then `transitionJiraIssue`) to make the transition. If the ticket is already in the target status, skip.
7. Check existing comments on the ticket (`getJiraIssue` with comments). Only add a comment linking to the PR if one doesn't already exist for this PR URL — avoid duplicate comments across sessions.

## Step 4: Capture learnings

Review the session and **propose** learnings that might be worth saving. Consider:
- Bash commands or build patterns discovered
- Code style or architecture conventions observed
- Environment quirks or gotchas encountered
- Testing approaches that worked

Present the proposed learnings as a short list and ask: **"Any of these worth saving, or anything else to add?"**

If no → skip. If yes:

1. **Scan for CLAUDE.md files** in the current repo: `find . -name "CLAUDE.md" -o -name ".claude.local.md" -maxdepth 3 2>/dev/null`
2. **Ask the user where the learning should go**, presenting the available options:
   - `~/.claude/CLAUDE.md` — private global instructions (always available, never committed)
   - Repo-root `./CLAUDE.md` — shared with the team (show only if it exists)
   - Subdirectory `CLAUDE.md` — scoped to a project/service (show only if found)
   - `.claude.local.md` — personal, gitignored, repo-scoped (show if it exists, or offer to create)
   - "Create a new `CLAUDE.md`" — if none exists and the learning is repo-specific
3. **Apply** based on their choice:
   - If they pick `~/.claude/CLAUDE.md` → edit it directly
   - If they pick a repo file → run `/claude-md-management:revise-claude-md`
   - Keep additions concise — one line per concept

## Step 5: Revise CLAUDE.md

Run `/claude-md-management:revise-claude-md` to audit and propose improvements to CLAUDE.md files in the current repo based on patterns observed during this session.

## Step 6: Cleanup

Delete `~/.claude/session-scratchpad.md` if it exists — it was consumed.

## Important

- Do NOT fabricate links or URLs. Only include links you have concrete evidence for (from git log, gh output, or tool results).
- If any step fails, report the failure clearly and continue with the remaining steps.
- Be terse. These are recall aids, not documentation.
