---
name: learning-lookup
description: Look up advisory guidance from the Obsidian `Datadog/Learnings.md` store before design or planning decisions. Use from /brainstorm and /plan only; /execute and /verify must not read the mutable store.
---
# Learning Lookup
Read matching sections from `Datadog/Learnings.md` and use them as advisory input to a design or planning decision. The calling prompt names when to look up, where to record the result, and when to stop reading the store.

## Look up
1. Derive narrow terms for the technology, error, API, tool, and pattern in the current request and repository context.
2. Read `Datadog/Learnings.md` through Obsidian and pipe it locally to the `learning-sections` command of `learn-evidence.mjs`. The rendered helper is `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs`; in the chezmoi source it is `dot_pi/agent/exact_scripts/learn-evidence.mjs`.
   ```bash
   obsidian read path="Datadog/Learnings.md" | node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs" learning-sections --term <term> --term <term>
   ```
3. Pass only the returned complete H2 sections into reasoning. Apply no repository filter.
4. Report matched section titles and the material guidance used. Do not report unrelated sections.

## Weigh
Learnings are advisory. Current source code, tests, and tool behavior, then authoritative documentation, take precedence. Sections whose date line is older than six months are hypotheses to re-check against current evidence, not established facts.

## Record
Record material guidance in the artifact that the calling prompt names, including when stronger evidence makes a learning stale, corrected, or intentionally omitted.

## Failure behavior
- Treat an absent `Datadog/Learnings.md` as empty without warning noise.
- If Obsidian is unavailable, continue and record the skipped advisory source in the artifact that the calling prompt names.
