---
description: "Reclaim disk space: measure top consumers, preview integrated worktrees with Worktrunk, clean Go/Bazel/Docker caches. Asks before destructive steps."
argument-hint: "[aggressive | report-only]"
---
# Disk cleanup
Mode: $ARGUMENTS (empty means standard). `report-only` measures and proposes without deleting anything. `aggressive` also offers cache deletion that forces rebuilds, with user confirmation.

Use this command when the disk is full or space is low. It measures the known worst offenders, sweeps stale worktrees, and clears safe caches. It is safe by default: it never deletes dirty, locked, or active work without explicit user confirmation, and it never bypasses compute-guardrails.

Before task work, load the `skill-loader` skill and record `Skills loaded and used` in the final report.

<HARD-GATE>
- Never run recursive deletes (`rm -rf`, `find -delete`, or equivalents). compute-guardrails blocks them. Hand a ready-to-paste command block to the user instead.
- Never delete a dirty or locked worktree, a worktree on another person's branch, or uncommitted changes without an explicit user confirmation for that item.
- Never run `colima delete`, `go clean -modcache`, or a full docker prune without listing the size first and getting user confirmation.
- Never kill a running `bzl test`, `bzl build`, or bazel server to unblock a cleanup. Wait or skip.
</HARD-GATE>

## Environment facts
- 1 TB APFS MacBook. Use `df -h /` for truth; Disk Utility may differ because of purgeable space.
- `~/dd` is a symlink to `~/go/src/github.com/DataDog`. Both paths name the same files; never delete "duplicates" across them.
- Base repository checkouts live at `~/go/src/github.com/DataDog/<repo>`, `~/src/<repo>` (personal), and `~/.local/share/chezmoi` (dotfiles).
- Worktrees live at `~/go/src/github.com/DataDog/.worktrees/<repo>/<slug>`, `~/src/.worktrees/...`, and `~/.worktrees/...`. The `.worktrees/<repo>` parent directories are not git repos.
- Colima runs as a brew service (`brew services list`) with a Virtualization.Framework VM; its disk is `~/.colima/_lima`. Repository tests and e2e runs pull docker images into it; stale images accumulate.
- topgrade is not a cause of image growth. Its config only fetches `~/dd/*` git repos and upgrades brew formulas.

## Known gotchas
1. **Timeouts.** The bash tool timeout is in seconds. Give 600–1800 seconds for `du` over large trees, `go clean -modcache`, and `bzl dd disk-space gc`. A small default aborts mid-scan and wastes the work.
2. **Bounded scans.** Scan with targeted depth (`du -sh ~/Library/Caches/*`, `du -sh ~/go/src/*`), never one unbounded `du` over `$HOME`.
3. **Worktree ownership.** Run `git worktree remove` from the owning base repo, not from the worktree or its parent. Resolve the owner with `git -C <worktree> rev-parse --path-format=absolute --git-common-dir` and use its parent directory.
4. **Orphaned worktrees.** `git worktree remove` can unregister metadata and then fail to delete files (macOS permission errors). The directory is then an orphan: git says "not a working tree" but files remain. Only the user can delete it; add it to the manual command block.
5. **Locked worktrees.** `git worktree list --porcelain` shows a `locked` line. Removal needs `git worktree unlock` then `remove --force`. Always ask the user first; a lock set by someone else means their tooling owns it.
6. **bzl lock.** `bzl dd disk-space gc` refuses when another bzl or bazel process runs. Check with `pgrep -fl 'bzl (test|build)'` first. `--force-bazel-shutdown` stops bazel servers but not other people's work.
7. **Worktrunk integration.** `wt step prune --dry-run` checks content integration against the local default branch or its known upstream, not GitHub PR state. Stale refs can omit candidates; do not fetch during the scan. The helper uses the configured `worktrunk.default-branch` or local `origin/HEAD` without changing Git config; if neither is available, it flags the repository. Worktrunk may write `.git/wt/cache/` during preview.
8. **Bulk prune.** A live prune can remove the current worktree and branch-only candidates. Never run bulk prune against unreviewed candidates.

## Step 1: Measure
Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/disk-cleanup.mjs" measure`. Use the JSON to report disk space, consumers, top caches, Docker, Bazel processes, crash dumps, and Trash. Sizes are in KiB. If `bazelRunning` is true or unavailable, skip Bazel GC. Stop if required measurements are unavailable.

Reference sizes from a past run (2026-10-21, freed about 290 GB total): go module cache 124 GB, bazel output bases 237 GB, colima VM 102 GB with 95 GB reclaimable images, go-build 27 GB, goimports 17 GB, dotfiles worktrees under 2 GB. Expect regrowth; treat these as order-of-magnitude, not targets.

## Step 2: Worktree sweep
Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/disk-cleanup.mjs" scan-worktrees`. The helper uses `wt list` and `wt step prune --dry-run`, with Worktrunk's default one-day minimum age, and reports integrated previews, dirty or flagged worktrees, branch-only candidates, and orphaned directories. It does not query GitHub or remove anything. Stop on unavailable evidence; do not infer PR state from integration.

Show the preview and require explicit approval for each worktree before removal, including integrated candidates. Do not select current or active work, or foreign, locked, dirty, or detached worktrees for routine removal. Before each approved removal, re-run the scan and compare the recorded tip with the current tip; recheck registration, branch ownership, lock, and dirty status. Stop if any check or preview changes, or evidence is unavailable. Inspect Worktrunk removal hooks first; stop if their effects are unreviewed or violate a HARD-GATE. Then run `wt remove --foreground --no-delete-branch <worktree>` from its owning base repo. Never use `--force`, override a Worktrunk refusal, or run bulk prune. Leave branch-only candidates for separate user review; do not delete branches automatically. Hand orphaned directories to the user for manual removal.

## Step 3: Caches
Ask-then-run for each confirmed item (sizes come from step 1):

| Item | Command | Cost |
|---|---|---|
| Go module cache | `go clean -modcache` (timeout 1800) | Re-downloads modules on demand |
| Bazel output bases | `bzl dd disk-space gc --force-bazel-shutdown` (timeout 1800) | Orphaned output bases gone; rebuild on next build |
| Go build cache | `go clean -cache` | Slower first builds |
| Docker images | `docker image prune -af --filter "until=168h"` | Re-pulls images when tests need them |
| Homebrew | `brew cleanup --prune=all` | None |
| npm cache | `npm cache clean --force` | Re-downloads |
| GoLand crash dumps | `rm ~/*.hprof` (single files, allowed) | None |

Manual handoff (blocked for the agent, give the user a command block):
- `rm -rf ~/Library/Caches/goimports` — regenerates automatically.
- `rm -rf ~/Library/Caches/JetBrains` — close GoLand and IntelliJ first; first start rebuilds indexes.
- Any orphaned worktree directories from gotcha 4.
- Trash: report the size (`du -sh ~/.Trash`); the user empties it in Finder.

`colima delete` erases the whole VM, all images, containers, and volumes, plus the instance config. Offer it only when the user says they no longer use Docker; pruning is the default.

## Step 4: Report
- Before and after `df -h /`, with total reclaimed.
- A table of what was removed, what was skipped (with reason), and what the user must run manually.
- Worktrees kept, grouped as integrated previews, dirty or unintegrated worktrees, branch-only candidates, and flagged or orphaned items.
- `Skills loaded and used` from the `skill-loader` skill.
