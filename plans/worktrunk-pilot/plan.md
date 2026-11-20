# Worktrunk Pilot Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Worktrunk through chezmoi and use observable tests to decide which legacy worktree commands it can replace.
**Smallest user-feedback slice:** From a fresh Fish shell, use `git-wt` and the existing `wt` to enter the same registered worktree without moving it or changing the base checkout.
**Out of Scope:** Removing or renaming `wt`, `wtpr`, or `git worktrees-gone`; changing the GitHub account policy, `/pr-validate`, `/pr-cleanup`, `ship-conductor`, or worktree discovery; relocating existing worktrees; enabling Worktrunk merge or automatic cleanup.
**Architecture:** Homebrew installs Worktrunk for both macOS profiles through the existing chezmoi installer. A managed Fish entry exposes the binary as `git-wt`; managed Worktrunk configuration preserves path policy and links `AGENTS.local.md` before a new worktree is used. The legacy commands remain the baseline and fallback.
**Tech Stack:** chezmoi, Homebrew, Fish, Worktrunk, Git, GitHub CLI, and `jq`.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select planning guidance | Matched the package installer, shell integration, CLI, and documentation. |
| `resolve-worktree` | `prompt-required` | Find an upstream design | Checked registered worktrees for a matching design. |
| `feature-worktree` | `prompt-required` | Keep plan writes off `main` | Created a no-track branch and a worktree from fetched `origin/main`. |
| `learning-lookup` | `prompt-required` | Check advisory guidance | Attempted a scoped lookup and recorded the evidence gap. |
| `obsidian-cli` | `agent-selected` | Read the advisory store through its CLI | Used `obsidian read` with the learning filter. |
| `codebase-research` | `skill-loader` | Identify behavior and consumers | Traced Fish helpers, profile roots, Pi review, and Git worktree discovery. |
| `chezmoi` | `skill-loader` | Plan a managed install | Used source-only edits, profile rendering, and exact target previews. |
| `script-best-practices` | `skill-loader` | Plan shell integration and checks | Used native Fish integration and isolated Git fixtures. |
| `cli-best-practices` | `skill-loader` | Validate CLI contracts | Used exit status, Git state, and machine-readable prune output. |
| `write` | `skill-loader` | Prepare the brief and plan | Used observable contracts and explicit stop conditions. |
| `diataxis` | `skill-loader` | Scope the pilot guide | Separated operating and rollback instructions from decision evidence. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Matched affected source and ledger files to skills. |
| `resolve-worktree` | `prompt-required` | Resolve the supplied plan | Selected its owning feature worktree. |
| `feature-worktree` | `prompt-required` | Keep implementation off `main` | Continued on the plan's feature branch. |
| `chezmoi` | `skill-loader` | Modify managed files | Use the feature source and explicit target previews. |
| `script-best-practices` | `skill-loader` | Modify the installer and Fish entry | Preserve existing script style and validate shell syntax. |
| `cli-best-practices` | `skill-loader` | Integrate a CLI | Check coexistence, exit status, and observable Git state. |
| `codebase-research` | `skill-loader` | Understand the shell integration | Inspected the installer, profile roots, and legacy `wt`. |
| `write` | `skill-loader` | Update the plan ledger | Record evidence and limits precisely. |
| `learning-candidates` | `prompt-required` | Record a disproved apply assumption | Recorded the new-directory apply failure and recovery. |
| `diataxis` | `skill-loader` | Write the pilot guide | Separate operating instructions from decision evidence. |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Package installer | `run_onchange_brew-install.sh.tmpl` | Declare the shared macOS Homebrew formula. | Render both profiles, run `bash -n`, preview and verify the live install. |
| Fish entry | `dot_config/private_fish/conf.d/worktrunk.fish` | Register `git-wt` if the Worktrunk binary exists; leave `wt` alone. Set the pilot path template from the existing profile root rather than defining another profile-root table. | `fish -n`; fresh Fish with and without the binary; real switch from the calling shell. |
| Worktrunk user config | `dot_config/worktrunk/config.toml` | Run the user link hook on creation. Do not add merge, approval, or automatic cleanup settings. | Parse with the installed binary; inspect the resulting link and hook behavior. |
| Baseline and policy, unchanged | `dot_config/private_fish/private_config.fish.tmpl`, `dot_config/private_fish/exact_functions/wt.fish`, `dot_config/private_fish/exact_functions/wtpr.fish`, `dot_config/private_fish/exact_functions/git-worktrees-gone.fish`, `dot_gitconfig.tmpl`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_skills/feature-worktree/SKILL.md`, `dot_pi/agent/exact_skills/repo-checkout/SKILL.md` | Define layout, GitHub account rules, and legacy behavior. | Compare outcomes; confirm no source or target changes to the legacy commands. |
| Review and discovery, unchanged | `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_prompts/pr-cleanup.md`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`, `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_worktree.ts` | Preserve fixed review paths, verified detached heads, and Git worktree registration as the source of truth. | Compare Git registration and fixed paths before and after the pilot; no migration of these consumers. |
| Pilot guide and decision | `plans/worktrunk-pilot/pilot.md` | Record commands, rollback, evidence, limits, and a decision for each legacy command. | Replay the guide against the pilot and verify that each recommendation cites its required evidence. |

### Key Decisions
- The user approved the three slices and the separate cutover gate. The conversation is the source of truth; no matching upstream design resolved. Replacing `wt` immediately would reduce command names but would remove the baseline before testing parity.
- Keep `WORKTREES_ROOT` as the profile-root source of truth (`~/dd/.worktrees` for work, `~/src/.worktrees` for personal). Worktrunk documents the `WORKTRUNK_WORKTREE_PATH` override and a centralized template. Its `repo` variable uses the repository directory name. `sanitize` does not lowercase. Test `branch | replace('/', '-') | lower` with the installed binary; Worktrunk uses MiniJinja with built-ins. Treat live render and checkout as the proof, not source inspection alone. Resolve `WORKTREES_ROOT` when the pilot command runs, because Fish loads `conf.d` before `config.fish` defines the profile root. Scope the path override to the pilot invocation. Use the primary repository name when invoked from a linked worktree; legacy `wt.fish` uses the basename of the invoking checkout, so compare path parity from the base and document this linked-worktree difference. If exact slug parity fails, do not accept a new slug or recommend dropping `wt` without user approval.
- Use the synchronous user `pre-start` hook with `primary_worktree_path` and `worktree_path`. It must preserve an existing destination, including a dangling symlink, and do nothing when the primary checkout lacks the source. A background `post-start` hook would not guarantee the file is available when Pi starts.
- Keep GitHub account routing separate from Worktrunk. Do not add a production account wrapper in this pilot. Use routing and restoration during checks to establish whether direct invocation or a later thin wrapper is appropriate.
- Compare cleanup policies rather than replace one with the other. `git worktrees-gone` force-deletes a local branch after removing its clean worktree when its upstream is gone; `wt step prune` checks integration. Neither policy is a proof of the other.
- Advisory lookup: `Datadog/Learnings.md` was skipped because the installed filter rejected the invocation, the source helper lacked its dependency, and the Obsidian call timed out. No advisory result informed this plan. The existing `plans/mermaid-cli/plan.md` shows the scoped installer preview pattern. No conflicting ADR was found in the relevant source.

### Feasibility and stop conditions
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| R1: Managed additive install | Shared Brew bundle and `wt config shell init --cmd git-wt fish` | `brew info` found `homebrew/core/worktrunk`; [Fish integration](https://worktrunk.dev/config/#shell-integration) documents `--cmd`. | Both profile renders, exact script preview, live install and fresh Fish switch. | Stop before applying a bundle with unrelated unreviewed package actions, or if `wt` and `git-wt` cannot coexist. |
| R2: Paths and local guidance | Path template and synchronous user hook | [Worktrunk config](https://worktrunk.dev/config/#worktree-path-template), [hooks](https://worktrunk.dev/hook/), and `wt.fish`. | Installed binary in disposable repositories; observe exact Git registration, path, and link. | Block parity and recommend retaining `wt` until resolved. Do not change roots, slug rules, or existing paths. |
| R3: PR checkout assessment | PR shortcut/URL and existing `gh` account policy | [Worktrunk switch](https://worktrunk.dev/switch/) documents same-repo and fork handling. | Local failure checks plus an authenticated same-repo and fork checkout in dedicated clones where access is approved. | Record inaccessible cases as `BLOCKED`; do not claim PR replacement for missing evidence. |
| R4: Cleanup comparison and decision | Prune dry-run and controlled legacy cleanup | [Worktrunk prune](https://worktrunk.dev/step/#wt-step-prune) and `git-worktrees-gone.fish`. | Inspect structured dry-run output and legacy behavior on equivalent fixtures. | Keep the legacy command if its behavior is required. Do not substitute destructive testing on real repositories. |

### Security and Observability Requirements
- Run `chezmoi --source "$PWD"` from the feature worktree. Never edit rendered targets directly. Do not print work or personal Fish configuration that contains `onepasswordRead` results. Check only the relevant standalone render or report syntax-check status. Do not refresh credentials, print secrets, or push during validation.
- Use separate temporary repositories, remotes, worktree roots, Git config, and Worktrunk config/approval state for fixtures. Do not inherit arbitrary Git hooks or user Worktrunk approvals. Run real PR checks with `--no-hooks`, disable Git hooks for the fixture clone, and do not execute PR code. Do not use `--clobber`, `--yes`, or force on a real repository. Run only one live account-dependent check at a time with a bounded timeout.
- For live GitHub checks, capture the active login with `gh auth status --json hosts`, select `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`, and use `maruina` otherwise. Restore and verify the original login after success, errors, and interruption. A failed restoration is a blocker to further live checks. Do not log raw auth output.
- Record candidate version (`command wt --version`, from Fish), profile, fixture or authorized repository class, invocation, observed path/ref/exit status or structured result, and `PASS`, `FAIL`, or `BLOCKED`. Compare baseline and candidate on equivalent preconditions, not on state changed by an earlier command. No production metrics or sustained load are required for this local CLI pilot.

### Failure Modes to Handle
- Missing binary: Fish startup and the old `wt` remain usable. An unrelated Brew change or package install error blocks the live install; static render evidence is not install evidence.
- Occupied normalized path: do not delete or replace the occupant. Switching to an already registered dirty worktree may succeed, but must not reset, stash, or change its contents. Do not silently repair invalid worktree metadata during validation.
- Missing `AGENTS.local.md` is a no-op. Preserve existing regular files and valid or dangling links. Record and investigate unexpected hook failure before launching Pi.
- Invalid, wrong-repository, or unavailable PR: do not accept a checkout in the wrong repository or at the wrong ref. If the installed tool does not reject it safely, block direct replacement and document the required guard. A locally reused branch can be stale; compare against the collected head SHA and do not reset it to make the check pass.

### Rollout and Rollback
The executing agent owns the additive rollout after plan review. Preview the exact managed installer and config changes. Review the rendered bundle because a scoped script apply can still run multiple package operations. Apply only the reviewed targets and reopen Fish. Use `git-wt` for the pilot; keep `wt` and `wtpr` on disk. Test rollback first in a scratch destination, including how the two managed files are removed or disabled without a broad home-directory apply. On the current machine, roll back through chezmoi source and a scoped apply; an inert installed binary may remain. Do not uninstall it or change Homebrew state as part of rollback without separate approval. Matteo owns the later command cutover decision.

### Test Strategy
Use the installed CLI in a real Fish process for shell behavior, `git worktree list --porcelain` for registration, `git rev-parse` and `git status --porcelain` for Git state, `readlink` for link targets, and `wt step prune --dry-run --format=json` for cleanup. Use copied fixture repositories with equivalent commit graphs for destructive baseline checks. Use a fake `gh` on a scoped `PATH` only for controlled routing or failure simulations; that is not proof of GitHub authentication or remote fork behavior. Start with the focused before-change check `fish -c 'type -q git-wt'` (expected nonzero on a clean baseline); if another tool owns the name, stop. For path and hook changes, run the affected fixture without the pilot settings first, then rerun after the change.

Both profiles must pass render and fixture checks with their respective roots. A live work-profile install on this machine does not prove a live personal-machine install. Approved live fixtures are required for private access and fork recommendations; a gap can leave an additive pilot usable but cannot be reported as a successful replacement. Use a controlled Pi launch from a trusted disposable worktree after link verification; do not launch Pi on an untrusted fork for this check.

## Acceptance Criteria
### Requirement: R1 — Additive managed install
The pilot SHALL expose Worktrunk as `git-wt` without replacing the existing Fish `wt` function.

#### Scenario: Reuse in a fresh Fish shell
- GIVEN the pilot is installed and a branch has a registered worktree at the legacy path
- WHEN a fresh Fish process runs `git-wt switch <branch>` and a separate Fish process runs `wt <branch>` from the base checkout
- THEN both processes report the registered directory as `$PWD`, and neither adds a registration or changes the base checkout's branch or HEAD.

#### Scenario: Binary absent
- GIVEN a fresh Fish process with the pilot entry but no Worktrunk on `PATH`
- WHEN Fish starts and invokes `wt`
- THEN the pilot entry does not emit a startup error and the legacy function remains available.

### Requirement: R2 — Path and guidance parity
The pilot SHALL create worktrees at the legacy profile path and finish linking local guidance before starting a caller in a new worktree.

#### Scenario: Mixed-case feature from a fresh remote base
- GIVEN a mixed-case branch name with a slash, a local `main` behind the fetched `origin/main`, and a source `AGENTS.local.md` in the primary checkout
- WHEN the pilot creates the branch from explicit `origin/main` from a linked worktree under each profile
- THEN it registers `$WORKTREES_ROOT/<repo>/<lowercase-slash-to-dash-slug>`, starts at the expected fetched SHA without an upstream, leaves local `main` unchanged, and the link is available before a launch from the new worktree.

#### Scenario: Existing state stays intact
- GIVEN a path collision, a dirty registered worktree, an existing guidance destination, or an absent guidance source
- WHEN the pilot attempts the applicable switch or setup
- THEN it does not overwrite the collided path, modify dirty contents, replace the destination, or create a dangling link to a missing source. Test these as independent fixtures.

### Requirement: R3 — Evidence-backed PR decision
The pilot SHALL report whether Worktrunk can replace `wtpr` without weakening repository validation or GitHub account routing.

#### Scenario: Authorized PR checkout
- GIVEN an approved PR fixture and the account required for its organization
- WHEN the pilot uses a PR number or URL in a dedicated clone with hooks disabled
- THEN the observed repository and HEAD match the independently collected PR metadata, fork settings match documented behavior when applicable, the base checkout stays on its original branch and SHA, and the original account is restored.

#### Scenario: Failure or unavailable evidence
- GIVEN a malformed, mismatched, denied, or unavailable PR fixture
- WHEN the agent attempts the corresponding check
- THEN it does not report a checkout as valid without a match on repository and SHA; it reports the observed failure or evidence gap and verifies account restoration. No check pushes or runs PR code.

### Requirement: R4 — Safe cleanup comparison and cutover decision
The pilot SHALL provide a decision for each legacy command without moving or removing any real worktree.

#### Scenario: Different cleanup criteria
- GIVEN equivalent fixtures for an integrated branch, a branch with deleted upstream and unmerged commits, a dirty worktree, and a locked worktree
- WHEN the agent compares Worktrunk dry-run output against legacy cleanup in a disposable copy
- THEN the guide explains the actual candidate differences and identifies what each policy preserves. Worktrunk dry-run leaves registrations and refs unchanged.

#### Scenario: No implicit cutover
- GIVEN one or more missing or failed parity checks
- WHEN the agent publishes the pilot result
- THEN it identifies the blocked recommendation and leaves the legacy commands in place. Even if all tests pass, the pilot does not cut over any command.

## Execution
### Slice 1: Install and switch without disrupting wt
#### Task 1: Install the additive pilot and prove existing-worktree reuse
**Delivers:** A managed Homebrew installation and an alternate Fish command that can enter an existing worktree.
**Blocked by:** None
**Traces to:** R1.
**Files:** `run_onchange_brew-install.sh.tmpl`, `dot_config/private_fish/conf.d/worktrunk.fish`; test against `dot_config/private_fish/exact_functions/wt.fish`.

**Evidence.** The baseline `fish -c 'type -q git-wt'` exited 1. `brew bundle check` identified pending updates to `b2-tools`, `gawk`, `gh`, `git`, `go`, `helm`, `typescript-language-server`, and `uv`; Matteo approved those updates and their dependencies before the script apply. The first `git-wt --version` returned 127 because the generated alternate function searches for a `git-wt` binary. The entry supplies Worktrunk's `WORKTRUNK_BIN` override when none is already set.

- [x] Run the focused before-change command. Add the formula to the shared Darwin Brew bundle and manage the alternate Fish integration with the documented shell initializer. Guard the initializer when the binary is absent. Do not use `wt config shell install` to write Fish targets. Baseline exited 1; added the formula and guarded initializer.
- [x] Render the installer for `work` and `personal` with `chezmoi --source "$PWD" --override-data '{"profile":"work"}' execute-template < run_onchange_brew-install.sh.tmpl` and the personal equivalent. Check each captured render with `bash -n` and confirm exactly one `brew "worktrunk"` declaration. Run `fish -n dot_config/private_fish/conf.d/worktrunk.fish`. Both renders passed `bash -n` and contained one declaration; Fish syntax passed.
- [x] Resolve the installer with `chezmoi --source "$PWD" target-path --source-path run_onchange_brew-install.sh.tmpl`. Preview that target with `chezmoi --source "$PWD" apply --dry-run --verbose --include=scripts "$HOME/brew-install.sh"`. Review all package actions the script can take, stop on unreviewed actions, then run `chezmoi --source "$PWD" apply --include=scripts "$HOME/brew-install.sh"`. Preview and apply the Fish entry with `chezmoi diff dot_config/private_fish/conf.d/worktrunk.fish` and `chezmoi apply dot_config/private_fish/conf.d/worktrunk.fish`. Applied the reviewed installer with Homebrew auto-update and cleanup disabled; it upgraded the eight approved formulas and installed Worktrunk v0.82.0. The standalone packages were already installed. Applied and verified the explicit Fish target.
- [x] In fresh Fish processes, verify `type -a git-wt`, `type -a wt`, and `command wt --version`. Test both commands against the same worktree registered by Git, compare `$PWD` and porcelain registration, and rerun the pilot switch to prove reuse. Test missing binary using isolated Fish startup and a restricted `PATH`, not by removing the Homebrew package. Verify the base checkout's branch and SHA did not change. Worktrunk v0.82.0 and both Fish functions were present. In a disposable repository, candidate, legacy, and repeated candidate switches reached the same registered path; registration, base branch, and HEAD stayed unchanged. An isolated Fish with `/usr/bin:/bin` started silently and ran legacy `wt` without the binary. A final `fish -n` command first used a misspelled path; the corrected command passed.
- [x] Commit with `feat(chezmoi): add a side-by-side Worktrunk pilot`.

### Slice 2: Establish path and setup parity
#### Task 2: Preserve legacy paths and local guidance for new worktrees
**Delivers:** An exact path and setup comparison for both profile roots, with failing scenarios isolated from real worktrees.
**Blocked by:** Task 1
**Traces to:** R2.
**Files:** `dot_config/private_fish/conf.d/worktrunk.fish`, `dot_config/worktrunk/config.toml`; test against `dot_config/private_fish/private_config.fish.tmpl` and `dot_config/private_fish/exact_functions/wt.fish`.

**Evidence.** Slice 1 was independently verified, as reported by Matteo. Worktrunk v0.82.0 is installed. The wrapper rejects an unset `WORKTREES_ROOT` rather than constructing a path at the filesystem root. From a linked worktree, Worktrunk uses the primary repository name; legacy `wt` uses the invoking checkout's basename when creating a worktree. A Pi RPC smoke check used an isolated agent directory, offline mode, and no extensions or MCP; it proved process startup after the link check, not model access. The first evidence parser used a Python version-manager shim with a temporary `HOME` and exited 126; `jq` verified the successful RPC response.

- [x] Create temporary Git fixtures with a local bare `origin`, a primary checkout, a linked worktree, and a worktree path containing spaces. Compare against the legacy flow in an equivalent fixture. Simulate a new remote commit and a stale local `main`; fetch and pass `--base origin/main` explicitly for a differently named feature branch. Before adding settings, observe the native layout and absent link. In both profile fixtures, native Worktrunk used `repo.Feature-Example` and created no link; legacy `wt` used `repo/feature-example` and linked guidance. Both used the fetched SHA. The first fixture assertion captured extra Git stdout; a corrected assertion passed.
- [x] In `dot_config/private_fish/conf.d/worktrunk.fish`, define a wrapper function for `git-wt` that resolves `$WORKTREES_ROOT` at invocation time (handling Fish startup order) and sets `WORKTRUNK_WORKTREE_PATH="$WORKTREES_ROOT/{{ repo }}/{{ branch | replace('/', '-') | lower }}"` before calling the underlying Worktrunk handler. In `dot_config/worktrunk/config.toml`, configure the blocking synchronous `pre-start` user hook to link `AGENTS.local.md`. Read the target config through the installed Worktrunk CLI and keep profile-specific secrets outside fixture inputs. Verify both exact logical roots under a temporary home and assert physical path equivalence if the root is a symlink. Retain `--path` only for diagnosis, not as proof of default parity. The installed CLI parsed the source and applied target; Fish syntax passed. Temporary work and personal homes used their exact logical roots, each linked to a physical root containing spaces. No `--path` was used.
- [x] From a linked worktree, run `git-wt switch --create <mixed-case-branch> --base origin/main` through the Fish wrapper. Use `git worktree list --porcelain`, `git rev-parse HEAD`, `git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'`, and `readlink` to assert the path, new SHA, absence of upstream, and link target. Verify the original `main` and the invoking linked worktree stay unchanged. Demonstrate link availability before a launch from a trusted new worktree. Both profile fixtures registered `repo/feature-example` at the fetched SHA, with no upstream and the expected link; base and invoking HEAD stayed unchanged. A trusted `--execute` check verified the link before launching offline Pi RPC, which returned a successful `get_state` response.
- [x] Check a slug collision, dirty worktree reuse, missing source, and existing destination. Cover a tracked regular file and a dangling symlink for destination preservation. Compare contents and refs before and after each check. Rerun R1 after configuring R2. Preview and apply only the reviewed Worktrunk and Fish targets; record any mismatch and do not claim successful parity. Both profile fixtures preserved the occupant and refs on collision, dirty contents and refs on reuse, and existing tracked files or dangling links; missing sources created no link. A valid link, paths containing apostrophes, and a branch with multiple slashes also passed. Existing-worktree reuse, registration, base HEAD, missing-binary startup, and scoped environment override passed again. The first two-file apply created the Fish target but failed because the Worktrunk parent directory did not exist. A directory dry-run showed only the new directory and reviewed config, so the scoped directory apply succeeded; explicit target verification passed.
- [x] Commit with `feat(chezmoi): preserve worktree layout in the Worktrunk pilot`.

### Slice 3: Verify PR behavior and issue the replacement decision
#### Task 3: Compare PR and cleanup behavior
**Delivers:** Reproducible PR and cleanup evidence without a real push, force-delete, relocation, or execution of PR code.
**Blocked by:** Task 1 and Task 2
**Traces to:** R3 and R4.
**Files:** `plans/worktrunk-pilot/pilot.md`; compare `dot_config/private_fish/exact_functions/wtpr.fish`, `dot_config/private_fish/exact_functions/git-worktrees-gone.fish`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_prompts/pr-validate.md`, and `dot_pi/agent/exact_prompts/pr-cleanup.md` without changing them.

**Evidence.** Slice 2 was independently verified, as reported by Matteo. Live PR checkouts require approved fixtures; local checks use isolated repositories. With a denied fake `gh`, malformed and unavailable PR cases exited 1 without changing refs or registrations. A foreign-repository URL caused Worktrunk to query PR 1 in the current repository; denial prevented a checkout, so this does not establish safe URL validation. Three attempts to supply a successful fake API response failed on missing `name`, `ref`, and `title` fields. Execution stopped at the three-attempt limit. Matteo approved resuming with a complete public API response and the public Worktrunk PRs #4848 and #4824. With a complete response and local-only Git remotes, Worktrunk v0.82.0 accepted a foreign-repository URL and created a worktree for the current repository's PR of the same number; direct replacement requires a repository-identity guard.

- [x] Test malformed and failed PR resolution locally. Exercise the account-routing and restoration procedure against an isolated fake `gh` if needed for deterministic failure coverage. Seek authorization or an approved fixture before a live PR checkout. In dedicated clones, test same-repo `git-wt switch pr:<number> --no-hooks` and fork `git-wt switch <PR-URL> --no-hooks`, using fresh state for each. Independently capture expected repository, head SHA, and fork information from `gh`; inspect the checkout and Git remote settings. Test a URL for a different repository without allowing writes to any real checkout. Verify account restoration and unchanged base checkout on every exit. If a case is unavailable, label it `BLOCKED` rather than inferring it from fixtures. Approved public PRs #4848 and #4824 matched collected SHAs and preserved each base checkout; account restoration passed after every live check. A fresh fork retry passed after the evidence script learned that `pushRemote` can contain a URL. Local fixtures showed that a foreign URL can resolve to the current repository and that a stale local branch can be reused; both require guards.
- [x] In equivalent disposable repositories, create the four R4 states. Run `git-wt step prune --dry-run --format=json --min-age=0s` and inspect candidates and reasons. Compare registrations and refs before and after dry-run. Run the unchanged `git worktrees-gone` only in the disposable baseline, with every remote pointing to a local fixture. Record the policy differences and any unexpected skips. Worktrunk reported only the integrated branch and changed no refs or registrations. Legacy cleanup removed the unmerged gone branch, retained the integrated branch, skipped the dirty worktree, and could not remove the locked worktree.
- [x] Record commands, results, and limits in `pilot.md`. Redact private PR details if needed; report the evidence class and result without tokens, account output, or private repository contents. Commit with `docs(chezmoi): record Worktrunk pilot evidence`.

#### Task 4: Publish the pilot guide and rollback procedure
**Delivers:** A short guide that explains when to use `git-wt`, how to revert the trial, and which workflows still use Git or the legacy Fish commands.
**Blocked by:** Task 3
**Traces to:** R1 and R4.
**Files:** `plans/worktrunk-pilot/pilot.md`; review `AGENTS.md` and `dot_pi/agent/AGENTS.md` for guidance impact.

**Evidence.** The rollback check used a separate source and destination, not the live home directory. The first scratch invocation failed because `/dev/null` had no recognized config format; specifying `--config-format toml` passed.

- [x] Document the tested `git-wt` commands, the explicit fetch and remote base rule, `gh` account routing, cleanup preview, and scoped rollback. Prove rollback in a scratch destination and verify `wt` and `wtpr` remain available. Record why repository `AGENTS.md`, Pi `AGENTS.md`, and Pi worktree skills remain unchanged during the pilot: the legacy policy and lifecycle contracts are still authoritative. No existing Worktrunk README or runbook needs migration. Replayed fetch, creation, link, and prune preview in a local fixture. In a scratch chezmoi source and destination, `remove_` entries removed only the two pilot files and fresh Fish retained `wt` and `wtpr`.
- [x] Write one evidence-backed decision for `wt`, `wtpr`, and `git worktrees-gone`: `replace`, `keep a thin wrapper`, or `retain`. Where any gate is blocked, state which test and fixture a later agent needs. Leave all legacy commands in place, regardless of the decision. Commit with `docs(chezmoi): document the Worktrunk pilot and rollback`. The guide retains all three and identifies the linked-worktree difference, PR identity and SHA guards, private-access evidence gap, and incompatible cleanup policies.

#### Task 5: Final verification
**Delivers:** A verified additive pilot, with any incomplete replacement claims identified explicitly.
**Blocked by:** Task 1, Task 2, Task 3, Task 4
**Traces to:** R1, R2, R3, and R4.
**Files:** `run_onchange_brew-install.sh.tmpl`, `dot_config/private_fish/conf.d/worktrunk.fish`, `dot_config/worktrunk/config.toml`, `plans/worktrunk-pilot/pilot.md`.

**Evidence.** The final checks used explicit managed targets and disposable repositories.

- [x] Run `git diff --check origin/main...HEAD`. Review changed paths and explicit chezmoi target diffs. Verify the package and pilot files on the current machine and rerun fresh Fish coexistence and one path-and-link fixture with the installed version. Because the pilot does not edit `dot_pi/agent/`, no Pi dependency install or full Pi suite is required. Check that the original worktree registrations, legacy commands, Pi review paths, and `gh` login were not changed by the pilot. Changed paths matched the contract; target diffs and script dry-run were empty, target verification passed, and Homebrew reported Worktrunk 0.82.0. Fresh Fish reuse and an applied-config path-and-link fixture passed. The original repository worktree list matched the pre-pilot list; legacy and review paths had no diff. Each live PR check verified restoration of the original login.
- [x] Check that each R1–R4 result has evidence or an explicit `BLOCKED` reason, the guide does not imply an untested personal-machine install or PR case passed, and no legacy removal, relocation, or cleanup automation entered the diff. R1 or R2 failure blocks a successful pilot report. A missing approved live PR fixture blocks the corresponding R3 replacement claim. Report the cutover decision separately from the pilot delivery. The guide records R1 and R2 fixture evidence, public same-repository and fork checks, the blocked private-access check, PR identity and stale-branch failures, and R4 policy differences. No legacy removal, relocation, or automated cleanup entered the diff; all cutover decisions are retain.

## Learning candidates
- 2026-11-19: An explicit chezmoi file apply failed when its managed parent directory did not exist; previewing and applying the parent created only the reviewed directory and file — evidence: `chezmoi --source "$PWD" apply "$HOME/.config/worktrunk/config.toml"` returned a parent `stat` error.
