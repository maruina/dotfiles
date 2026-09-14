---
description: Derive evidence-backed behavioral learnings from Pi sessions and pull requests
argument-hint: "[<PR URL | plan/design path | context>]"
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
Mode is determined by `$ARGUMENTS`:
- **Plain mode:** With empty arguments, resolve the current work's plan and its recorded `## Learning candidates` as described under "Plain mode resolution" below.
- **Contextual mode:** With any context, analyze the current conversation plus supplied pull request URL/number, review or conversation-comment URL, design/plan path, described wrong turn, or free-form guidance. A referenced pull request may be open in contextual mode.

## Plain mode resolution
1. Read the current branch and derive its slug by removing the first `<owner>/` prefix when present. Search the current worktree recursively for `**/plans/<branch-slug>/plan.md`.
2. Resolve exactly one match as an explicit path through the `resolve-worktree` skill. If multiple local matches exist, present them and ask which to resolve; never select silently.
3. If none exists, preflight every worktree for `**/plans/*/plan.md` and invoke `resolve-worktree` with that `$GLOB` only when candidates exist; repeat the same preflight and fallback for `**/plans/*/design.md` when no plan resolves.
4. If neither artifact exists anywhere, stop and suggest explicit context — a plan/design path, PR URL, or described guidance — and never invoke the resolver's generic no-match path.
5. Resolution and reading are permitted: the HARD-GATE forbids repository and vault mutation, not context resolution.
6. Read the selected plan completely, including its `## Learning candidates` section, and read its sibling `design.md` when present.

Plain-mode evidence adds the ledger candidates, the sibling design, the current conversation, and the branch's PR via `gh pr list --head <branch> --state all --limit 20` with explicit reporting when zero or multiple PRs match, under the existing account-routing and login capture/restore contract; `sessions-search` recurrence adjudication applies as in contextual mode.

Use this helper path in the source worktree: `dot_pi/agent/exact_scripts/learn-evidence.mjs`. In rendered use, resolve `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs`. Run its `--help` before relying on an unfamiliar invocation. Its stdout is versioned JSON; keep it local and do not paste broad raw session output into the conversation.

## Source precedence and privacy
Apply evidence in this order:

1. Current source code, tests, and tool behavior.
2. Current authoritative repository or product documentation.
3. Accepted pull-request review tied to the final result.
4. Adjudicated retained session history.
5. Existing `Datadog/Learnings.md` guidance.

Do not copy access tokens, credentials, secrets, assistant thinking, image data, raw private-message dumps, unrelated conversation content, or tool-call arguments into helper output, previews, staged documents, or the learning store. A source link may be omitted when it would cross an access boundary; local session paths and entry IDs are private evidence references.

## Contextual discovery
Interpret supplied context narrowly. Read supplied design or plan artifacts and inspect the current conversation. For a pull request, review, or conversation-comment URL, inspect the containing pull request's metadata, diff, reviews, inline threads, and comments even when the pull request remains open. Route `ddoghq/*` and `ddoghq-sandbox/*` to `matteo-ruina_ddog`; route every other repository, including `DataDog/*`, to `maruina`. Capture the original active GitHub login with `gh auth status --json hosts`, use `gh auth switch` only as needed per the routing rule, and restore and verify the original login after every normal or error path; never use `gh auth status --show-token`. If restoration fails, stop before preview or vault mutation, report the current and intended login, and require manual repair. Do not extend contextual discovery into an unbounded sweep.

## Adjudicate candidates
Candidate discovery only locates evidence. A raw match is not an independent occurrence.

For each narrow candidate, derive identifiers such as error text, file names, APIs, commands, and pattern names. Run `sessions-search` with those terms, then `session-context` only for selected entry IDs. Report retained source/date bounds, result totals, returned counts, and truncation. Group multiple messages from one wrong turn into one occurrence. Exclude injected instructions, `custom_message` content, quotations, quoted user mentions, repeated tool output, model statements that merely mention the topic, and superficially similar events with different causes.

Propose a learning only when it is actionable, broader than one exact diff, likely to improve future `/brainstorm` or `/plan` behavior, and follows at least one qualification path:

1. The same materially equivalent model mistake occurred independently more than once.
2. One model mistake caused a costly wrong turn and current source, tests, documentation, or tool behavior clearly disproves it.
3. A reviewer supplied generalizable guidance, and the final diff plus available reply/resolution evidence shows that it was accepted and materially incorporated.

Reject routine dependency bumps, changelog facts, mechanical edits, obvious documentation, and unsupported model assertions. Review presence alone is not accepted reviewer guidance.

Apply the non-derivability test to every prospective candidate: would a fresh model reliably produce and apply this guidance unaided at the moment it matters? If yes, reject it even when the mistake repeated. A qualifying candidate must encode at least one non-derivable element — an environment fact, tool quirk, semantic trap, or demonstrated model blind spot. Independent recurrence (qualification path 1) is evidence of non-derivability in practice; the test sharpens the paths rather than replacing them.

## Route accepted candidates
Each qualifying candidate gets exactly one primary target:
- Domain or technical guidance — an environment fact, tool quirk, or semantic trap about the work itself — is written to `Datadog/Learnings.md` through the existing transaction.
- Agent-behavior guidance — a skill's or prompt's guidance is wrong or missing — becomes a concrete improvement proposal in the report. It never enters the vault and is never auto-applied; the proposal enters the normal lifecycle.
- A dual candidate splits: the domain part becomes the vault entry; the skill or prompt part becomes the proposal.

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

Every mode that stages a rewrite runs the staleness maintenance pass: while preparing the staged final document, re-adjudicate every section whose date line is strictly earlier than the local calendar date shifted back six calendar months against current source, tools, documentation, and recorded consumption-time corrections. A date exactly on the threshold is not older; a missing or malformed date requires re-adjudication and explicit reporting. Apply the normal qualification and routing rules to corrected guidance: update a contradicted section only when a non-derivable corrected intervention remains; otherwise remove it. Preview each removal as `### Removal: <title>` with its reason; removals share the same one-approval transaction. Surviving sections' date lines bump to last-validated.

Also adjudicate `Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md` through this same process and PR #22 evidence. Preview its exact deletion in all migration outcomes, including when no replacement qualifies. The deletion is the sole exception to the no-candidate rule.

If no learning qualifies, no aged-section correction or removal exists, and no legacy migration deletion is pending, report the rejected candidates and why, do not ask for approval, and do not write. Otherwise — whenever additions, updates, removals, or the pending legacy migration deletion exist — ask once: approve or reject the complete preview. Treat any response other than clear approval of the complete set as rejection. Rejection or ambiguous approval removes snapshots and changes nothing.

## Apply an approved transaction
1. Before preview, create a mode 0600 temporary directory outside the repository and vault. Snapshot the existence and exact content of `Datadog/Learnings.md` and the legacy note, including missing-file markers, into mode 0600 files.
2. Produce one exact staged final `Learnings.md` document. Do not append individual sections.
3. After one approval, use `obsidian create path="Datadog/Learnings.md" content="..." overwrite` for the staged document and `obsidian delete path="Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md"` only when the approved preview includes deletion. Inspect Obsidian output as well as exit status.
4. Read back both exact paths with `obsidian read` and compare them to the approved staged content and expected existence. A status-0 missing-file message is failure unless absence was expected.
5. If either operation or read-back fails, compensate both paths from the mode 0600 snapshots, verify restoration byte-for-byte/existence-for-existence, report transaction failure, and never claim partial success. If compensation fails, stop and report the path and manual recovery needed.
6. On success, remove all temporary snapshots and staged files. Report the selected range or context, inspected and incomplete sources, original/final GitHub login, rejected and qualifying candidates, approval outcome, transaction result, and final affected vault paths.
