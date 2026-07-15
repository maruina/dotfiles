# Evidence-Backed Learn Command Design
## Summary
Replace `/compound` with an interactive `/learn` command that finds evidence-backed guidance in Pi sessions and Matteo's merged pull requests. Store approved guidance as compact, atomic sections in `Datadog/Learnings.md`, then make `/brainstorm` and `/plan` search relevant sections before committing decisions.

The knowledge store is not a work log or fact collection. Each entry must describe a behavioral intervention that would help a model make a better future decision, explain when to apply it, and cite adjudicated evidence that the intervention is necessary.

## Problem
The current `/compound` command captures one verbose, repository-oriented note after completed work. Its output has three problems:

- The bug and knowledge templates produce more prose than future agents need.
- The repository-prefixed file layout conflates where a learning was discovered with where it applies.
- `/brainstorm` and `/plan` do not search the captured notes, so the knowledge is effectively write-only.

A broader daily summarizer would not solve the underlying problem. It would likely produce a growing list of true but low-value facts. The desired system must identify recurring model failures, costly wrong turns, and accepted review guidance that can change future behavior.

## User and Audience
The primary user is Matteo Ruina. Future Pi sessions are the primary consumer. The workflow spans personal repositories accessed as `maruina` and Datadog repositories accessed as `matteo-ruina_ddog`.

## Goals
- Rename `/compound` to `/learn` without retaining an alias.
- Support daily retrospective and on-demand analysis through one command.
- Inspect all relevant Pi conversation branches, including abandoned branches where wrong turns may appear.
- Inspect Matteo's merged pull requests and their review threads for reusable guidance.
- Require adjudicated evidence and future leverage before proposing a learning.
- Preview all proposed additions and updates, including why each is worth storing, before one human approval gate.
- Store approved learnings as concise, cross-repository sections in one Obsidian file.
- Make `/brainstorm` and `/plan` retrieve relevant learnings during discovery.
- Preserve approved learnings in committed lifecycle artifacts so `/execute` and `/verify` do not depend directly on mutable personal notes.

## Non-Goals
- Scan pull requests authored by other people or pull requests Matteo only reviewed.
- Produce a daily digest, activity report, or changelog.
- Capture every true or interesting fact found during work.
- Write to the vault without explicit confirmation.
- Make every Pi command search the knowledge store.
- Introduce repository, topic, or category folder taxonomies.
- Reproduce Every's full subagent, schema, vocabulary, refresh, and validation framework.
- Guarantee that occurrence counts cover deleted, ephemeral, or otherwise unavailable sessions.

## Context Reviewed
- `dot_pi/agent/exact_prompts/compound.md`
- `dot_pi/agent/exact_prompts/brainstorm.md`
- `dot_pi/agent/exact_prompts/plan.md`
- `dot_pi/agent/exact_prompts/execute.md`
- Lifecycle references in `dot_pi/agent/AGENTS.md` and `dot_pi/agent/exact_prompts/simplify.md`
- Existing Obsidian note `Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md`
- Pi prompt-template, session, and session-file-format documentation
- Local Pi session storage under `~/.pi/agent/sessions/`
- GitHub CLI authentication and pull-request search capabilities
- Every's `ce-compound` skill in `EveryInc/compound-engineering-plugin`

Every's workflow contributes useful constraints: one learning at a time, failed-path capture, overlap detection, source grounding, and bounded initial session discovery. This design keeps those principles but uses a smaller personal knowledge store and a human approval gate.

## Assumptions
- Obsidian is running when `/learn`, `/brainstorm`, or `/plan` needs vault access.
- Pi continues to store sessions as versioned JSON Lines files under `~/.pi/agent/sessions/` with entry timestamps and parent links.
- The previous day means the previous local calendar day on Matteo's machine.
- GitHub CLI remains authenticated for both `maruina` and `matteo-ruina_ddog`.
- The retained session archive is the available evidence set; observed counts are not claims about missing or deleted history.
- The vault is personal and may contain references to private work, but entries must not copy credentials, secrets, or unrelated private conversation content.

## Design Overview
### Invocation modes
`/learn` with no arguments runs the daily retrospective:

1. Select Pi entries whose timestamps fall within the previous local calendar day.
2. Include every branch with activity during that window, including abandoned branches.
3. Load only enough preceding context to understand candidate mistakes or decisions.
4. Find pull requests authored by `maruina` or `matteo-ruina_ddog` and merged during the same window.
5. Inspect pull-request descriptions, diffs, and review threads.

`/learn <context>` analyzes the current conversation plus the supplied context. The context may identify a pull request, design or plan path, or a specific wrong turn. It applies the same evidence, preview, and write rules as daily mode.

### Candidate discovery and adjudication
Candidate discovery and evidence validation are separate stages. The selected day or explicit context produces candidate topics. Each topic then drives a narrow search across all retained Pi session history.

A targeted historical search derives identifiers such as error text, commands, APIs, file names, tool names, and pattern names. It deep-reads only matching sessions. A raw text match does not count as an occurrence. Adjudication must exclude:

- injected instructions and dynamic context;
- quoted notes or documentation;
- repeated tool output;
- model-generated statements that merely mention the topic;
- multiple messages from one wrong turn counted as independent failures;
- superficially similar events with different causes or decisions.

Counts describe independently observed, materially equivalent occurrences in retained history. The preview must state the date range and evidence source when available. It must not imply completeness.

### Qualification gate
A candidate qualifies only when it is actionable, likely to change future `/brainstorm` or `/plan` behavior, and broader than one exact diff. At least one of these evidence paths must apply:

- The same materially equivalent model mistake occurred independently more than once.
- One model mistake caused a costly wrong turn, and source, tests, or tooling clearly disproved the approach.
- A pull-request reviewer supplied generalizable guidance that was accepted and materially improved the change.

A candidate does not qualify when it is only a fact, changelog item, routine correction, obvious documentation, mechanical edit, or unsupported model assertion.

### Interactive preview and write gate
`/learn` presents all qualifying additions and updates in their final form before writing. Each candidate includes:

```markdown
### Candidate: <title>

**Why save this:** <how the evidence shows future model performance should improve>

**Evidence:**
- <adjudicated session occurrences>
- <accepted review, source, test, or documentation evidence>

**Proposed entry:**
<exact section proposed for Learnings.md>
```

The command asks once whether to apply the complete candidate set. Approval writes all shown changes. Rejection leaves the vault unchanged. If no candidate qualifies, the command reports that no useful learning was found and does not ask for approval.

### Knowledge store
Use one file:

```text
Datadog/Learnings.md
```

Each learning is an atomic second-level section:

```markdown
## <actionable title>

`YYYY-MM-DD` · `<source-repo>` · #tag #tag · [source](...)

- **Use when:** <conditions where this guidance changes a decision>
- **Do:** <actionable guidance>
- **Avoid:** <failed or misleading approach, when useful>
- **Why:** <concise mechanism or rationale, when useful>
- **Evidence:** <observed failures or accepted review guidance with sources>
```

Keep entries to approximately three to six bullets. `Use when`, actionable guidance, and `Evidence` are required. `Avoid` and `Why` are optional. Repository metadata records provenance rather than scope.

Before proposing a new section, search the complete file by topic, tags, source, and content. Update an overlapping section with new evidence or refined guidance rather than adding a duplicate.

### Learning consumption
`/brainstorm` and `/plan` are direct consumers because they make decisions before implementation. During discovery, each command:

1. Derives narrow topic, technology, error, and pattern terms from the request and repository context.
2. Searches `Datadog/Learnings.md` globally rather than filtering by the current repository.
3. Loads only relevant sections.
4. Treats learnings as advisory evidence; current code, authoritative documentation, and repository guidance take precedence.
5. Summarizes or cites material guidance in the committed `design.md` or `plan.md`.

`/execute` and `/verify` do not search the vault. They consume relevant learnings through approved, committed lifecycle artifacts. This prevents mutable personal notes from silently changing implementation after design approval.

### Rename and migration
Remove `dot_pi/agent/exact_prompts/compound.md` and add `dot_pi/agent/exact_prompts/learn.md`. Update lifecycle references from `/compound` to `/learn`. Do not retain a compatibility alias.

Evaluate the existing chezmoi Compound note through the same qualification gate. Matteo suspects the model has mishandled chezmoi profile data more than once, but raw keyword matches are not proof. The migration must deep-read matching sessions and review pull request #22 before deciding:

- If adjudicated evidence and future leverage support the note, preview a compact `Learnings.md` section through the normal human gate.
- Otherwise, remove the old note without migrating its content.

Remove the obsolete note and allow the empty `Datadog/Compound/` directory to disappear after adjudication.

## Source Precedence
When evidence conflicts, use this order:

1. Current source code, tests, and tool behavior
2. Current authoritative repository or product documentation
3. Accepted pull-request review tied to the merged result
4. Adjudicated session history
5. Existing `Learnings.md` guidance

A stale learning must be corrected or omitted rather than used to override stronger evidence.

## Alternatives Considered
### Separate note per learning
Separate notes provide first-class Obsidian properties, stable wikilinks, and cheap per-note loading. They were rejected for the first version because they require filename and folder policy before the store has enough content to justify one. A single file provides one global search target and naturally avoids repository-scoped browsing.

### Repository folders
Repository folders make provenance visible and simplify browsing within one codebase. They were rejected because discovery repository and applicability scope are different concepts. A chezmoi learning found in `maruina/dotfiles` may apply anywhere chezmoi is used.

### Automatic writes
Automatic writes reduce friction and better support unattended daily runs. They were rejected because inferred guidance will influence future designs across repositories. One approval gate is a small cost for maintaining trust in the store.

### Search learnings from every lifecycle command
Universal lookup maximizes the chance that a relevant note is seen. It was rejected because it repeats retrieval, consumes context, and allows mutable guidance to affect execution after approval. Capturing relevant guidance in committed design and plan artifacts creates a clearer decision boundary.

### Fixed historical lookback
A fixed window bounds search cost and mirrors Every's default seven-day session scan. It was rejected for evidence validation because recurrence may span longer intervals. Candidate-specific filtering across retained history bounds deep reads without an arbitrary cutoff.

### Adopt Every's full compound workflow
Every's workflow provides strong schemas, parallel analysis, grounding validation, vocabulary capture, and document refresh. It was rejected for the first slice because the desired output is a small personal behavioral knowledge store, not project-local solution documentation. Its complexity would make the workflow harder to operate and review before the core value is proven.

## Risks and Mitigations
### False recurrence counts
Repeated context, quotations, and tool output can inflate keyword counts. Deep-read matching sessions and count independent wrong decisions only. Show evidence references during preview.

### Knowledge-store pollution
A daily command can drift into activity summarization. Enforce the qualification gate, require a performance-oriented “Why save this?” argument, and stop without writing when no candidate qualifies.

### Stale or overgeneralized guidance
A learning may outlive the implementation that justified it. Treat learnings as advisory, preserve sources and evidence, and give current code and authoritative documentation precedence.

### Sensitive session content
Sessions and review threads can contain private data or credentials. Summarize only the reusable guidance, avoid copying unrelated content, and never store secrets or raw conversation dumps.

### Runtime and context cost
Scanning all branches and validating candidates across retained history is slower than summarization. Use the previous day only for candidate discovery, then apply targeted filtering before deep reads. This cost is an explicit tradeoff for a smaller, trusted store.

### Obsidian availability
Vault commands fail when Obsidian is not running. Check availability before analysis that could lead to a write and fail clearly without partial changes.

### GitHub identity and access
The two accounts expose different private repositories. Follow existing account guidance: use `matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`, and `maruina` elsewhere. Report inaccessible sources rather than silently treating them as absent evidence.

## Operability
The workflow runs on demand and has no service, daemon, scheduler, alert, or on-call requirement. Its observable outputs are:

- sources inspected and any inaccessible sources;
- qualifying candidates and their evidence;
- the exact proposed file changes;
- user approval or rejection;
- the final vault path and sections added or updated.

Failure must leave `Datadog/Learnings.md` unchanged. The user can roll back an approved write through normal Obsidian file history or manual editing. Removing `learn.md` and restoring `compound.md` rolls back the command rename.

## Rollout and Rollback
Roll out in one personal dotfiles change:

1. Add `/learn`, update direct consumers, and remove `/compound`.
2. Apply the chezmoi source to the home directory.
3. Confirm Pi discovers `/learn` and no longer discovers `/compound`.
4. Run the evidence-gated migration of the existing note.
5. Exercise one daily run and one contextual run before relying on the store.

Rollback restores the previous prompt files and lifecycle wording. Vault rollback restores the old Compound note or removes newly approved sections.

## Security and Data Handling
- Do not copy access tokens, credentials, secrets, or raw private messages into `Learnings.md`.
- Do not expose private pull-request content beyond the personal vault.
- Preserve source links when safe, but a link is not required when it would expose sensitive context outside its access boundary.
- Treat session paths and identifiers as local evidence references, not portable public links.
- Never send vault content or session history to an additional external service solely for this workflow.

## Testing Strategy
Validation must cover observable prompt behavior rather than only file presence.

### Daily discovery
- Select a known local-day window with multiple Pi sessions.
- Confirm entries are selected by entry timestamp, including a session started earlier.
- Confirm abandoned branches with activity are considered.
- Confirm sessions without activity in the window are excluded from candidate discovery.
- Confirm merged pull-request searches cover both usernames and exclude PRs outside the date window.

### Evidence adjudication
- Use fixtures or known sessions containing a real repeated wrong turn, a quoted mention, repeated tool output, and an unrelated match.
- Confirm only independently adjudicated failures contribute to the evidence count.
- Confirm one accepted, generalizable review suggestion can qualify without recurrence.
- Confirm a routine fact or changelog item produces no candidate.

### Interactive writes
- Confirm candidate previews include “Why save this?”, evidence, and exact final entries.
- Confirm rejection leaves `Datadog/Learnings.md` unchanged.
- Confirm approval adds a new section.
- Confirm overlap updates an existing section instead of duplicating it.
- Confirm no qualifying candidate produces no write prompt and no file change.

### Consumption
- Seed one relevant and one unrelated learning.
- Confirm `/brainstorm` and direct `/plan` retrieve only the relevant section.
- Confirm they record material guidance in their durable artifact.
- Confirm repository evidence overrides a conflicting learning.
- Confirm `/execute` and `/verify` do not gain direct vault lookup behavior.

### Rename and deployment
- Confirm source discovery contains `learn.md` and not `compound.md`.
- Run repository tests required for `dot_pi/agent/` changes.
- Preview rendered changes with `chezmoi diff`.
- Apply the reviewed targets with `chezmoi apply`.
- Confirm runtime Pi prompt discovery exposes `/learn` and not `/compound`.

## Success Criteria
- `/learn` supports daily and contextual modes with the agreed source boundaries.
- It considers all Pi branches active in the selected window.
- Every proposed learning includes adjudicated evidence and a concrete reason it should improve future model behavior.
- No vault write occurs without explicit approval.
- Approved entries remain compact, atomic, deduplicated, and cross-repository.
- `/brainstorm` and `/plan` retrieve relevant guidance without loading unrelated entries.
- `/execute` and `/verify` remain independent of direct vault access.
- `/compound` is removed without an alias.
- The existing note is migrated only if it passes the same evidence gate.

## Explicit Downside
Evidence adjudication makes `/learn` slower, more token-intensive, and less likely to produce an entry than a summarizer. That cost is intentional. The design optimizes for trusted guidance that changes model behavior, not capture volume.

## Open Questions for Planning
- Should bounded session extraction use a small reusable parser/helper or prompt-driven shell commands?
- What supported mechanism provides a stable interactive confirmation in Pi prompt execution?
- How should tests exercise prompt behavior and session-tree selection without depending on Matteo's live private session archive?
- What is the narrowest reliable GitHub query sequence that covers private repositories for both authenticated accounts without losing the original active account state?
