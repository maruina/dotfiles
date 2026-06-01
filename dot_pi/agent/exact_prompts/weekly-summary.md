---
description: Build a weekly work summary from GitHub, Jira, pi sessions, and optional notes
argument-hint: "[week|date range|notes]"
---

# Weekly Summary

Arguments: $ARGUMENTS

Create a weekly work summary for Matteo Ruina (`@maruina`, `matteo.ruina@datadoghq.com`).

The goal is to produce an Obsidian weekly page named `Week of DD/MM/YYYY`. Matteo will manually edit and publish it to Confluence later.

Use concrete evidence. Do not fabricate links, tickets, PRs, or outcomes.

## Phase 1: Determine the week

If `$ARGUMENTS` contains a date range, use it.

If `$ARGUMENTS` contains `last week`, use the previous Monday-Sunday range.

If `$ARGUMENTS` is empty, assume the previous Monday-Sunday range, because this prompt is usually run on Monday morning.

Print the selected range before gathering data.

## Phase 2: Load existing weekly notes

Before rewriting anything, check whether an Obsidian weekly note already exists for the selected week.

Use the vault path:

```text
Datadog/Snippets/Week of <YYYY-MM-DD>.md
```

where `<YYYY-MM-DD>` is the Monday date for the selected week.

Read the existing note with:

```fish
obsidian read file="Datadog/Snippets/Week of <YYYY-MM-DD>.md" 2>/dev/null | tail -n +3
```

If the note exists, treat its content as an important source. It may contain `/prompt:session-note` output from the week. Preserve useful details, links, open questions, and next steps when drafting the final weekly page.

If the note does not exist, continue and create it in the final phase.

## Phase 3: Gather GitHub PRs

Find PRs authored by `maruina` in the `DataDog` GitHub org:

- merged during the selected week
- opened or updated during the selected week but not merged

Use `gh search prs` or equivalent GitHub CLI commands. Start with queries like:

```fish
gh search prs --owner DataDog --author maruina --merged --merged-at "<YYYY-MM-DD>..<YYYY-MM-DD>" --json repository,number,title,url,state,mergedAt,createdAt,updatedAt
```

```fish
gh search prs --owner DataDog --author maruina --updated "<YYYY-MM-DD>..<YYYY-MM-DD>" --json repository,number,title,url,state,mergedAt,createdAt,updatedAt
```

If the installed `gh` version does not support one of these flags, adapt the query syntax and report the command used.

For each relevant PR, gather:

- repository
- number
- title
- URL
- state
- merged date, if any
- linked Jira keys from title, branch, body, and commits
- short summary from the PR body and changed files when needed

Prefer merged PRs as primary evidence.

## Phase 4: Gather Jira context

For Jira keys found in PRs or user notes:

- fetch title
- status
- assignee
- linked PR references, if available

Use Jira only to enrich and group the summary. Do not transition issues, edit Jira, or add comments.

## Phase 5: Inspect pi sessions for missing work

Search pi session history from the selected week.

Extract candidate items:

- debugging investigations
- design discussions
- code reviews
- operational support
- documents read or written
- PRs, Jira tickets, Slack threads, Confluence links, dashboards

Treat pi-session-only items as candidates. Include them only if useful, and avoid overclaiming impact without external evidence.

## Phase 6: Group and deduplicate

Group work by workstream or project, not by day.

Merge duplicate evidence:

- one Jira ticket with multiple PRs
- one project across several sessions
- follow-up work after review

Prioritize:

1. interesting findings
2. impact
3. completed work
4. in-progress work
5. invisible work such as reviews and support

## Phase 7: Draft the weekly page

Use this structure:

```markdown
# Week of <DD/MM/YYYY>

## Highlights
- **<Interesting finding or shipped outcome>.** <Why it mattered.>

## <Project or Workstream>
- [<JIRA>](https://datadoghq.atlassian.net/browse/<JIRA>) — <task summary>
  - [<repo>#<PR number>](<PR URL>) — <merged/open status>
  - <impact, tradeoff, or important detail>

## Reviews, Support, and Discussions
- <Invisible work with links where available.>

## Learnings
- **<Finding>.** <Why it matters.>

## Next Week
- <Follow-up or open question.>
```

Style rules:

- Lead with interesting findings, not a chronological log.
- Preserve every concrete link.
- Use concise bullets.
- Bold the lead sentence for findings.
- Include impact: what the work unblocked, prevented, clarified, or improved.
- Do not invent outcomes.
- If evidence is weak, phrase conservatively.
- Keep pi-session-only details as drafts or candidate bullets unless the user confirms them.

## Phase 8: Save to Obsidian

Write the final draft to:

```text
~/Documents/main/Datadog/Snippets/Week of <YYYY-MM-DD>.md
```

where `<YYYY-MM-DD>` is the Monday date for the selected week.

If the file already exists, replace it with the polished weekly summary while preserving useful details from the previous content. Do not blindly append a second summary.

After writing, report:

- the Obsidian file path
- whether an existing note was rewritten or a new note was created
- the main evidence sources used, such as merged PRs, updated PRs, Jira tickets, existing notes, and pi sessions

Do not create or update Confluence. Matteo will manually edit and publish the Obsidian note to Confluence.
