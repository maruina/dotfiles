---
description: Simplify recently changed code without altering behavior
argument-hint: "[<pr-url> | <worktree-path> | <file-path>] [--base <ref>]"
---
# Simplify
Target:

> $ARGUMENTS

Simplify code for clarity and maintainability while preserving behavior exactly. This is an opt-in refinement pass, distinct from the within-step "refactor after green" in `/execute`: it reviews the whole recent diff and improves it as a unit.

Lifecycle: `/brainstorm` creates a committed design spec, `/plan` creates a committed implementation plan, `/systematic-review` validates code or plans, `/execute` implements verified changes, `/simplify` optionally refines them, and `/compound` captures durable learning after the work lands.

<HARD-GATE>
Do not change behavior. Existing tests must pass before and after; run the focused tests for the touched code first, and again after simplifying. If no tests cover the touched code, say so and stop rather than guessing at behavior. Do not add features, abstractions, or configurability.
</HARD-GATE>

## Scope
Default to recently changed code, not the whole repository. Resolve the target from the first positional in `$ARGUMENTS`:

- **File path** — simplify only that file.
- **Worktree / directory path** — simplify the branch diff there against its base.
- **PR URL** — simplify that PR's diff (see `/codex-review` for base detection and HEAD-restore guards if you must move HEAD).
- **No positional** — simplify the current checkout's working-tree changes, or the branch diff against its base when the tree is clean.

Honor a user-supplied `--base`. Stay within the changed lines and their immediate context; do not expand into untouched code.

## Delegate the "how"
Do not restate style rules here. Load the skill that matches each touched file and defer to it, plus the repository's `AGENTS.md`:

- Go: `go-best-practices`
- Shell / Fish: `script-best-practices`
- CLI surfaces: `cli-best-practices`
- Unfamiliar area: `codebase-research` before touching it

Match the repository's existing conventions over any general preference.

## Guardrail
Simplicity serves the reader, not brevity. Do not:

- remove a useful abstraction, seam, or name that aids understanding
- collapse code in a way that harms debuggability or error messages
- trade maintainability for fewer lines
- churn code that is already clear

If a change is cosmetic-only with no clarity gain, skip it. If nothing is worth simplifying, say so and stop.

## Handoff
Report the simplification diff, the verification commands run before and after, and anything you deliberately left alone. Then say exactly:

> I finished simplifying the changes
