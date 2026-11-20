---
description: Refresh all vendored skills from their upstream repos into the chezmoi source
argument-hint: "[skill-name ...]"
---
Refresh vendored skills in the selected chezmoi source. Use every requested skill name as a separate argument; with no names, refresh all vendored skills.

> $ARGUMENTS

1. Resolve the intended source root, including the current feature worktree when applicable. Set `source` to that absolute path. Do not use the default source when working in another worktree.
2. Run `node "$source/dot_pi/agent/exact_scripts/sync-vendored-skills.mjs" --source "$source" --dry-run` with all requested skill names appended as separate arguments. Review the JSON report and stop on any error.
3. Run the same command without `--dry-run`. Stop on any failure and report `completed` and `partialSkill`; do not apply targets after a failed sync.
4. Run `node "$source/dot_pi/agent/exact_scripts/validate-skills.mjs"` and `git -C "$source" diff --check`. Stop if either fails.
5. For each updated skill in the active profile, map its source directory to the corresponding `~/.pi/agent/skills`, `skills_work`, or `skills_personal` target. Run `chezmoi --source "$source" status --path-style absolute <skill-target>` to enumerate all changed targets, including deletions. Run `chezmoi --source "$source" diff <target>` for each listed path; do not rely on a directory diff. Stop if a path or deletion is unclear. Then apply only the reviewed skill targets with `chezmoi --source "$source" apply <skill-target>`. Exact skill and nested directories remove target files absent from the source.
6. Summarize updated skills, old and new commits, changed files, and up-to-date or profile-skipped skills. Hand-maintained directories without `VENDOR.md`, including `home-assistant` and `home-assistant-mcp`, are outside this workflow.
