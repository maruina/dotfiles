---
description: Derive evidence-backed behavioral learnings from Pi sessions and pull requests
argument-hint: "[context]"
---
# Learn
Context:

> $ARGUMENTS

Find compact, evidence-backed guidance that would improve a future `/brainstorm` or `/plan` decision. This is not a work log, daily digest, fact collection, or automatic write workflow.

<HARD-GATE>
Do not modify repository files, Git state, branches, or managed targets. Do not mutate the Obsidian vault until the user explicitly approves one exact complete preview. Before approval, the only permitted writes are mode 0600 temporary snapshots and a mode 0600 staged final document outside the repository and vault. After approval, mutate only the exact approved `Datadog/Learnings.md` rewrite and the approved legacy deletion, then verify or compensate both paths.
</HARD-GATE>

Load the `obsidian-cli` and `obsidian-markdown` skills before vault operations. Do not use another model or external service to analyze session or vault content.

## Modes
- **Daily mode:** With no context, select the previous local calendar day. Discover evidence from every retained Pi session branch with entries in that window and from pull requests authored by `maruina` or `matteo-ruina_ddog` merged in that same window.
- **Contextual mode:** With context, analyze the current conversation plus supplied pull request URL/number, review or conversation-comment URL, design/plan path, described wrong turn, or free-form context. A referenced pull request may be open in contextual mode.

Use this helper path in the source worktree: `dot_pi/agent/exact_scripts/learn-evidence.mjs`. In rendered use, resolve `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs`. Run its `--help` before relying on an unfamiliar invocation. Its stdout is versioned JSON; keep it local and do not paste broad raw session output into the conversation.

## Source precedence and privacy
Apply evidence in this order:

1. Current source code, tests, and tool behavior.
2. Current authoritative repository or product documentation.
3. Accepted pull-request review tied to the final result.
4. Adjudicated retained session history.
5. Existing `Datadog/Learnings.md` guidance.

Do not copy access tokens, credentials, secrets, assistant thinking, image data, raw private-message dumps, unrelated conversation content, or tool-call arguments into helper output, previews, staged documents, or the learning store. A source link may be omitted when it would cross an access boundary; local session paths and entry IDs are private evidence references.

## Daily evidence discovery
1. Run `sessions-window` for the previous local date. Report its local timezone, inclusive `startIso`, exclusive `endIso`, source totals, file errors, and truncation. A malformed or inaccessible session makes the retained set incomplete; continue only with that disclosure and never claim a complete recurrence count.
2. Verify Obsidian availability and read the complete `Datadog/Learnings.md` store before any candidate preview. Treat a missing store as empty only after inspecting the CLI output; a status-0 missing-file message is not file content. If Obsidian or complete-store inspection is unavailable, stop without preview or mutation.
3. Capture the original active GitHub login with `gh auth status --json hosts`. Never use `gh auth status --show-token`.
4. While `maruina` is active, use `gh auth switch --hostname github.com --user maruina` and globally search each author, `maruina` and `matteo-ruina_ddog`, with `--merged --merged-at "$SEARCH_START_DATE..$SEARCH_END_DATE" --limit 1000`. Record each author, account, scope, and a possible 1000-result truncation.
5. Switch only as needed with `gh auth switch --hostname github.com --user matteo-ruina_ddog`, then search author `matteo-ruina_ddog` separately under `ddoghq` and `ddoghq-sandbox` with the same range and limit. Do not use that account for `DataDog` or other repositories.
6. Deduplicate candidate pull requests by URL. Fetch each `mergedAt` and retain only timestamps in `[startIso, endIso)`. A date-only search qualifier is discovery only.
7. For each retained pull request inspect metadata, final diff, commits, reviews, inline `reviewThreads` through GraphQL, and conversation comments. Record unavailable surfaces; unknown thread state is not accepted guidance.
8. Restore and verify the original GitHub login after every normal or error path. If restoration fails, stop before preview or vault mutation, report the current and intended login, and require manual repair.

## Contextual discovery
Interpret supplied context narrowly. Read supplied design or plan artifacts and inspect the current conversation. For a pull request, review, or conversation-comment URL, inspect the containing pull request's metadata, diff, reviews, inline threads, and comments even when the pull request remains open. Route `ddoghq/*` and `ddoghq-sandbox/*` to `matteo-ruina_ddog`; route every other repository, including `DataDog/*`, to `maruina`. Capture and restore the original login exactly as in daily mode. Do not extend contextual discovery into an unbounded daily scan.

## Adjudicate candidates
Candidate discovery only locates evidence. A raw match is not an independent occurrence.

For each narrow candidate, derive identifiers such as error text, file names, APIs, commands, and pattern names. Run `sessions-search` with those terms, then `session-context` only for selected entry IDs. Report retained source/date bounds, result totals, returned counts, and truncation. Group multiple messages from one wrong turn into one occurrence. Exclude injected instructions, `custom_message` content, quotations, quoted user mentions, repeated tool output, model statements that merely mention the topic, and superficially similar events with different causes.

Propose a learning only when it is actionable, broader than one exact diff, likely to improve future `/brainstorm` or `/plan` behavior, and follows at least one qualification path:

1. The same materially equivalent model mistake occurred independently more than once.
2. One model mistake caused a costly wrong turn and current source, tests, documentation, or tool behavior clearly disproves it.
3. A reviewer supplied generalizable guidance, and the final diff plus available reply/resolution evidence shows that it was accepted and materially incorporated.

Reject routine dependency bumps, changelog facts, mechanical edits, obvious documentation, and unsupported model assertions. Review presence alone is not accepted reviewer guidance.

## Build the exact preview
Use `Datadog/Learnings.md` as one global store. Search its complete content for overlapping title, tags, repository metadata, evidence URLs, and body guidance. Update an overlapping section instead of creating a near-duplicate.

Each exact section must use one actionable H2 title, an update date, one code span per distinct source repository, technique-level tags, and approximately three to six bullets:

```markdown
## <actionable title>

`YYYY-MM-DD` · `<source-repository>` · #tag

- **Use when:** <future condition>
- **Do:** <behavioral intervention>
- **Avoid:** <failed approach, when useful>
- **Why:** <mechanism, when useful>
- **Evidence:** <adjudicated evidence and safe source links or local references>
```

Before asking for approval, show every addition and update in final form:

```markdown
### Candidate: <title>

**Why save this:** <future decision improvement>

**Evidence:**
- <adjudicated evidence, bounded and redacted>

**Proposed entry:**
<exact final H2 section>
```

Also adjudicate `Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md` through this same process and PR #22 evidence. Preview its exact deletion in all migration outcomes, including when no replacement qualifies. The deletion is the sole exception to the no-candidate rule.

If no learning qualifies and no legacy migration deletion is pending, report the rejected candidates and why, do not ask for approval, and do not write. Otherwise ask once: approve or reject the complete preview. Treat any response other than clear approval of the complete set as rejection. Rejection or ambiguous approval removes snapshots and changes nothing.

## Apply an approved transaction
1. Before preview, create a mode 0600 temporary directory outside the repository and vault. Snapshot the existence and exact content of `Datadog/Learnings.md` and the legacy note, including missing-file markers, into mode 0600 files.
2. Produce one exact staged final `Learnings.md` document. Do not append individual sections.
3. After one approval, use `obsidian create path="Datadog/Learnings.md" content="..." overwrite` for the staged document and `obsidian delete path="Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md"` only when the approved preview includes deletion. Inspect Obsidian output as well as exit status.
4. Read back both exact paths with `obsidian read` and compare them to the approved staged content and expected existence. A status-0 missing-file message is failure unless absence was expected.
5. If either operation or read-back fails, compensate both paths from the mode 0600 snapshots, verify restoration byte-for-byte/existence-for-existence, report transaction failure, and never claim partial success. If compensation fails, stop and report the path and manual recovery needed.
6. On success, remove all temporary snapshots and staged files. Report the selected range or context, inspected and incomplete sources, original/final GitHub login, rejected and qualifying candidates, approval outcome, transaction result, and final affected vault paths.
