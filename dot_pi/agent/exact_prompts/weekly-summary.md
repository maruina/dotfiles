---
description: Build a weekly work summary from GitHub, Jira, pi sessions, and optional notes
argument-hint: "[week|date range|notes]"
---

# Weekly Summary

Arguments: $ARGUMENTS

Create a weekly work summary for Matteo Ruina (`@maruina` in `DataDog/*`, `@matteo-ruina_ddog` in `ddoghq/*`, `matteo.ruina@datadoghq.com`).

Load the `obsidian-cli` and `write` skills before drafting and writing the note.

The goal is to produce an Obsidian weekly page at `Datadog/Snippets/Week of <YYYY-MM-DD>.md`, where `<YYYY-MM-DD>` is the Monday date. Matteo will manually edit and publish it to Confluence later.

Use concrete evidence. Do not fabricate links, tickets, PRs, or outcomes.

## Phase 1–3: Collect deterministic evidence

Run the collector script once to resolve the week range, read any existing Obsidian weekly note, query merged and updated PRs across `DataDog/*` (`maruina`) and `ddoghq/*` (`matteo-ruina_ddog`) via `gh`, extract Jira keys, and scan Pi sessions for that week:

```bash
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/weekly-evidence.mjs"
```

Pass `--from YYYY-MM-DD --to YYYY-MM-DD` when `$ARGUMENTS` specifies an explicit date range. Print the selected range, report any collection errors in `github.errors`, and explicitly warn if `github.truncated` or `piSessions.truncated` is true so incomplete evidence is never presented as complete.

If `obsidianNote.exists` is true, preserve useful details, links, open questions, and next steps from `obsidianNote.content` when drafting the final weekly page.

Prefer merged PRs as primary evidence. For key PRs lacking detail or Jira keys in title/body, inspect PR branch/commits/body when needed. Treat Pi-session-only items from `piSessions.sessions` as candidates; include them only if useful, and avoid overclaiming impact without external evidence.

## Phase 4: Gather Jira context

For Jira keys in `jiraKeys` (or user notes):

- fetch title
- status
- assignee
- linked PR references, if available

Use Jira only to enrich and group the summary. Do not transition issues, edit Jira, or add comments.

## Phase 5: Group and deduplicate

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

## Phase 6: Draft the weekly page

Use this structure:

```markdown
# Week of <YYYY-MM-DD>

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

## Phase 7: Save to Obsidian

Write the final draft via `obsidian-cli` (`obsidian create path="Datadog/Snippets/Week of <YYYY-MM-DD>.md" content="..." overwrite`) where `<YYYY-MM-DD>` is the Monday date for the selected week.

If the note already exists, replace it with the polished weekly summary while preserving useful details from the previous content. Do not blindly append a second summary.

After writing, report:

- the Obsidian file path
- whether an existing note was rewritten or a new note was created
- the main evidence sources used, such as merged and updated PRs from `DataDog/*` and `ddoghq/*`, Jira tickets, existing notes, and pi sessions

Do not create or update Confluence. Matteo will manually edit and publish the Obsidian note to Confluence.
