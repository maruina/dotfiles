# Rex PR inbox for Pi
Status: Approved

## Problem and audience
Matteo runs Pi sessions in Rex and uses local Git worktrees to develop changes. GitHub shows PR status but does not tell him which Pi pane can resume the work. Rex shows the panes but does not show which PRs need attention. The inbox brings those facts together on one Rex host without changing GitHub or sending input to agents.

The unit of discovery is an open GitHub PR that matches a local branch checked out in a worktree of a repository known to a Pi session. List all such PRs, including PRs opened manually and PRs in sibling worktrees. The GitHub account is the same whether Matteo or Pi opened the PR. The inbox does not label or infer authorship. A repo-wide match includes a PR in the list but does not establish a pane association.

## Smallest user-feedback slice
One Rex keybinding opens a single floating inbox, minimizes it, or restores and focuses it. The first open discovers PRs and starts refreshing them. Minimizing the panel does not stop refresh. Closing it stops refresh. Nothing polls before the first open, and no background service is installed.

Each row shows the repository, PR number and title, draft or open status, GitHub checks, unresolved inline review threads, and a clickable GitHub link. Show a check failure link, including a GitLab or DDCI link when GitHub supplies one. Offer **Jump to Pi** only when one verified live Pi pane matches the PR's worktree. A current pane is not required for a PR to appear.

Two Pi sessions and their PRs are enough to show whether one list saves time and whether a pane jump is useful. Include a third PR opened manually in a sibling worktree to check that discovery does not depend on a Pi publish event. A static mock would test the layout but not the features that distinguish this inbox: first discovery after Pi exit, GitHub source failures, and refresh while the panel is minimized.

## Design overview
### Discover PRs from checkpoints and worktrees
Use same-host [`rex-recovery` checkpoints](../../dot_pi/agent/exact_extensions/rex-recovery/README.md) as repository discovery anchors. The extension records the Pi launch directory and Rex pane identity at session startup and around agent activity. The checkpoint remains on disk after Pi exits. A checkpoint is a starting directory, not proof that a Pi process or worktree is still present. Read only the metadata needed by the inbox, and do not read conversation files or run recovery actions.

At first open and on bounded refreshes, enumerate local Git worktrees from valid checkpoint directories. Deduplicate repositories and worktrees before querying GitHub. Use open PRs whose GitHub head repository and branch match a checked-out branch, not branch name alone. A fork or an ambiguous head that cannot be matched reliably is not sufficient evidence. Deduplicate rows by GitHub PR identity so overlapping checkpoints cannot produce duplicate rows. Ignore missing worktrees. If an anchor is no longer usable and no other checkpoint leads to that repo, the inbox need not recover its PRs. Do not store a separate PR history or fall back to an account-wide search.

### Verify pane jumps independently
A jump requires a unique direct match between the PR's worktree and a checkpoint for a live Pi foreground process in the recorded Rex pane. Check the checkpoint's Rex host and endpoint as well as the pane and live process identity. A shell still running in the pane after Pi exits is not a match. Recheck before focusing the pane; if the proof is ambiguous, unavailable, or no longer current, hide or decline the jump without removing the PR. `session.focus_block` focuses the block and its window within a session. Verify navigation in the app across Rex sessions as well; do not treat a server-side focus result alone as proof that the client switched sessions.

### Preserve independent GitHub results
Read the PR state and check rollup from GitHub. Show failed, pending, and passing results as applicable. A successful read with no reported checks is **No checks reported**, not passed or pending. A failed read is **Checks unavailable**, not an empty result. Do not classify skipped, canceled, or unknown checks as passed. Show a check's provider link when present; do not query DDCI or GitLab for logs or invent a missing link.

Use the `reviewThreads` query in [`collect.mjs`](../../dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs) as a reference for pagination and source errors; do not run the full collector per row. The inbox needs unresolved, non-outdated threads, not diffs or the full conversation. Keep thread results independent from check results. Show zero threads only when the read establishes zero; label an incomplete or unavailable result instead. If a refresh fails after a successful read, retain useful information only if the panel identifies it as stale. A failed discovery request must not remove rows as if GitHub confirmed they no longer exist.

### Keep refresh owned by the panel
Use a custom action in [`dot_config/rex/init.lua`](../../dot_config/rex/init.lua) to open or toggle the existing floating layer. The installed Rex API says a minimized layer keeps its blocks running. The panel owns one refresh loop for the local inbox, so minimizing keeps that loop active without a detached process. Reopening or invoking the shortcut from another tab must not start a second poller. Closing the panel ends the loop and its outstanding work.

Use bounded request time and per-cycle work, one refresh cycle at a time, and backoff on errors or rate limits. Group discovery reads by repository rather than by checkpoint. Report when a limit prevents a full scan. Display when the last successful refresh occurred and which repo or data source failed, without printing credentials or command output that contains private data. The exact shortcut and polling interval are planning details; check for shortcut conflicts and measure the request budget before selecting them.

## Alternatives and deferred scope
- **Live-pane discovery only:** Closest to Herdr's discovery flow and needs no checkpoint reads. It cannot discover the first PR from a repo after its only Pi session exits. Reuse the existing checkpoint metadata instead.
- **Structured `/implement` publication or `gh pr create` capture:** A recorded URL can preserve an association even if the worktree disappears. The existing `pr-publish` outcome includes `prUrl` and `publishedHeadSha` but returns the same fields for creation and update. A Pi Bash `tool_result` can observe a standalone successful create, but shell output from compound commands is not equivalent creation evidence. Neither approach covers all manually opened or sibling-worktree PRs by itself. Defer publish instrumentation unless deleted-worktree recovery becomes useful.
- **Refresh only while visible:** Reduces requests but makes the user wait for fresh results after restoring the panel. Use bounded refresh while minimized. Defer a service that starts with Rex unless there is a need to poll before first open or after the panel closes.
- **More of Herdr's interface:** Defer PR timelines and detail pages, linked issues, owner and repo filters, account-wide `mine` mode, AI check classification, merge-readiness summaries, and post-merge workflows until the list proves useful. Job and log previews, inline diffs, posting or resolving comments, merging, sending feedback to agents, Claude Code, and cross-host aggregation are not part of this slice.

## Safety, operability, and rollback
Run read-only Git and GitHub operations as the local user. Restrict links to validated destinations and treat titles, comments, check names, and directory names as data, not terminal control sequences or shell input. Keep credentials with `gh`. The background loop must not repeatedly switch the shared active `gh` account. If the configured identity is not authorized or does not match the repository's account routing, report the repo as unavailable instead of silently trying another account. The demo uses one correctly routed account.

Use the existing checkpoint boundary and do not change the recoverability or retention of Pi sessions. The panel should identify unreadable checkpoints, unreachable Rex, and failed GitHub reads without presenting them as an empty inbox. Start rollout on one Rex host with the explicit keybinding. Close the panel to stop refresh immediately. Revert the managed inbox files and keybinding to remove the feature; leave the checkpoints and GitHub state unchanged.

## Success criteria and validation
- Start two Pi sessions in separate worktrees with open PRs in the same repo. Exit one before the first inbox open, leaving its shell or pane present if possible. The first shortcut invocation shows both PRs once and also shows a manually opened PR in a third worktree. Only the verified live match offers a jump. Click it and verify the actual app pane; repeat the stale case after the pane's process changes.
- Use a real failing check and an unresolved inline review thread. Confirm that the PR and failure links open the correct destinations. Use controlled responses to verify pending, empty, skipped or canceled, invalid, and unavailable check results, and complete, partial, and failed thread queries. Verify a GitLab or DDCI link if one is available from the test PR; otherwise validate link handling with a fixture and report the missing live-provider check.
- Minimize the panel, change a check result, and verify after restore that it refreshed without a manual request. Confirm no second poller starts, no polling happens before the first open, and closing ends refresh. Exercise backoff and bounded behavior with simulated slow, large, and rate-limited responses.
- Remove a worktree and refresh. A PR without a matching worktree can leave the list. Simulate a failed repo fetch and verify it does not look like worktree removal.

### Validation limits and open questions
The installed Rex API confirms layer and focus operations, not end-to-end toggle, browser links, or cross-session navigation. Those are demo gates. Verify checkpoint coverage, GitHub head matching, and refresh requests against real local data before calling the demo ready. A missing provider URL, missing discovery anchor, a worktree removed before first open, and mixed-account polling are accepted first-slice limits. This design does not claim PR history, support for every fork layout, notifications, or reliable behavior after hard shutdown.

## Context reviewed
- [Herdr PR Flow source](https://github.com/jjangsky/herdr-pr-flow/tree/87b430aca1c530306631e3c0c481880fcb839a0f/mods/pr-flow): `tracker.js` uses live agents and worktree branches for discovery, `main.js` persists discovered PRs, and `gh.js` and `present.js` read and display GitHub facts. Unlike Herdr, this slice uses existing checkpoints to discover a PR for the first time after the agent exits.
- [Nick Lopez's Rex floating tracker](https://github.com/nlopez/dotfiles/commit/68b7c026f1f6c5dbbc65f7c5c240c02a04af1e8a) creates a floating layer for each tracked Claude pane. Reuse the Rex layer mechanism, not the per-pane watcher design. The installed API documents `session.new_layer`, `session.set_layer_state`, and `session.focus_block`; [Rex custom actions](https://www.superlogical.com/rex/docs/customize/actions) can be bound to a key.
- Local references: [`rex-recovery`](../../dot_pi/agent/exact_extensions/rex-recovery/), [`pr-publish.md`](../../dot_pi/agent/exact_prompts/pr-publish.md), the [`ship-conductor` outcome schema](../../dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts), and [`collect.mjs`](../../dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs). The advisory lookup of `Datadog/Learnings.md` returned no matching sections.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Brainstorm workflow | Routed research and artifact preparation. |
| `codebase-research` | `skill-loader` | Existing Pi, Rex, and GitHub behavior | Traced discovery, checkpoints, publication, and thread data. |
| `rex` | `agent-selected` | Layer lifetime and pane navigation | Checked live API descriptions and the local keymap. |
| `learning-lookup` | `prompt-required` | Advisory guidance | Checked narrow terms in the learnings store; no matches. |
| `obsidian-cli` | `agent-selected` | Source for advisory guidance | Read the Obsidian note through the CLI. |
| `feature-worktree` | `prompt-required` | Durable design draft | Created the feature worktree from `origin/main`. |
| `chezmoi` | `skill-loader` | Managed dotfiles repository | Kept the draft in source and did not change rendered targets. |
| `write` | `skill-loader` | Design prose | Separated confirmed scope, proposed behavior, and untested claims. |
| `diataxis` | `agent-selected` | Design explanation | Compared alternatives and avoided turning the draft into an implementation guide. |
