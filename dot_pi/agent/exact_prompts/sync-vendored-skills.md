---
description: Refresh all vendored skills from their upstream repos into the chezmoi source
argument-hint: "[skill-name ...]"
---
Re-vendor skills from their upstream repos into the chezmoi source under `~/.local/share/chezmoi/dot_pi/agent/`.

> $ARGUMENTS

Scope:
- If skill names are given above, sync only those. Otherwise sync every vendored skill.

Context:
- Vendored skills live under `dot_pi/agent/exact_skills/` (shared), `dot_pi/agent/exact_skills_work/` (work profile), and `dot_pi/agent/exact_skills_personal/` (personal profile).
- A vendored skill is any directory containing a `VENDOR.md`. That file records the upstream URL, the upstream subpath, the pinned commit, and optionally a `Files` list for skills that use only part of the upstream path.
- Upstream repos are cloned under `~/go/src/github.com/<org>/<repo>`, derived from the upstream URL.
- Treat any skill directory without a `VENDOR.md` as hand-maintained; never touch it. In particular, the curated `home-assistant` and `home-assistant-mcp` skills are maintained by the `/sync-home-assistant-skills` prompt, not this one.

Workflow:
1. Discover targets: find every `VENDOR.md` under `dot_pi/agent/exact_skills`, `dot_pi/agent/exact_skills_work`, and `dot_pi/agent/exact_skills_personal` (filter to the requested skill names if any were given). Read each one for its upstream URL, subpath, pinned commit, and optional `Files` list.
2. Group targets by upstream repo. For each repo, ensure the clone exists at `~/go/src/github.com/<org>/<repo>` (clone it if missing), then refresh and read its HEAD: `git -C <clone> fetch origin && git -C <clone> log -1 --format='%H %ci' origin/HEAD`.
3. If the upstream HEAD equals every pinned commit for that repo, report "already up to date" for those skills and skip them.
4. For each out-of-date skill, diff upstream against the vendored copy to preview changes. If `VENDOR.md` has a `Files` list, diff each path relative to `<clone>/<subpath>` against the same relative path in the vendored directory; otherwise run `diff -ru <vendored-dir> <clone>/<subpath>`. Ignore `VENDOR.md`.
5. Replace the vendored skill contents with the upstream files, preserving `VENDOR.md`. When a `Files` list is present, copy only those paths and keep their relative layout.
6. Update the pinned commit in each `VENDOR.md` to the new upstream HEAD.
7. Verify chezmoi drift: `chezmoi diff ~/.pi/agent/skills ~/.pi/agent/skills_work ~/.pi/agent/skills_personal`.
8. Apply: `chezmoi apply ~/.pi/agent/skills ~/.pi/agent/skills_work ~/.pi/agent/skills_personal`.

When summarizing, list each synced skill, its old and new pinned commit, and a short note on what changed upstream. Note any skills that were already up to date or skipped.
