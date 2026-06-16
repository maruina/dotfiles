---
description: Capture a durable learning from completed work into the Obsidian Compound vault
argument-hint: "[PR url/number | path to plan.md | freeform context]"
---
# Compound a Learning
Source:

> $ARGUMENTS

Close the loop on completed work by capturing one durable, non-obvious learning so future `/brainstorm` and `/plan` runs are faster.

Lifecycle: `/brainstorm` creates a committed design spec, `/plan` creates a committed implementation plan, `/systematic-review` validates code or plans, `/execute` implements verified changes, and `/compound` captures durable learning after the work lands.

<HARD-GATE>
Do not change repository code, branches, or files. The only write is one note in the Obsidian vault under `Datadog/Compound/`. If there is no durable, non-obvious learning, report that and stop without writing.
</HARD-GATE>

Load the `obsidian-cli` skill for vault commands and the `obsidian-markdown` skill for note syntax before reading or writing the vault. Obsidian must be running for the CLI.

## Posture
Capture knowledge, not a changelog. A learning is worth saving only when it would change how a future investigation or design goes: a non-obvious root cause, a dead end worth avoiding, a convention with real rationale, or a trap that cost time.

The highest-value content is what is *absent* from the merged diff: the approaches that did not work, the misleading symptom, the assumption that was wrong. Prioritize that.

## When NOT to compound
Stop and report "no durable learning" for routine config bumps, dependency upgrades, mechanical refactors, or fixes whose cause and remedy are obvious from the diff. Do not pad the vault.

## Workflow
1. Resolve the source from `$ARGUMENTS`:
   - PR url or number: use `gh pr view <pr> --json title,body,url,mergeCommit,closingIssuesReferences` and `gh pr diff <pr>` to read the change, description, and linked tickets. Read review comments with `gh pr view <pr> --comments` when they explain trade-offs or dead ends.
   - Path to a `plan.md` or `design.md`: read it for what the work set out to do, plus its sibling docs.
   - Empty: use the current branch, recent merged PR (`gh pr view --json title,body,url,state,mergedAt`), recent commits, and this session's history.
2. Determine the repo slug as `owner/name` from the git remote (e.g. `maruina/dotfiles`). If there is no repo context, ask before writing.
3. Decide the track:
   - `bug` — an incident, failure, or defect that was diagnosed and fixed.
   - `knowledge` — a durable convention, technique, or rationale worth reusing.
4. Apply the "When NOT to compound" gate. If nothing durable remains, stop and report.
5. Check for overlap before writing (see Deduplication). Update an existing note in place rather than creating a near-duplicate.
6. Write or update exactly one note (see Note Format) at `~/Documents/main/Datadog/Compound/<slug>.md`. The running vault indexes file changes automatically.
7. Report the vault path and a one-line summary of the learning.

## Deduplication
Search the Compound folder before writing:

```fish
obsidian search:context query="<repo-or-topic-keywords>" path="Datadog/Compound" format=json
```

If a strongly overlapping note exists, read it with `obsidian read path="Datadog/Compound/<file>.md"`, then update it in place: refine the content, add the new `source`, and bump `date`. Do not create a second note for the same learning. Prefer updating over appending noise. When a new note is closely related but distinct, link the related note with an Obsidian wikilink (`[[repo-basename-topic]]`) instead of duplicating its content.

## Note Format
Filename: `~/Documents/main/Datadog/Compound/<repo-basename>-<kebab-topic>.md` (e.g. `dotfiles-chezmoi-fish-path.md`). The repo prefix groups notes visually by repository; the `repo` frontmatter field remains the source of truth for filtering.

Frontmatter (Obsidian properties):

```markdown
---
repo: owner/name
type: bug            # or: knowledge
tags: [topic, topic]
date: YYYY-MM-DD
source: <PR url, plan path, or short context>
---
```

Body for `type: bug`:

```markdown
# <short title of the learning>

## Symptoms
## Root cause
## What didn't work
## Working solution
## Prevention
```

Body for `type: knowledge`:

```markdown
# <short title of the learning>

## Context
## Guidance
## Rationale
## When to apply
```

Rules:
- Use US English. Keep each section terse and concrete.
- Use Obsidian Flavored Markdown: `[[wikilinks]]` for related Compound notes, standard `[text](url)` links for external URLs.
- Preserve links: PRs, Jira tickets, Confluence pages, dashboards, Slack threads.
- Use code or command snippets where they remove ambiguity.
- Do not fabricate links, tickets, or outcomes.
- Tags are technique-level (`kubernetes`, `terraform`, `chezmoi`), not repo names; the repo lives in `repo`.

## Handoff
After writing, report the absolute vault path and the one-line learning. If you stopped without writing, say why.
