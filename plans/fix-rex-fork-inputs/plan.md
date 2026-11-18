# Rex fork input fixes
**Goal:** Permit normal source model/session startup selections and show `tab`, `right`, and `below` when the user presses Tab after `/rex-fork `.
**Approved scope:** The user approved these two fixes and retaining rejection of flags that change tools, extensions, or security behavior. Do not replay source startup messages or arbitrary flags into the destination. Keep existing snapshot, local identity, and single-attempt creation checks.
**Architecture:** Extend the existing launch validation with an explicit source-argument allowlist. Stack a command-scoped wrapper through public `ctx.ui.addAutocompleteProvider` so forced Tab completion uses slash-command argument completion only for `/rex-fork `.
**Out of scope:** Global editor/keybinding changes, private Pi API changes, support for custom launch wrappers, unrelated lifecycle-prompt repairs, and changes to other extensions.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| skill-loader | prompt-required | Workflow selection | Selected relevant guidance. |
| codebase-research | skill-loader | Launch and editor behavior | Read launcher, callback, editor Tab dispatch, and public provider APIs. |
| cli-best-practices | skill-loader | Command inputs | Preserve strict refusal of unsupported flags and explicit error reporting. |
| chezmoi | skill-loader | Managed extension | Edit source in an isolated worktree; apply explicit target files only. |
| feature-worktree | prompt-required | Isolated change | Created `maruina/fix-rex-fork-inputs` from fetched main. |
| write | skill-loader | Plan and README | State concrete behavior and test limits. |

## Evidence and decisions
- Existing `_fork.ts:launcher` rejects every source argv except empty or exactly `--session <path>`. Ordinary `--provider`, `--model`, and initial slash-command messages therefore fail.
- Pi 1.5.2 `Editor.handleTabCompletion()` passes `force: true` after a command's first space. `CombinedAutocompleteProvider` skips command argument callbacks when forced. A direct reproduction returned all three options without force and zero callback calls with force.
- Pi documents `ctx.ui.addAutocompleteProvider()` in `docs/extensions.md`, Autocomplete Providers. Delegate unrelated text, insertion behavior, and file-completion eligibility to the existing provider. For matching command text, delegate suggestions with `force: false`; do not replace the editor or patch Pi.
- Allow the installed CLI's source model/session selectors with explicit arity: `--provider`, `--model`, `--models`, `--thinking`, `--session`, `--session-id`, `--session-dir`, `--fork`, `--name`, `-n`; and no-value `--continue`, `-c`, `--resume`, `-r`. Permit positional initial messages and the `--` message delimiter but never copy them into the child. Reject unknown options and missing selector values. Selector values remain private; error messages name only rejected options.
- Keep the child launch unchanged: installed Node/Pi plus exactly `--session <independent snapshot>` and the existing explicit agent directory/receipt environment. Model/session selections are already represented in persisted source state; accepting them is not permission to replay them.
- Three unrelated lifecycle-prompt tests failed identically on base `706b70d`'s predecessor `8775893` during the original implementation. Confirm current baseline before treating any failure as an exception. Missing feature evidence remains blocking.

### Task 1: Fix source launch validation and forced argument completion
**Delivers:** Both reported failures corrected without weakening pane identity or replaying prompts/configuration.
**Blocked by:** None
**Traces to:** Both acceptance requirements and the approved launch-argument policy.
**Files:** `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/exact_extensions/rex-fork/README.md`

- [ ] Install disposable dependencies with `npm ci --ignore-scripts` only in this worktree's `dot_pi/agent`. Use LSP context/references before changing known symbols.
- [ ] Add failing tests for source model/session options combined with initial messages; assert the destination argv still ends with only `--session <snapshot>` and contains none of the source options/messages. Reject unknown configuration/tool/extension flags and missing values.
- [ ] Add a failing test using real `CombinedAutocompleteProvider` with `force: true` and the registered provider wrapper. Assert all three options for `/rex-fork `, partial filtering, correct insertion, normal completion, and delegation for unrelated commands/paths. Exercise wrapper registration after session startup/reload and avoid headless registration.
- [ ] Make the smallest implementation and update the README's launch constraints. Preserve `getArgumentCompletions` for normal suggestions.
- [ ] Run `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` and `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` from `dot_pi/agent`. Extend real isolated smoke coverage so a source launched with model/session selectors and an initial message can fork without generating a child model turn; use no network model request in tests.
- [ ] Run `npm test` and `npm run test:all`, and run short-circuited checks separately if confirmed baseline failures stop them. Keep dependencies until both suites and independent verification finish. Obtain diagnostics and `git diff --check`.
- [ ] Obtain fresh independent verification before deployment. Apply only changed explicit `rex-fork` target files with the feature worktree as `--source`; verify explicit target bytes. Commit and push the fix with a Conventional Commit message. Do not merge without user authorization.

## Acceptance contracts
### Requirement: Safe normal launches
The extension SHALL accept the specified source selectors and startup messages without replaying them into the destination.
- GIVEN a source with `--provider`, `--model`, session options, and an initial slash-command message
- WHEN it forks
- THEN one independent destination launches with the existing snapshot-only child argv and no generated model turn.
- GIVEN an unknown flag, configuration-changing flag, or missing selector value
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

## Validation limits and rollout
Real provider tests establish Tab dispatch behavior; the isolated Rex/Pi tests establish launch/receipt behavior. Mocked callback tests alone are insufficient. Do not send test model prompts, stop the user's Rex server, or change global dependencies. Keep the base checkout on main. Existing Pi sessions require `/reload` after a verified targeted deployment.
