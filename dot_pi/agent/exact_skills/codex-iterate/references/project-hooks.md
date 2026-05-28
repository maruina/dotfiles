# Post-edit project hooks

Between Step 3 (apply validated fixes) and Step 4 (resume Codex), run the repo's standard formatters and build-graph updaters on the files Pi touched this round. The point is narrow: collapse cosmetic churn from Pi's own edits before Codex re-reviews, so unformatted imports, stale BUILD targets, and lint noise don't show up in round N+1 as new findings.

This file documents the detection logic, the canonical hook table, and the failure protocol that SKILL.md Step 3b refers to.

## Scope discipline

**Only touched files, only this round's edits.** Step 3b is not a maintenance pass — running `gofmt -w ./...` or `prettier --write .` across the whole repo would pull unrelated dirty files into the loop and confuse the addressed list. The exact file set is: every file Pi edited in Step 3, plus any file the formatter writes through as a side effect (e.g. a formatter that touches paired test files).

If the hook itself surfaces new files in the working tree that Pi didn't intend to touch, add them to the round's addressed list with a one-line note ("hook side effect") so Step 4's continuation prompt accounts for them.

## Detection priority

Resolve the per-scope hook set once at loop start (in Step 1). First match wins per file class:

1. **Scope-local guidance files** (highest priority). Read `CLAUDE.md` and `AGENTS.md` in the scope root and ancestors. Honor explicit instructions of the shape:
   - "after any change, run X"
   - "every source change must pass X"
   - "before committing, run X"
   - "use the X command"

   Specific repo conventions in guidance files override the heuristic table below. Example: slog's CLAUDE.md mandates `go build ./... && go vet ./... && go test ./...` after any CLI change — that supersedes the generic `gofmt -w` heuristic for that repo.

2. **Repo-signal heuristics** (used when no guidance file directive applies):

   | Signal in scope root | Formatter | Build-graph updater |
   |---|---|---|
   | `go.mod` | `gofmt -w <touched .go files>` | If `BUILD` / `BUILD.bazel` / `.bzl` files were touched OR Go imports changed in any touched file: run the repo's bazel-configure command (`bzl configure` for dd-source / slog; check `CLAUDE.md` for repo-specific aliases). Otherwise no-op |
   | `Cargo.toml` | `cargo fmt -- <touched .rs files>` | No-op |
   | `package.json` with `"prettier"` in deps or devDeps | `prettier --write <touched files>` | No-op |
   | `pyproject.toml` with `[tool.ruff]` configured | `ruff format <touched .py files>` | No-op |
   | No signal matches | No-op (silent) | No-op (silent) |

3. **No-op is the explicit default.** If neither guidance files nor the heuristic table match, Step 3b is a documented no-op — the skill does not invent hooks. Some repos genuinely have no post-edit conventions, and inventing one introduces churn the user didn't ask for. Document the no-op in the round block (`Step 3b: no hooks applicable for this scope`) so the audit trail is explicit, then proceed to Step 4.

## Failure protocol

If a hook exits non-zero:

1. **Log it in the round block.** One line per failure: `Step 3b: <hook> failed: <stderr first line truncated to ~120 chars>`.
2. **Revert the triggering edit.** The hook failed because the edit produced output the formatter / configure step couldn't accept (e.g. a syntax error, an inconsistent BUILD declaration). Restore the pre-edit content of the file:
   - Prefer `git checkout -- <file>` when the scope is a clean git working tree and the only change to that file came from Step 3 this round.
   - If the file had pre-existing dirty changes, restore from the pre-edit snapshot Pi captured before the Step 3 edit/write call (read-then-restore via write) — do not `git checkout` because that would also discard the user's in-progress work.
   - If neither restore path is safe, stop Step 3b for this file, surface the conflict to the user, and let them resolve it. Do not proceed to Step 4 with a half-applied edit and a failed hook.
3. **Demote the finding.** The edit that triggered the failure goes from `valid — fix` (or `valid — judgment-call`) back to `uncertain`, with the hook output as the queue reason. It joins the queued-questions buffer and surfaces at end-of-loop.
4. **Never silently swallow the failure.** Letting a broken edit through pollutes round N+1's Codex output — Codex would re-flag a syntactically invalid file as a critical finding, and the loop would spend tokens chasing a problem Pi could have caught here.

## Interaction with the confirmation run

The confirmation run (Step 5a) does not edit anything — Codex is reviewing, not writing. Step 3b does not fire during the confirmation round. If the confirmation surfaces findings and the loop continues, the next normal round's Step 3 → Step 3b sequence resumes as usual.

## When to extend the heuristic table

If the user invokes this skill on a repo whose ecosystem isn't covered (e.g. Java/Maven, Kotlin/Gradle, Ruby/Bundler), and the repo's `CLAUDE.md` / `AGENTS.md` doesn't specify post-edit hooks, ask the user once at loop start what (if anything) to run. Cache the answer for the rest of the loop. Don't extend this table from a single anecdote — add a row only after the same hook proves correct across multiple repos in that ecosystem.
