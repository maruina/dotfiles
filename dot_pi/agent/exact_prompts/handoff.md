---
description: Write a self-contained handoff brief so a fresh agent session knows where to start
argument-hint: [next issue or focus]
---
# Handoff
Focus: $ARGUMENTS

## Purpose
- Orient a fresh agent session that has no memory of this session.
- Make the brief work as a plain prompt and as the argument to any lifecycle prompt. The user may paste it on its own or pass it to `/brainstorm`, `/plan`, `/execute`, or another prompt.
- Give context and state, not commands for the reader to run.
- The new session loads the same `AGENTS.md` and skills. Do not repeat them.
- When `$ARGUMENTS` names a next issue, aim the brief at that issue.

## HARD-GATE
<HARD-GATE>
Do not change files, commit, push, or run state-changing commands. Read-only commands that confirm the current state are allowed.
</HARD-GATE>

## Gather
- Review the full session.
- Confirm live state with read-only commands: `git status --short`, `git branch --show-current`, `git log --oneline -n 10`, and `git worktree list`.
- When a PR exists, get its URL, state, and checks with `gh pr view`. Follow the `gh` account routing in `AGENTS.md`.
- Reference durable artifacts by absolute path or URL, such as `design.md`, `plan.md`, PRs, Jira issues, or Confluence pages. Do not restate their content.

## Rules
- Use only session evidence or live state. Label each inference as an assumption.
- Keep verified facts, with the command and result, separate from unverified claims.
- Leave out secrets, tokens, credentials, and raw logs. Summarize relevant evidence instead.
- Use absolute paths.
- Prefer short bullets. Leave a section out when it is empty.
- Do not write instructions that would override the prompt that receives the brief. For example, do not write “start editing” or “run `/execute` now.”

## Output
Return one fenced Markdown block. Start it with `# Handoff: <short title>`, then this line: `Context from a previous session. Confirm the current state before you act on it.` Include these sections in this order:

1. `## Goal and context`: the goal, why it matters, and source-of-truth links.
2. `## Current state`: the repository, absolute worktree path, branch and base, uncommitted changes, PR and CI status, and progress. State how far the work got, such as “design agreed, no plan yet” or “tasks 1–3 of 5 done.”
3. `## Done so far`: outcomes with evidence, such as commit SHAs and test commands with results.
4. `## Decisions`: each decision, why it was made, and which options were rejected. Give enough context so the next agent does not reopen settled decisions.
5. `## Pitfalls`: what went wrong in this session, written as symptom → cause → what to do instead. Include failed commands, wrong assumptions, tool quirks, and user corrections.
6. `## Open questions and blockers`.
7. `## Next steps`: an ordered list of remaining outcomes, not commands.
8. `## Suggested starting point`: one line that names a suitable stage, such as a plain prompt, `/brainstorm`, `/plan`, `/systematic-review`, `/execute <abs-path>`, or `/verify`, and explains why. Make it a recommendation; the user decides.
9. `## User preferences`: preferences stated in this session that are not in `AGENTS.md`.

After the fenced block, add at most three lines for evidence gaps that could not be confirmed and durable pitfalls that may merit `/learn` or an `AGENTS.md` change. Suggest recording them; do not record them yourself. Omit either line when it has nothing to report.
