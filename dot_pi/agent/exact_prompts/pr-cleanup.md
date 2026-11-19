---
description: Safely remove the review worktree for a completed PR
argument-hint: "<GitHub PR URL>"
---
# PR Cleanup
PR URL: `$ARGUMENTS`

Load `skill-loader` before task-specific work. Remove only the local review worktree created by `/pr-validate` for this PR.

Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/pr-validate-report/workspace.mjs" cleanup "$PR_URL"`. Pass the supplied URL as one argument. If it is missing, ask for it and stop.

Report the returned status and path. If the script fails, report its diagnostic and stop. Do not retry with `--force`, delete the directory manually, or remove other worktrees.
