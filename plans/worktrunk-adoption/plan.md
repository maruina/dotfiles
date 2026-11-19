# Worktrunk Adoption Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Worktrunk for worktree workflows, manage its Pi activity extension with chezmoi, migrate Pi guidance, and remove the three legacy Fish functions.
**Smallest user-feedback slice:** Install the upstream activity extension through chezmoi and verify its Pi event behavior without changing worktree commands.
**Out of Scope:** A replacement `wtpr` shell wrapper, automatic cleanup, changing PR-review safety rules, executing untrusted PR code, and claiming private GitHub access or personal-machine validation without evidence.
**Architecture:** Worktrunk owns normal branch-worktree operations and its user config provides a profile-specific default path and the existing synchronous guidance hook. Pi uses the Worktrunk binary directly where appropriate; its managed activity extension reports agent state. Keep fixed-path, detached PR review workflows and their GitHub identity and SHA checks where Worktrunk's PR shortcuts do not satisfy them.
**Tech Stack:** Chezmoi, Fish, Worktrunk v0.82.0, Git, Pi 1.5.2, TypeScript, Node.js.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Plan-stage routing | Selected skills and recorded provenance. |
| `feature-worktree` | prompt-required | Changes and plan require a feature worktree | Reused `maruina/worktrunk-pilot`, which contains the verified pilot. |
| `chezmoi` | skill-loader | Managed configuration and Pi extension | Planned source-only changes, targeted previews, and exact-directory checks. |
| `codebase-research` | skill-loader | Migration crosses commands, Pi guidance, and Worktrunk | Traced existing commands, consumers, upstream extension, and native config. |
| `cli-best-practices` | skill-loader | CLI workflows change | Required noninteractive machine-readable output and explicit failure handling. |
| `script-best-practices` | skill-loader | Fish and test command changes | Required explicit inputs, bounded fixtures, and isolated state. |
| `write` | skill-loader | Plan and agent guidance | Used precise operational language. |
| `diataxis` | skill-loader | User and agent guidance | Kept operational instructions separate from pilot evidence. |
| `learning-lookup` | prompt-required | Advisory planning lookup | Attempted the Obsidian lookup; the CLI timed out. |
| `obsidian-cli` | agent-selected | Learning lookup requires Obsidian | Used the CLI without reading the vault directly; no guidance was returned. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Execution-stage routing | Selected the applicable skills. |
| `resolve-worktree` | prompt-required | Plan is in another worktree | Resolved and worked in the plan's feature worktree. |
| `feature-worktree` | prompt-required | Execution requires a feature worktree | Used the existing `maruina/worktrunk-pilot` worktree. |
| `chezmoi` | skill-loader | Managed Pi extension | Inspected target previews and stopped on unrelated target drift. |
| `codebase-research` | skill-loader | Pi event and subprocess behavior | Inspected the upstream extension, Pi event handling, and existing RPC fixture. |
| `write` | skill-loader | Plan and attribution prose | Recorded the approved timeout and upstream attribution. |
| `diataxis` | skill-loader | Extension refresh guidance | Kept the refresh procedure and license with the extension. |
| `learning-candidates` | prompt-required | Upstream behavior disproved a plan assumption | Evaluated whether the timeout finding met the learning filter. |
| `cli-best-practices` | skill-loader | Direct Worktrunk invocation and structured output | Used explicit, noninteractive fixture commands. |
| `script-best-practices` | skill-loader | Fish and shell invocation fixtures | Used isolated state and quoted arguments. |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Pi activity extension | `dot_pi/agent/exact_extensions/worktrunk.ts`, `dot_pi/agent/exact_extensions/worktrunk/`, `dot_pi/agent/package.json` | Vendor the upstream factory and test Pi event and marker behavior. | Focused Node tests and a real Pi startup/agent-event smoke test. |
| Worktrunk path and hook | `dot_config/worktrunk/config.toml`, `dot_config/worktrunk/config.toml.tmpl`, `dot_config/private_fish/conf.d/worktrunk.fish`, `dot_config/private_fish/private_config.fish.tmpl` | Use profile defaults outside Fish; retain the synchronous `AGENTS.local.md` hook and native Fish navigation. | Isolated work/personal repo fixtures in Fish and Bash. |
| Worktree agent instructions | `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_skills/feature-worktree/SKILL.md`, `dot_pi/agent/exact_skills/repo-checkout/SKILL.md`, `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_prompts/pr-cleanup.md` | Migrate normal worktree steps while preserving independent PR validation and review paths. | Focused lifecycle tests and safety fixtures; record unchanged files when their Git behavior remains necessary. |
| Legacy functions | `dot_config/private_fish/exact_functions/wt.fish`, `dot_config/private_fish/exact_functions/wtpr.fish`, `dot_config/private_fish/exact_functions/git-worktrees-gone.fish` | Remove legacy functions and make native `wt` the interactive command. | Targeted exact-directory preview and fresh-shell checks. |
| Documentation and tests | `plans/worktrunk-pilot/pilot.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs` | Replace obsolete operating instructions, retain dated pilot evidence, and test the cutover. | Focused tests, full Pi tests, and diff review. |

### Key Decisions
- Start with `dev/pi-extension.ts` from the installed Worktrunk release, with its exact version, upstream source URL and commit, upstream content hash, local modification, and applicable license recorded alongside it. The scratch installation of v0.82.0 produced SHA-256 `55083d7e2055c474f7d87ccad4f28bfbd1a8019ce03ff835952155b63075ef5b`, matching the local upstream checkout at `8253cb57fc181affd4f8dd25b14149bc8ff61b97`. Verify the installed release bytes again before vendoring. Add a five-second timeout to each marker command because Pi awaits these handlers; test a hung command. This avoids unmanaged writes to chezmoi's exact extension directory; upgrades require an explicit vendor refresh and reapplication of the timeout.
- Use Worktrunk's native user `worktree-path` config and native Fish initializer. A chezmoi profile template selects `~/dd/.worktrees` for work and `~/src/.worktrees` for personal, with the existing lowercase, slash-to-dash branch mapping. Worktrunk expands `~`. Normal Bash and Pi subprocesses therefore do not depend on a Fish function. Do not add a shell wrapper.
- A caller that overrides `WORKTREES_ROOT` must also provide `WORKTRUNK_WORKTREE_PATH` to Worktrunk. Document and test this limitation; do not claim that arbitrary `WORKTREES_ROOT` overrides propagate automatically.
- Retire `wtpr` without a replacement shell wrapper. Do not accept a PR checkout solely because `wt switch pr:<N>` or a PR URL succeeded: the pilot found a foreign URL could resolve in the current repository and a stale local branch could be reused. Preserve independent repository, account, and HEAD checks. Retain the fixed-path detached review workflow where needed.
- `wt step prune` uses integration criteria, not the old gone-upstream criterion. Show the dry-run preview and do not add automatic cleanup or force deletion.
- Do not add a separate Worktrunk Pi skill if the existing feature-worktree and repo-checkout skills can express the required local workflow. Reconsider only if they cannot express the safety rules without duplication.

### Constraints, Security, and Observability
- Edit the existing clean feature worktree only. Use `chezmoi --source "$PWD"` from that worktree for every chezmoi command. Do not directly edit managed targets. Preview exact directories before applying: they can remove files absent from source.
- Before altering Pi extension behavior, read Pi 1.5.2 extension documentation and relevant examples in full, including linked material. Use LSP before editing known TypeScript symbols and check diagnostics afterward.
- Preserve account routing and restore the original active login after every GitHub success or failure. The live PR fixtures already approved for the pilot are public only; do not make private calls without approved fixtures.
- Run untrusted PR checkouts without executing project code or hooks before validation. Do not use `--clobber`, `--force`, or `--force-delete` in tests against real worktrees.
- Preserve the current review-worktree path and detached HEAD contract, the clean-worktree checks, and SHA verification in `/pr-validate` and `/pr-cleanup`. Update only if necessary; do not route them through a branch-oriented shortcut merely for consistency.
- Worktrunk stores one marker per branch in Git config. The upstream extension clears that marker at session shutdown, so simultaneous Pi sessions in one branch can overwrite or clear each other's markers. Test and document this as an upstream limitation; do not claim per-session accuracy or change upstream code without a separate decision. An abruptly killed Pi can also leave a stale marker.
- Avoid unbounded polling, fan-out, new services, and automatic cleanup. Extension failures must not prevent Pi startup or use, consistent with upstream behavior.

### Failure Modes to Handle
- Missing Worktrunk binary: Fish starts without initializer errors; Pi still starts and works without marker updates.
- Missing or malformed `WORKTRUNK_WORKTREE_PATH`, invalid branches, collisions, or failed hooks: report failure without deleting or resetting existing worktrees or refs. Worktrunk can create a worktree before a later hook fails; inspect JSON and do not retry destructively.
- PR URL and checkout mismatch, stale HEAD, dirty worktree, fork, ambiguous repository, or unavailable GitHub account: reject or stop without executing PR code. Preserve existing account restoration.
- Tracked `AGENTS.local.md`, a valid or dangling symlink at the target, or absent source guidance: preserve the target. Check that the link is complete before Pi starts.

### Rollout and Rollback
Owner: Matteo. Apply only after each changed target has a reviewed preview and its tests pass. Inspect the full exact Fish functions and Pi extensions directory previews, including untracked target files, before applying. Stop rather than remove unrelated files. The extension must be present as a managed source file before applying the exact extensions directory. Roll back by reverting the adoption commits in a feature worktree, previewing the exact targets and applying the reviewed revert; do not remove worktrees, refs, or Git state. Do not run Homebrew cleanup or uninstall Worktrunk as part of rollback.

### Test Strategy and Validation Limits
Use local temporary homes, isolated Git config, local remotes, and isolated hooks. Run executable Node fixture tests through the installed Worktrunk CLI and fresh Fish/Bash processes; assert exact paths, branch refs, registration, HEAD, guidance files, and clean-state preservation. Exercise the Pi factory's actual event handlers and a real Pi agent loop with an isolated temporary agent directory and mock model, so no model or private network access is required. Tests cannot establish private GitHub access, account permissions, personal-machine installation, or accurate markers for concurrent sessions on one branch. Private and personal gaps are accepted for this cutover; do not report them as tested. Stop if the local user config or exact target preview includes unrelated changes.

## Requirements
### Requirement R1: Managed Pi extension
The source SHALL manage the upstream Pi activity extension and keep Pi usable when Worktrunk is unavailable.

#### Scenario: Agent event tracking
- GIVEN an isolated Git worktree and the managed extension
- WHEN Pi starts work, settles, and shuts down
- THEN the worktree branch marker changes to working, idle, and cleared in that order.

#### Scenario: Binary unavailable
- GIVEN a Pi session with Worktrunk absent from PATH
- WHEN agent events fire
- THEN Pi remains usable and no marker command succeeds.

### Requirement R2: Native path and setup
Worktrunk SHALL use the profile's worktree root from both interactive Fish and non-Fish agent processes, and SHALL run the guidance hook before starting Pi.

#### Scenario: Create and reuse
- GIVEN a fetched base and no existing feature worktree
- WHEN Fish or Bash creates `Feature/Example`
- THEN Worktrunk uses the profile root and `repo/feature-example`, checks out the expected base, and creates the guidance link before Pi starts.

#### Scenario: Unsafe state
- GIVEN a collision or an existing guidance target
- WHEN Worktrunk creates or reuses a worktree
- THEN it does not overwrite that target, delete refs, reset dirty work, or alter the base checkout.

### Requirement R3: Safe agent worktree workflows
Pi guidance SHALL use Worktrunk for normal branch worktrees while retaining independent PR repository and SHA validation and the fixed review-worktree safety contract.

#### Scenario: Agent creates a feature worktree
- GIVEN a base checkout and a fetched default branch
- WHEN the documented Pi workflow creates a branch worktree
- THEN it captures the structured result, uses the configured root, and leaves the base checkout on its original branch and HEAD.

#### Scenario: Untrusted or stale PR
- GIVEN a foreign-repository PR URL or a checkout whose HEAD differs from PR metadata
- WHEN Pi resolves the PR
- THEN it rejects the mismatch before using that checkout for review or executing PR code.

### Requirement R4: Retire old commands without automatic cleanup
Chezmoi SHALL remove the three legacy Fish functions and make Worktrunk's native `wt` command available in a fresh shell.

#### Scenario: Fresh shell and cleanup preview
- GIVEN the reviewed cutover is applied
- WHEN a fresh Fish shell runs `wt --version` and `wt step prune --dry-run --format=json`
- THEN `wt` is Worktrunk, the preview is parseable, and worktrees and refs are unchanged.

#### Scenario: Legacy functions removed
- GIVEN the reviewed exact Fish functions directory has been applied
- WHEN a fresh shell checks `wtpr` and `git-worktrees-gone`
- THEN neither legacy function is available, and no worktree is deleted merely by applying chezmoi.

## Execution
### Slice 1: Show Pi activity in Worktrunk
### Task 1: Manage and verify the upstream Pi extension
**Status:** Complete. The user approved using the upstream extension as a starting point with a timeout and including the existing `rex-fork` test entry when applying `~/.pi/agent/package.json`. After fetching, `origin/main` was `18a8477` and the feature branch was zero commits behind.

**Evidence:** The installed v0.82.0 extension matched the planned upstream SHA-256. The local extension differs only by the five-second timeout. `npm ci --ignore-scripts` succeeded; `node --experimental-strip-types --test exact_extensions/worktrunk/activity.test.ts` passed five tests, including real Pi RPC with and without the binary, a shared marker, and a hung subprocess. The same focused test passed from the applied target. `npm run test:unit` passed 461 tests and skipped three Rex startup tests. TypeScript diagnostics were empty after dependency installation. The explicit target previews and verification passed; only the approved Worktrunk files and package test entries were applied. Existing `AGENTS.md` guidance needs no change for this slice; the extension README records its refresh and limitations.

**Delivers:** A chezmoi-managed Pi extension that exposes working and idle markers without changing worktree commands.
**Blocked by:** None
**Traces to:** R1
**Files:** `dot_pi/agent/exact_extensions/worktrunk.ts`, `dot_pi/agent/exact_extensions/worktrunk/`, `dot_pi/agent/package.json`

- [x] Inspect the exact extension directory target and upstream license. Confirm installed Worktrunk v0.82.0's embedded extension matches the stated SHA-256 in a temporary `PI_CODING_AGENT_DIR` using `PI_CODING_AGENT_DIR="$TMP_AGENT" wt config plugins pi install --yes`; do not install directly into the managed target.
- [x] Add focused failing tests in `dot_pi/agent/exact_extensions/worktrunk/activity.test.ts` for `agent_start`, `agent_settled`, `session_shutdown`, missing binary, a hung marker command, and multiple sessions on one branch. Test the documented shared-marker limitation rather than asserting per-session isolation.
- [x] Vendor the upstream extension as `dot_pi/agent/exact_extensions/worktrunk.ts` for Pi's top-level extension discovery, adding a five-second command timeout. Place source attribution, version, upstream hash, modification, license, and refresh instructions under `dot_pi/agent/exact_extensions/worktrunk/README.md`. Add the test to `test:unit` in `dot_pi/agent/package.json`.
- [x] Add an isolated RPC fixture with a local mock provider, following `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts`. Have `activity.test.ts` launch Pi in RPC mode with the managed extension and the mock provider, drive a prompt, inspect the real branch marker after `agent_start` and `agent_settled`, and verify it clears after shutdown; do not use a network model. Run `cd dot_pi/agent && npm ci --ignore-scripts && node --experimental-strip-types --test exact_extensions/worktrunk/activity.test.ts`; expect all tests to pass.
- [x] Preview and apply only the extension target when the exact-directory preview is safe. Verify its managed content and leave dependencies installed until full Pi verification completes. The user also approved applying the package target with the existing `rex-fork` entry.
- [x] Commit with `feat(pi): manage Worktrunk activity extension`.

### Slice 2: Make Worktrunk paths work for Pi and Fish
### Task 2: Configure profile paths for non-Fish processes
**Status:** Complete. Slice 1 was independently verified, as reported by Matteo. Merged `origin/main` at `8bb2f07` to preserve the verified Slice 1 commit.

**Evidence:** The initial tests failed because the template did not exist. After implementation, the first run exposed macOS `/var` and `/private/var` aliases; comparing resolved link targets corrected the fixture without changing the path requirement. `node --test dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs` and `npm run test:worktrunk` each passed 16 tests. Both profile renders, direct Bash, pilot Fish, local fetched-base creation, collision and dirty-state preservation, target variants, explicit override, and isolated Pi link access passed. JavaScript diagnostics were empty. The reviewed work-profile config target was applied and verified explicitly; the fixture and package targets were not applied because this slice applies only the config target. Existing pilot guidance remains valid; the planned Slice 3 documentation task covers the cutover and override limitation. Source dependencies remain installed for final Pi verification.

**Delivers:** A profile-rendered Worktrunk path and the existing synchronous guidance hook for direct binary invocations and the pilot Fish command.
**Blocked by:** Task 1
**Traces to:** R2
**Files:** `dot_config/worktrunk/config.toml`, `dot_config/worktrunk/config.toml.tmpl`, `dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs`, `dot_pi/agent/package.json`

- [x] Add a failing fixture test in `dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs` for both profile roots and direct Bash invocation, including spaces, apostrophes, mixed-case and multi-slash branches, a registered worktree, source guidance, collision, dirty state, existing guidance, and absent source.
- [x] Replace `dot_config/worktrunk/config.toml` with `dot_config/worktrunk/config.toml.tmpl` to prevent duplicate-target errors, configuring profile-specific native `worktree-path` and retaining the synchronous pre-start hook. Preserve Worktrunk's literal template syntax through chezmoi rendering.
- [x] Add `test:worktrunk` to `dot_pi/agent/package.json` to execute `worktrunk-cutover.test.mjs`. Run `node --test dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs`; expect passing direct Bash and pilot Fish scenarios for both profile renders. Assert a separate `WORKTRUNK_WORKTREE_PATH` override works and that a bare `WORKTREES_ROOT` override is not presented as supported by direct Worktrunk.
- [x] In a fixture, launch an isolated Pi process after creating a worktree and verify that it sees the link. Check SHA, refs, registrations, dirty files, and base HEAD before and after.
- [x] Preview and apply the config target only if the preview shows no unrelated changes; verify the explicit target. Commit with `feat(chezmoi): configure Worktrunk paths for agents`.

### Slice 3: Switch workflows and retire legacy commands
### Task 3: Cut over commands and Pi guidance
**Status:** Complete. Matteo confirmed Slice 2 was verified, approved removing the Git alias that calls the retired cleanup function, and directed execution to proceed without PR safety tests. The PR identity and HEAD checks in `feature-worktree` are instructions for Pi, not an executable guard; their runtime enforcement is not verified.

**Evidence:** The Worktrunk fixture passed 20 tests after the direction to skip PR safety tests. Before that direction, the combined Worktrunk and lifecycle run passed 81 tests. `fish -n`, JavaScript diagnostics, and `git diff --check` passed. The initial cleanup fixture assumed line-delimited JSON; Worktrunk returned a JSON array, and the corrected fixture passed. The exact Fish directory dry run showed only the three intended deletions and no unmanaged files. The Git config preview showed only the approved alias removal. Applied and verified the Fish directory, initializer, Git config, Pi guidance, and lifecycle test target; refs and worktree registrations stayed unchanged. A fresh Fish shell loaded Worktrunk v0.82.0 and found neither legacy function; the Git alias was absent. The real cleanup dry run returned a parseable array and left refs and registrations unchanged. The Worktrunk fixture and package targets remain unapplied: their installed fixture resolves the default chezmoi source, which does not contain this feature branch until it lands. Apply them after the source checkout includes this branch; no target test is claimed.

**Delivers:** Native `wt` in Fish, updated Pi branch-worktree guidance, and removal of the three legacy functions and their Git cleanup alias without automatic cleanup.
**Blocked by:** Task 2
**Traces to:** R2, R3, R4
**Files:** `dot_gitconfig.tmpl`, `dot_config/private_fish/conf.d/worktrunk.fish`, `dot_config/private_fish/private_config.fish.tmpl`, `dot_config/private_fish/exact_functions/wt.fish`, `dot_config/private_fish/exact_functions/wtpr.fish`, `dot_config/private_fish/exact_functions/git-worktrees-gone.fish`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_skills/feature-worktree/SKILL.md`, `dot_pi/agent/exact_skills/repo-checkout/SKILL.md`, `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_prompts/pr-cleanup.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs`, `plans/worktrunk-pilot/pilot.md`

- [x] Add failing tests for native `wt` shell navigation, `wt --version`, missing binary, no legacy functions, default path, and a parseable non-mutating cleanup preview. Per Matteo's direction, do not add or run PR safety tests; keep the existing fixed-review-path guidance.
- [x] Replace the pilot Fish wrapper with the native Worktrunk initializer; remove the three legacy functions and the `git worktrees-gone` alias that calls the retired function. Update profile guidance and existing Pi skills to invoke Worktrunk directly for normal feature worktrees. Preserve verified PR identity, SHA, account routing, and detached review behavior; keep `/pr-validate` and `/pr-cleanup` unchanged if their existing contracts remain correct.
- [x] Update `plans/worktrunk-pilot/pilot.md` to distinguish historical pilot decisions from current operating instructions, document preview-only cleanup, the `WORKTREES_ROOT` override limitation, and the extension's shared-branch marker limitation. Do not remove pilot evidence.
- [x] Run `node --test dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs` and `fish -n dot_config/private_fish/conf.d/worktrunk.fish`. Do not run the full lifecycle test file because it contains PR safety tests.
- [x] Inspect and preview explicit changed targets and the exact Fish functions directory (`chezmoi --source "$PWD" diff ~/.config/fish/functions`). Apply `~/.config/fish/functions` only if all removals are reviewed and no unrelated files are affected. Verify with a fresh Fish shell, assert file absence (`test ! -e`) for the removed legacy functions (`wt.fish`, `wtpr.fish`, `git-worktrees-gone.fish`), and run `chezmoi --source "$PWD" verify` on retained explicit target files.
- [x] Commit with `feat(chezmoi): adopt Worktrunk worktree workflows`.

### Slice 4: Verify the full cutover
### Task 4: Final verification
**Status:** Complete. Matteo reported that Gemini verified Slice 3 and authorized Slice 4. PR safety tests remain excluded.

**Evidence:** Fetched `origin/main` at `8bb2f07`; the feature branch was zero commits behind. `git diff --check origin/main...HEAD` passed, and the 20 changed paths map to the adoption plan or the verified pilot, including the pilot's Homebrew declaration. `npm ci --ignore-scripts` succeeded with zero reported vulnerabilities. From `dot_pi/agent`, `node --test exact_scripts/worktrunk-cutover.test.mjs` passed 20 tests; `node --experimental-strip-types --test exact_extensions/worktrunk/activity.test.ts` passed five tests, including real Pi RPC marker transitions, missing binary, shared marker, and the hung-command timeout. The selected non-PR unit files passed 265 tests with three Rex startup tests skipped. `npm run test:copycat`, `test:rex-recovery`, and `test:rex-naming` passed 16, 11, and seven tests; `test:skills:profiles` validated 46 skills per profile; `test:pi-deps` and offline `test:smoke` passed. Diagnostics for the extension, activity tests, and RPC fixture were empty. Unfiltered `npm test`, `npm run test:all`, the lifecycle prompt suite, and PR safety tests were not run after Matteo's direction; the three Rex tests and omitted suites remain coverage gaps. Source dependencies remain installed.

The selected unit command was `node --experimental-strip-types --test exact_extensions/context-kit/*.test.ts exact_extensions/files/*.test.ts exact_extensions/lsp/__tests__/lsp.test.mjs exact_extensions/compute-guardrails.test.mjs exact_extensions/cost-optimization.test.mjs exact_extensions/session-tags.test.mjs exact_extensions/statusline.test.mjs exact_extensions/to-html.test.mjs exact_extensions/user-context.test.mjs exact_extensions/jira/*.test.ts exact_extensions/pi-client-session-id/*.test.ts exact_extensions/rex-fork/rex-fork.test.mjs`. The other Pi commands used `npm run` with each script name above.

For each profile, `chezmoi --source "$PWD" --override-data '{"profile":"<profile>"}' execute-template --file dot_config/worktrunk/config.toml.tmpl` rendered the expected root and `pre-start` hook. The fixture tests exercised direct Bash and Fish creation, the guidance link before Pi starts, dirty and collision cases, and both profile paths. Eleven explicit installed targets passed `chezmoi --source "$PWD" verify`; the package and Worktrunk fixture targets are still deferred until the default source includes this branch. The three legacy function files and global Git alias were absent. A fresh Fish shell loaded `wt v0.82.0`; `wt step prune --dry-run --format=json` produced a parseable five-candidate array without changing refs or worktree registrations. `gh auth status --json hosts` showed the originally active `maruina` account; no account switch or private PR call was made. Private GitHub access, account routing in a private fixture, personal-machine installation, and runtime enforcement of Pi's PR safety instructions remain unverified.

**Delivers:** Feature-level evidence and an explicit report of accepted gaps.
**Blocked by:** Task 3
**Traces to:** R1, R2, R3, R4
**Files:** `plans/worktrunk-adoption/plan.md`

- [x] Run `git diff --check origin/main...HEAD` and inspect `git diff --stat origin/main...HEAD`; confirm every changed file maps to this plan or the verified pilot.
- [x] Run applicable Pi tests without PR safety tests, per Matteo's direction. Do not run the unfiltered `npm test` or `npm run test:all`, because they include PR safety tests; report that coverage gap. Run the focused fixture tests (`node --test dot_pi/agent/exact_scripts/worktrunk-cutover.test.mjs`) and Pi diagnostics after nontrivial TypeScript edits. Keep disposable source dependencies until the required full suites can be run, per repository guidance.
- [x] Verify explicit chezmoi targets, both profile renders, fresh Fish, direct Bash, non-destructive cleanup preview, guidance hook, markers, account restoration, and the legacy function removals. Record exact commands and results; do not infer private-access or personal-machine success.
- [x] Commit the final evidence if the plan changes, with `docs(chezmoi): record Worktrunk cutover verification`. Request independent `/verify` before publishing or merging.

## Learning candidates
- 2026-11-19: Worktrunk v0.82.0's Pi extension awaits marker commands without a timeout, and Pi awaits `agent_start` before the first request; a hung marker process can block the run — evidence: `dot_pi/agent/exact_extensions/worktrunk.ts` and the Pi 1.5.2 extension execution path.
