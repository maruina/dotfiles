---
description: Derive evidence-backed learnings and mechanical-gate proposals from Pi sessions and pull requests
argument-hint: "[--days <N>] [<PR URL | plan/design path | context>]"
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
Parse optional `--days <N>` (positive integer, default `30`). Mode is determined by the remaining arguments:
- **Repository retro mode:** With no remaining arguments, mine the last `<N>` days of sessions for the current repository and its worktrees for recurring failures, corrections, and workflow friction.
- **Contextual mode:** With any remaining context, analyze the current conversation plus supplied pull request URL/number, review or conversation-comment URL, design/plan path, described wrong turn, or free-form guidance. A referenced pull request may be open in contextual mode.

## Repository retro discovery
1. Resolve the current repository root (`git rev-parse --show-toplevel`) and all worktree paths (`git worktree list --porcelain`). If not inside a Git repository, stop and suggest contextual mode with explicit context.
2. **Trajectory first (when available):** Call `trajectory_schema` (`include_row_counts: false`) once, then run bounded read-only `trajectory_query` queries over the last `<N>` days (`started_at >= date('now', '-<N> days')`) where `sessions.project_dir` matches the repository root or any of its worktree paths. Look for recurring friction across:
   - `markers` (such as `test-failed` and repeated `pr-interaction` clusters);
   - `tool_calls` (`success = 0`, `denied = 1`, or repeated `error_text`);
   - `turns` (`user_interrupted = 1`);
   - `trajectory_search` for targeted error strings, commands, or file paths.
   Inspect only the relevant turns with `get_session_trajectory` (`depth: "detailed"`, bounded `max_turns` and `offset`). Do not dump raw sessions into the conversation.
3. **Fallback when Trajectory is unavailable (for example, on the personal profile):** Use `learn-evidence.mjs` (`sessions-search` and `session-context`) against retained Pi JSONL sessions, and run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" discover-plan` to inspect any branch-matching plan (`**/plans/<branch-slug>/plan.md` via `resolve-worktree`) and its `## Learning candidates` ledger.
4. In both paths, also inspect recent repository PRs via `gh pr list --state all --limit 20` under the `AGENTS.md` GitHub account-routing and login capture/restore rule (never use `gh auth status --show-token`), and inspect any current-branch plan's `## Learning candidates` ledger when present.

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
Interpret supplied context narrowly. Read supplied design or plan artifacts and inspect the current conversation. For a pull request, review, or conversation-comment URL, inspect the containing pull request's metadata, diff, reviews, inline threads, and comments even when the pull request remains open. Follow the GitHub account routing and capture/restore rule in `AGENTS.md` (Tool Use); never use `gh auth status --show-token`. If restoration fails, stop before preview or vault mutation, report the current and intended login, and require manual repair. Do not extend contextual discovery into an unbounded sweep.

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
Evaluate mechanical enforceability first. Each qualifying candidate gets one primary target (or splits when distinct parts belong to different targets):
- **Mechanical gate proposal (check first):** When a recurring mistake or invariant can be enforced deterministically in the owning repository (for example, `golangci-lint` `depguard`/`forbidigo`, an `ast-grep` rule with a negative fixture, a CRD CEL rule, or a Makefile/CI check), emit a concrete mechanical-gate proposal in the report naming the owning repository, check mechanism, rule scope, and negative test case. It never enters the vault and is never auto-applied; it enters the normal lifecycle. Fall back to `Datadog/Learnings.md` only when the owning repository is external or high-friction to add a linter to.
- **Agent-behavior guidance:** When a skill's or prompt's guidance is wrong or missing, emit a concrete improvement proposal in the report. It never enters the vault and is never auto-applied; the proposal enters the normal lifecycle.
- **Domain or technical guidance:** Non-mechanical, non-derivable environment facts, tool quirks, or semantic traps about the work itself go to `Datadog/Learnings.md` through the existing transaction.

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

Every mode that stages a rewrite runs the staleness maintenance pass: while preparing the staged final document, re-adjudicate every section whose date line is strictly earlier than the local calendar date shifted back six calendar months against current source, tools, documentation, and recorded consumption-time corrections. A date exactly on the threshold is not older; a missing or malformed date requires re-adjudication and explicit reporting. Apply the normal qualification and routing rules to corrected guidance: update a contradicted section only when a non-derivable corrected intervention remains; otherwise remove it. Also remove any section that is now mechanically enforced by a linter, schema check, or CI gate in its owning repository. Preview each removal as `### Removal: <title>` with its reason; removals share the same one-approval transaction. Surviving sections' date lines bump to last-validated.

Also adjudicate `Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md` through this same process and PR #22 evidence. Preview its exact deletion in all migration outcomes, including when no replacement qualifies. The deletion is the sole exception to the no-candidate rule.

If no learning qualifies, no aged-section correction or removal exists, and no legacy migration deletion is pending, report the rejected candidates and why, do not ask for approval, and do not write. Otherwise — whenever additions, updates, removals, or the pending legacy migration deletion exist — ask once: approve or reject the complete preview. Treat any response other than clear approval of the complete set as rejection. Rejection or ambiguous approval removes snapshots and changes nothing.

## Apply an approved transaction
1. Before preview, create a mode 0600 temporary directory outside the repository and vault. Snapshot the existence and exact content of `Datadog/Learnings.md` and the legacy note, including missing-file markers, into mode 0600 files.
2. Produce one exact staged final `Learnings.md` document. Do not append individual sections.
3. After one approval, use `obsidian create path="Datadog/Learnings.md" content="..." overwrite` for the staged document and `obsidian delete path="Datadog/Compound/dotfiles-chezmoi-execute-template-profile.md"` only when the approved preview includes deletion. Inspect Obsidian output as well as exit status.
4. Read back both exact paths with `obsidian read` and compare them to the approved staged content and expected existence. A status-0 missing-file message is failure unless absence was expected.
5. If either operation or read-back fails, compensate both paths from the mode 0600 snapshots, verify restoration byte-for-byte/existence-for-existence, report transaction failure, and never claim partial success. If compensation fails, stop and report the path and manual recovery needed.
6. On success, remove all temporary snapshots and staged files. Report the selected range or context, inspected and incomplete sources, original/final GitHub login, rejected and qualifying candidates, approval outcome, transaction result, and final affected vault paths.
