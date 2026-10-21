---
description: "Reclaim disk space: measure top consumers, sweep stale worktrees by merged-PR state, clean Go/Bazel/Docker caches. Asks before destructive steps."
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
7. **GitHub accounts.** For `ddoghq/*` PR queries use the `matteo-ruina_ddog` gh account; for everything else use `maruina`. Capture the active login with `gh auth status`, switch before PR queries, and restore it after every path.
8. **Merged-PR lists truncate.** `gh pr list --state merged --limit 500` can miss older branches. For any worktree not matched, verify per branch with `gh pr list --state merged --head <branch> --limit 1`.

## Step 1: Measure
Run these and record a table of consumer, size, and safe action:
- `df -h / | tail -1`
- `du -sh /private/var/tmp/_bazel_matteo.ruina ~/Library/Caches ~/.colima ~/go/pkg/mod ~/go/src ~/.npm 2>/dev/null | sort -rh`
- `du -sh ~/Library/Caches/* 2>/dev/null | sort -rh | head -10`
- `du -sh ~/go/src/github.com/DataDog/.worktrees 2>/dev/null`
- `docker system df 2>/dev/null` (colima must be running; otherwise note it as stopped)
- `pgrep -fl 'bzl (test|build)'` — if a bazel job runs, mark bazel GC as blocked and skip it this run.
- `du -sh ~/*.hprof 2>/dev/null` — GoLand crash dumps.

Reference sizes from a past run (2026-10-21, freed about 290 GB total): go module cache 124 GB, bazel output bases 237 GB, colima VM 102 GB with 95 GB reclaimable images, go-build 27 GB, goimports 17 GB, dotfiles worktrees under 2 GB. Expect regrowth; treat these as order-of-magnitude, not targets.

## Step 2: Worktree sweep
For each base repository with more than its own checkout registered:
1. List worktrees: `git -C <repo> worktree list --porcelain`.
2. Classify each non-primary worktree:
   - **Merged PR + clean status** → remove with `git worktree remove`, then `git branch -D`. This is the only auto-remove class.
   - **Merged PR + dirty** → propose; remove only with `git worktree remove --force` after the user confirms the uncommitted changes are disposable.
   - **Open PR** → keep; report as live work.
   - **No PR** → propose with last-commit date and dirty state; the user decides per item.
   - **Locked or another person's branch** → flag; remove only after explicit user confirmation, with `git worktree unlock` first.
3. Verify merge state with the correct gh account and the per-branch check from gotcha 8.
4. Run `git worktree prune` per repo after removals.
5. Worktree branches whose PR is merged are safe to delete locally even for squash merges; content lives on GitHub.

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
- Worktrees kept, grouped as open PRs, no-PR candidates, and flagged items.
- `Skills loaded and used` from the `skill-loader` skill.
