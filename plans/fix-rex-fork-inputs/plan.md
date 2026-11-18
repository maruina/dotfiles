# Rex Fork Input Fixes Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit normal source model/session startup selections and show `tab`, `right`, and `below` when the user presses Tab after `/rex-fork `.
**Smallest user-feedback slice:** Allow source model/session startup options and show argument completion on forced Tab after `/rex-fork `.
**Out of Scope:** Global editor/keybinding changes, private Pi API changes, support for custom launch wrappers, `--option=value` syntax not supported by the installed CLI, replaying configuration or initial messages to the destination, unrelated lifecycle-prompt repairs, and changes to other extensions.
**Architecture:** Extend launch validation in `_fork.ts` with an explicit source-argument allowlist. Stack a command-scoped wrapper via `ctx.ui.addAutocompleteProvider` in `index.ts` on `session_start` so forced Tab completion delegates slash-command argument completion with `force: false` for `/rex-fork `.
**Tech Stack:** TypeScript, Node.js built-ins, Pi extension APIs (`ExtensionAPI`, `ExtensionContext`, `addAutocompleteProvider`), Rex JSON APIs, Node test runner.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Workflow selection | Selected relevant guidance. |
| `codebase-research` | skill-loader | Launch and editor behavior | Read launcher, callback, editor Tab dispatch, and public provider APIs. |
| `cli-best-practices` | skill-loader | Command inputs | Preserve strict refusal of unsupported flags and explicit error reporting. |
| `chezmoi` | skill-loader | Managed extension | Edit source in an isolated worktree; apply explicit target files only. |
| `feature-worktree` | prompt-required | Isolated change | Created `maruina/fix-rex-fork-inputs` from fetched main. |
| `write` | skill-loader | Plan and README | State concrete behavior and test limits. |

## Evidence and decisions
- Existing `_fork.ts:launcher` rejects every source argv except empty or exactly `--session <path>`. Ordinary `--provider`, `--model`, and initial slash-command messages therefore fail.
- Pi 1.5.2 `Editor.handleTabCompletion()` passes `force: true` after a command's first space. `CombinedAutocompleteProvider` skips command argument callbacks when forced. A direct reproduction returned all three options without force and zero callback calls with force.
- Pi documents `ctx.ui.addAutocompleteProvider()` in `docs/extensions.md`, Autocomplete Providers. In TUI mode on `session_start`, register a wrapper that delegates `/rex-fork` command text with `force: false`. In non-TUI mode (`ctx.mode !== "tui"`), skip registration. In the supported Pi 1.5.2 TUI, `ctx.ui.addAutocompleteProvider` is a standard API; do not add defensive missing-API fallback branches.
- Allow the installed CLI's source model/session selectors with explicit arity: `--provider`, `--model`, `--models`, `--thinking`, `--session`, `--session-id`, `--session-dir`, `--fork`, `--name`, `-n`; and no-value flags `--continue`, `-c`, `--resume`, `-r`. Permit positional initial messages and the `--` message delimiter but never copy them into the child.
- Reject unknown options, unsupported `--option=value` syntax (the installed CLI's built-in options do not support `=` syntax), missing selector values, and values that are another option (e.g. `--model --provider`). Selector values remain private; error messages name only rejected options.
- Keep the child launch unchanged: installed Node/Pi plus exactly `--session <independent snapshot>` and the existing explicit agent directory/receipt environment. Model/session selections are already represented in persisted source state; accepting them is not permission to replay them.
- Three unrelated lifecycle-prompt tests failed identically on base `706b70d`'s predecessor `8775893` during the original implementation. Confirm current baseline before treating any failure as an exception. Missing feature evidence remains blocking.

### Slice 1: Verified launch validation and forced argument completion
**Delivers:** Both reported failures corrected without weakening pane identity or replaying prompts/configuration.

### Task 1: Allow valid source model and session startup options in _fork.ts
**Delivers:** Source Pi instances started with model/session selectors or initial messages can fork safely without replaying options/messages to the child.
**Blocked by:** None
**Traces to:** Requirement: Safe normal launches
**Files:** `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/exact_extensions/rex-fork/README.md`

- [ ] Install disposable dependencies with `npm ci --ignore-scripts` only in this worktree's `dot_pi/agent`. Use LSP context/references before changing known symbols.
- [ ] Add failing tests in `rex-fork.test.mjs` for source model/session options combined with initial messages; assert the destination argv still ends with only `--session <snapshot>` and contains none of the source options/messages. Assert rejection of unknown configuration/tool/extension flags, `--option=value` syntax, missing values, and values starting with `-` (option as value).
- [ ] Implement the allowlist parser in `_fork.ts:launcher()`. Reject unknown flags, missing arguments, and `--option=value` without printing private values. Update `README.md` launch constraints to describe accepted startup options and rejection behavior.
- [ ] Verify focused deterministic tests pass with `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs`.

### Task 2: Register autocomplete provider wrapper for forced Tab completion in index.ts
**Delivers:** Pressing Tab after `/rex-fork ` offers `tab`, `right`, and `below`.
**Blocked by:** Task 1
**Traces to:** Requirement: Tab shows argument options
**Files:** `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`

- [ ] Add a failing test using real `CombinedAutocompleteProvider` with `force: true` and the registered provider wrapper. Assert all three options for `/rex-fork `, partial filtering, correct insertion, normal completion, and delegation for unrelated commands/paths. Assert that registration runs on `session_start` in TUI mode and is skipped in non-TUI mode (`ctx.mode !== "tui"`).
- [ ] Implement wrapper registration via `ctx.ui.addAutocompleteProvider()` on `session_start` in `index.ts` when `ctx.mode === "tui"`. Intercept `/rex-fork` and `/rex-fork ` lines to delegate with `force: false`. Preserve `getArgumentCompletions` on the command registration.
- [ ] Verify focused deterministic tests pass with `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs`.

### Task 3: Feature-level final verification and regression test suites
**Delivers:** End-to-end verification across deterministic tests, opt-in Rex smoke tests, and full test suites with clean diagnostics.
**Blocked by:** Task 2
**Traces to:** Both acceptance requirements, verification criteria, and clean worktree state
**Files:** `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`

- [ ] Run isolated Rex smoke tests with `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` from `dot_pi/agent`. Extend smoke coverage to prove a source started with model/session selectors and an initial message forks into an independent pane without generating child model turns or network requests.
- [ ] Run `npm test` and `npm run test:all` from `dot_pi/agent`. If confirmed baseline lifecycle-prompt failures occur, verify them against baseline before treating as exceptions.
- [ ] Verify zero LSP diagnostics on touched TypeScript files and verify `git diff --check` passes. Keep disposable dependencies installed until independent verification completes.

## Acceptance contracts
### Requirement: Safe normal launches
The extension SHALL accept the specified source selectors and startup messages without replaying them into the destination.
- GIVEN a source with `--provider`, `--model`, session options, and an initial slash-command message
- WHEN it forks
- THEN one independent destination launches with the existing snapshot-only child argv and no generated model turn.
- GIVEN an unknown flag, configuration-changing flag, `--option=value` syntax, missing selector value, or selector value that is another option
- WHEN it forks
- THEN it refuses before snapshot/creation without printing private values.

### Requirement: Tab shows argument options
The extension SHALL offer `tab`, `right`, and `below` through Pi's forced-completion path.
- GIVEN `/rex-fork ` with the cursor after the space
- WHEN Tab requests forced completion
- THEN all three options are offered and selecting one inserts that option without corrupting the command.
- GIVEN a partial argument
- WHEN Tab requests completion
- THEN only matching options appear.
- GIVEN unrelated command or path text
- WHEN completion runs
- THEN the previous provider receives the original options unchanged.
- GIVEN non-TUI mode
- WHEN the session starts
- THEN provider registration is skipped.

## Validation limits and rollout
### Validation limits
Real provider tests establish Tab dispatch behavior; the isolated Rex/Pi tests establish launch/receipt behavior. Mocked callback tests alone are insufficient. Do not send test model prompts, stop the user's Rex server, or change global dependencies. Keep the base checkout on main.

### Rollout and rollback
1. Obtain fresh independent verification before deployment.
2. Preview changes with `chezmoi diff --source "$PWD" dot_pi/agent/exact_extensions/rex-fork`.
3. Apply only changed explicit `rex-fork` target files from the feature worktree with `chezmoi apply --source "$PWD" ~/.pi/agent/extensions/rex-fork/...`.
4. Verify explicit target file contents match source.
5. In existing Pi sessions, run `/reload` to load the updated extension.
6. Commit source changes and push branch after explicit user authorization.
7. To roll back, restore previous `rex-fork` extension files and `/reload`.
