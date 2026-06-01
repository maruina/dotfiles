---
description: Capture a short session note for the current weekly Obsidian summary
argument-hint: "[notes|links|context]"
---

# Session Note

Arguments: $ARGUMENTS

Append a short note about the current session to Matteo Ruina's weekly Obsidian note.

This prompt is intentionally lightweight. Do not sync Jira, edit PRs, update Confluence, or modify AGENTS.md.

Use concrete evidence. Do not fabricate links, tickets, PRs, or outcomes.

## Phase 1: Determine the current week

Use the current date to determine the Monday-Sunday week containing today.

The target note is:

```text
~/Documents/main/Datadog/Snippets/Week of <YYYY-MM-DD>.md
```

where `<YYYY-MM-DD>` is the Monday date for the current week.

Use this Obsidian vault path when reading via `obsidian`:

```text
Datadog/Snippets/Week of <YYYY-MM-DD>.md
```

## Phase 2: Gather lightweight context

Gather only enough context to write a useful recall aid:

```fish
pwd
git branch --show-current 2>/dev/null
git log --oneline -5 2>/dev/null
gh pr view --json number,title,url,state,mergedAt 2>/dev/null
```

If `$ARGUMENTS` contains notes, links, Jira keys, PR URLs, or other context, include them. Fetch extra details only when needed to preserve a useful link or avoid ambiguity.

Do not do broad research. `/prompt:weekly-summary` will do the heavier reconstruction later.

## Phase 3: Read the existing weekly note

Read the existing note if present:

```fish
obsidian read file="Datadog/Snippets/Week of <YYYY-MM-DD>.md" 2>/dev/null | tail -n +3
```

If the note does not exist, create it in the final phase.

## Phase 4: Draft the session note

Write 3-5 concise bullets under a `## Session Notes` heading.

Use this style:

```markdown
## Session Notes
- <Project or context> — <what happened, with links where available>
  - Next: <follow-up, if any>
```

Rules:

- Preserve concrete links: PRs, Jira tickets, Confluence pages, dashboards, Slack threads.
- Include invisible work: debugging, reviews, pairing, design discussions, operational support.
- Capture surprising findings or changed assumptions.
- Keep it terse. These are raw notes for the later weekly summary, not the final blog post.
- If the existing note already has `## Session Notes`, append bullets there.
- If the same bullet already exists, do not duplicate it.
- Do not rewrite the whole weekly summary except to add the new bullets.

## Phase 5: Save to Obsidian

Write the updated note to:

```text
~/Documents/main/Datadog/Snippets/Week of <YYYY-MM-DD>.md
```

If the file does not exist, create it with:

```markdown
# Week of <DD/MM/YYYY>

## Session Notes
- ...
```

After writing, report the file path and the bullets added.
