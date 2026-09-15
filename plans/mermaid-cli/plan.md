# Mermaid CLI Installation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Mermaid CLI through the shared chezmoi-managed Homebrew bundle so Presenterm can render Mermaid diagrams for both work and personal profiles.
**Out of Scope:** Presentation content, pre-rendered diagram assets, other Homebrew changes, and Homebrew script refactoring.
**Architecture:** Add the existing `mermaid-cli` Homebrew formula to the shared macOS bundle. Apply the run-on-change script through chezmoi, then validate the installed `mmdc` executable with a temporary diagram.
**Tech Stack:** chezmoi, Go text templates, Bash, Homebrew Bundle, Mermaid CLI

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires language and domain skill selection. | Identified shell, chezmoi, research, and writing guidance. |
| `resolve-worktree` | `prompt-required` | No design path was supplied. | Enumerated dotfiles worktrees and confirmed no applicable design exists. |
| `codebase-research` | `skill-loader` | The change must preserve the existing package-management pattern. | Confirmed the shared Brew bundle, package ordering, repository state, and formula availability. |
| `script-best-practices` | `skill-loader` | The affected file is a run-on-change Bash template. | Limited the edit to one declarative line and selected rendered-shell syntax validation. |
| `chezmoi` | `skill-loader` | The package must be managed from the chezmoi source. | Selected source editing, diff, apply, and target-state validation. |
| `write` | `skill-loader` | The plan is a human-readable execution artifact. | Kept the plan concise and explicit about scope and failure behavior. |
| `obsidian-cli` | `prompt-required` | `/plan` requires an advisory learning lookup. | Read `Datadog/Learnings.md` through Obsidian. |

## Source of Truth
- Confirmed planning alignment in the originating conversation.
- `run_onchange_brew-install.sh.tmpl` is the package source of truth.
- `brew info mermaid-cli` reports Homebrew formula `mermaid-cli` 11.17.0 and executable `mmdc` is not currently installed.
- This plan is intentionally separate from the private presentation repository. It contains no internal presentation examples.

## Scope
### Files
- Modify `run_onchange_brew-install.sh.tmpl`.
- Update this plan only as the execution ledger.

### Implementation constraints
- Add `brew "mermaid-cli"` to the shared Darwin `brew bundle` block so both profiles receive it.
- Preserve alphabetical ordering near `mergiraf` and `opentofu`.
- Do not add a work-profile condition.
- Do not run `brew install mermaid-cli` directly.
- Do not refactor or reformat unrelated package declarations.
- Render the template against the initialized chezmoi configuration. Do not use `chezmoi execute-template --init`.
- Stop if applying the script would include unrelated chezmoi changes.

## Advisory learning lookup
Matched section: **Render piped chezmoi templates against an initialized config, not `--init`**.

Apply it by using the existing initialized configuration when rendering `run_onchange_brew-install.sh.tmpl`. Current repository and Homebrew behavior remain authoritative.

## Acceptance criteria
### Requirement: Shared managed dependency
The chezmoi source SHALL declare `mermaid-cli` exactly once in the shared macOS Homebrew bundle.

#### Scenario: Both profiles use the declaration
- GIVEN `run_onchange_brew-install.sh.tmpl` renders for macOS
- WHEN the template is rendered with either initialized profile
- THEN the rendered Brew bundle contains `brew "mermaid-cli"`
- AND the declaration is not inside the work-only block

### Requirement: Valid installation script
The rendered Homebrew installation script SHALL remain valid Bash.

#### Scenario: Render and parse
- GIVEN the modified template
- WHEN it is rendered through the initialized chezmoi configuration and checked with `bash -n`
- THEN rendering and syntax validation succeed

### Requirement: Working Mermaid renderer
The installed `mmdc` SHALL render a valid Mermaid flowchart.

#### Scenario: Render a temporary fixture
- GIVEN chezmoi has applied the changed run-on-change script
- WHEN `mmdc` renders a temporary `flowchart LR` input
- THEN the command exits successfully
- AND produces a non-empty output file

## Validation
- `brew info mermaid-cli` MUST resolve the expected Homebrew formula.
- `chezmoi --source "$PWD" execute-template < run_onchange_brew-install.sh.tmpl | bash -n` MUST pass from this worktree.
- `git diff -- run_onchange_brew-install.sh.tmpl` MUST show only the intended formula declaration.
- `chezmoi --source "$PWD" apply --dry-run --verbose --include=scripts` MUST select only the changed Homebrew run-on-change script.
- `chezmoi --source "$PWD" apply --include=scripts` MUST complete successfully.
- `mmdc --version` MUST report an installed version.
- `printf 'flowchart LR\n  A[Start] --> B[Done]\n' > /tmp/pi-mermaid-smoke.mmd && mmdc -i /tmp/pi-mermaid-smoke.mmd -o /tmp/pi-mermaid-smoke.svg && test -s /tmp/pi-mermaid-smoke.svg` MUST pass; remove both temporary files afterward.
- `git diff --check` MUST pass.
- `git status --short` MUST contain only the planned source and ledger changes before commit.

## Operational impact
- **Security:** The formula is public and contains no credentials or work-only data.
- **Failure behavior:** If `mmdc` installs but cannot launch its browser dependency, stop and report the exact error. Do not install another browser or add Puppeteer configuration without approval.
- **Rollout:** Apply the changed chezmoi script on this machine, then push the feature branch for normal review.
- **Rollback:** Revert the package declaration. Because `brew bundle` does not remove undeclared formulas by default, uninstall `mermaid-cli` explicitly only if runtime rollback is required.
- **Observability:** Command exit status, `mmdc --version`, and the rendered fixture are sufficient for this local dependency.
- **Documentation:** No README, runbook, or `AGENTS.md` update is required for one package declaration.

## Tasks
### Task 1: Declare and validate Mermaid CLI
**Delivers:** A shared chezmoi declaration and a working `mmdc` installation.
**Blocked by:** None
**Traces to:** Shared managed dependency, valid installation script, and working Mermaid renderer requirements
**Files:** `run_onchange_brew-install.sh.tmpl`, `plans/mermaid-cli/plan.md`

- [ ] Confirm the worktree is clean apart from this committed plan and that `mmdc` is not already available.
- [ ] Add `brew "mermaid-cli"` once in alphabetical order inside the shared Darwin Brew bundle.
- [ ] Render the template with `chezmoi --source "$PWD" execute-template` and run `bash -n`; expect success.
- [ ] Inspect the source diff; expect only the new formula declaration.
- [ ] Run a dry-run script apply; expect only the changed Homebrew run-on-change script.
- [ ] Apply only changed scripts through this worktree's chezmoi source; expect Homebrew to install `mermaid-cli`.
- [ ] Run `mmdc --version` and the specified temporary flowchart render; expect a non-empty SVG, then remove both temporary files.
- [ ] Run `git diff --check`; expect no errors.
- [ ] Inspect documentation and repository guidance; record that no update is needed unless execution finds a durable package-management trap.
- [ ] Update this plan ledger with command outcomes.
- [ ] Commit the source and ledger changes with `chore(brew): install mermaid cli`.
