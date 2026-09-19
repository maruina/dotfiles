# Tavily CLI and Skills Migration Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the personal-profile `tavily_api` REST extension (deprecated auth form, fake research capability) with Tavily's recommended agent integration: the `tavily-cli` (`tvly`) installed via `uv` on the personal profile only, and the eight upstream Tavily skills vendored unmodified into the personal profile.
**Out of Scope:** Fixing the REST extension (superseded by retirement); a Tavily MCP server through `mcp-cli` (considered, but the CLI plus the upstream skills give richer search/extract/crawl/map/research guidance and a scriptable `--json` surface); `tvly login`/OAuth flows (env-var auth only); changes to the work profile beyond removing dead Tavily config.
**Architecture:** Web search moves from a custom registered tool to the CLI-plus-skills pattern: the profile-gated `run_onchange_tavily-cli-install.sh` installs `tvly` on the personal profile only (PyPI via `uv`; no Homebrew formula exists), the eight skills vendor into `dot_pi/agent/exact_skills_personal/` with `VENDOR.md` pins so `/sync-vendored-skills` refreshes them, and `web-search.ts` is deleted so the `exact_` prefix removes the target. Authentication stays `TAVILY_API_KEY` from 1Password via the personal fish block; the CLI reads the env var and no credential lands on disk.
**Tech Stack:** chezmoi (Go `text/template`, `.chezmoiignore`, `run_onchange_` scripts), pi agent skills (Agent Skills standard), `uv tool install` (Astral `uv` 0.12.17), Fish-exported `TAVILY_API_KEY` (1Password-backed), Bash.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | `/plan` entry gate | Determined which skills to load |
| `chezmoi` | skill-loader | All changes are chezmoi-source files | Source layout, prefixes, `exact_` semantics, validation commands, completion workflow |
| `codebase-research` | skill-loader | Correctness depends on existing patterns and profile gating | Staged discovery of the extension, prompts, scripts, settings, `.chezmoiignore`, git history |
| `script-best-practices` | skill-loader | New `run_onchange_tavily-cli-install.sh` and shell verification snippets | Install-script shape, quoting, error handling, and safe verification commands |
| `write` | skill-loader | Plan is a prose artifact | Brief and plan drafting rules |
| `resolve-worktree` | prompt-required | `/execute` plan-path resolution | Resolved the plan to the `maruina-tavily-cli-skills` worktree and switched context |

### Execution
No additional execution-stage skills beyond the planning set plus `resolve-worktree`. `chezmoi` guided apply/diff scoping and the worktree `--source` pattern; `script-best-practices` confirmed the guarddog-mirror script shape was already idiomatic. All edits were textual (shell, Markdown, ignore rules), so no LSP tools applied.

## Deviations
- Task 1: full `cm diff`/`cm apply` is blocked by an unrelated ambient issue — `op://Private/Opencode/api-key` (fish template line 92, untouched by this plan) now matches two 1Password items, so the fish template cannot render. Verified script-scoped instead (`cm apply ~/tavily-cli-install.sh`, exit 0).
- Task 2: upstream HEAD at vendor time is `778122e5f9c680f541eeceda5a5b36405eb7980c`, newer than the plan-time pin `017fc3cc…`.
- Task 3: `cm apply ~/.config/fish/config.fish` deferred to Task 4 (blocked by the same Opencode ambiguity); the fish source edit is render-verified and committed.
- Task 4: fish-target `cm diff` skipped for the same reason; `skills_personal` and `extensions` diffs are empty.

## Planning alignment brief
**Source of truth:**
- Request: verify `tavily_api` usage in `web-search.ts`; adopt Tavily's recommended agent integration (tavily-cli + skills ported to pi); personal profile only.
- Upstream: https://docs.tavily.com/documentation/tavily-cli and https://github.com/tavily-ai/skills (skills pinned at vendor time; latest commit touching `skills/` at planning time: `017fc3cc94be30cd7fbaab06639c245534172639`).

**Scope classification:** Medium — bounded personal-dotfiles work across four components (extension, skills, install script, fish config) with one resolved design decision (retire vs. fix).

**Planning entry:** Planning started directly from `/plan`; there is no sibling `design.md` for this work.

**Implementation strategy:** Retire the extension and adopt the CLI-plus-skills stack (user-confirmed). Vendor all 8 upstream skills unmodified with `VENDOR.md` pins; install `tavily-cli` via a new `run_onchange_` script mirroring the guarddog pattern; keep env-var auth from 1Password; remove the dead work-profile `TAVILY_API_KEY` export.

**Confirmed decisions:**
1. Retire `web-search.ts` — evidence: `.chezmoiignore` excludes `.pi/agent/extensions/web-search.ts` on the work profile (since commit `5dc6b5b`, which moved work web search to the `research-web` package), so the extension never renders on work; all 60 local sessions using `tavily_api` are personal-machine sessions; the extension's auth (body `api_key`) is undocumented in the current API reference (Bearer header is the documented mechanism), and its `research` capability maps to `/search` with `search_depth: "advanced"` instead of the real `POST /research` API.
2. Vendor all 8 skills (user-confirmed): `tavily-best-practices`, `tavily-cli`, `tavily-crawl`, `tavily-dynamic-search`, `tavily-extract`, `tavily-map`, `tavily-research`, `tavily-search`.
3. New `run_onchange_tavily-cli-install.sh` (user-confirmed): Homebrew has no `tavily-cli` formula, so the brew bundle cannot declare it; `uv` is already declared in `run_onchange_brew-install.sh.tmpl`. The script is ignored on the work profile, so `tvly` is installed on personal only.
4. Remove the work-profile `TAVILY_API_KEY` export (user-confirmed): added May 2026 (`4a9a1fb`) before work moved to `research-web`; nothing on the work profile consumes it. The Employee-vault 1Password item stays untouched.

**Out of scope and deliberately deferred:** As in the header. `uv tool upgrade tavily-cli` remains a manual command; the install script only reruns when its own content changes (same limit as the guarddog script).

**Design-to-code mapping:**
- Correct Tavily usage for agents → `run_onchange_tavily-cli-install.sh` + 8 vendored skills under `dot_pi/agent/exact_skills_personal/`
- Personal-only coverage → skills land only in `exact_skills_personal/` (work `.chezmoiignore` already excludes `skills_personal`); the install script is added to the same work ignore block; extension deleted rather than gated; work fish export removed
- Refreshable vendoring → `VENDOR.md` per skill; upstream clone at `~/go/src/github.com/tavily-ai/skills` per the `/sync-vendored-skills` contract
- Secret handling → personal fish block keeps `TAVILY_API_KEY` from 1Password; the CLI's env-var auth takes precedence over stored credentials

**Existing patterns and ADRs to preserve:** `VENDOR.md` format and `/sync-vendored-skills` contract; `run_onchange_guarddog-install.sh` script shape; 1Password-only secrets; `exact_` semantics; `npm run test:skills` / `test:skills:profiles` / `test:smoke` validation; chezmoi worktree source override (`chezmoi --source`).

**Proposed vertical slices:** Confirmed as the task sequence below (install → vendor → retire → docs).

**Validation strategy and test seams:** Feasibility table and acceptance criteria below; no new automated tests (the only executable addition is the install script, which mirrors the untested guarddog script per repo style).

**Assumptions and risks:**
- Upstream skill descriptions all stay under the 1024-char frontmatter limit (verified by reading them; `npm run test:skills` enforces).
- Upstream skills instruct `curl … | bash` install, `tvly init`, and `tvly login` on auth failure; the install path is preempted because the run_onchange script installs the CLI first and the env var authenticates it, so `tvly init`/`tvly login` are not needed. Unmodified vendoring keeps `/sync-vendored-skills` diffs clean.
- Work-machine sessions cannot be inspected from this personal machine; retirement safety rests on `.chezmoiignore` (extension never renders on work) plus the user's statement that Tavily is unusable at work.

**Learning lookup:** `Datadog/Learnings.md` piped through `learn-evidence.mjs learning-sections` with terms tavily / web search / pi skill / vendored / extension / chezmoi returned 0 of 3 sections — no material guidance to apply.

## Learning candidates
- 2026-09-19: chezmoi run_onchange scripts in the source root are managed under the stripped target name (for example `tavily-cli-install.sh` at `~/`), not under a dot-prefixed or `.run_onchange_` name; `chezmoi apply ~/.run_onchange_...` fails with "not managed" — evidence: `chezmoi --source <worktree> managed | grep install.sh` and the successful `chezmoi apply ~/tavily-cli-install.sh` in worktree `maruina-tavily-cli-skills`.

## Feasibility and planning decisions
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| `tavily-cli` installed | `uv tool install tavily-cli` via `run_onchange_tavily-cli-install.sh` | `run_onchange_guarddog-install.sh:9` precedent; `uv` 0.12.17 present; `uv tool install` exits 0 on an already-installed tool (verified with guarddog) | `tvly --version` | Block |
| CLI authentication without stored credentials | `TAVILY_API_KEY` env var (takes precedence over stored credentials) | Tavily CLI docs env-var table; personal fish block exports it from 1Password (`dot_config/private_fish/private_config.fish.tmpl:100-101`) | `tvly --status` from fish, or `TAVILY_API_KEY="$(op read 'op://Private/Tavily/api-key')" tvly --status` non-interactively | Narrow to keyless-capped search/extract; block research |
| Skills available to pi | Vendored `SKILL.md` dirs under `exact_skills_personal/`; personal settings `.skills` points at `~/.pi/agent/skills_personal` | `dot_pi/agent/modify_private_settings.json.tmpl` personal block; pi skills docs (Agent Skills standard; `compatibility`/`allowed-tools` frontmatter supported or ignored) | `npm run test:skills` + `test:skills:profiles` (frontmatter valid and unique); `VENDOR.md` count and cross-link resolution checks; target dir listing after apply | Block |
| Skill refresh | `VENDOR.md` pins + `/sync-vendored-skills` prompt | `dot_pi/agent/exact_prompts/sync-vendored-skills.md`; existing `VENDOR.md` examples under `exact_skills/` | Pins match upstream HEAD; sync prompt reports up to date | Vendor once, defer sync |
| Work-profile isolation | Extension deleted (not gated); skills only under `exact_skills_personal`; install script ignored on work; work fish export removed | `.chezmoiignore` work block excludes `skills_personal`, `run_onchange_tavily-cli-install.sh`, and the removed `web-search.ts` | Render work fish config with `onepasswordRead` neutralized: zero TAVILY references; rendered `.chezmoiignore` names the install script on work | Not applicable |
| Deep research capability | `tvly research` (CLI wraps `POST /research` plus polling, models mini/pro/auto) | Tavily CLI docs research section; API reference endpoint list | Skill-guided `tvly research` run (manual, optional) | Keep extension (rejected) |

## Implementation Contract
**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| CLI install | `run_onchange_tavily-cli-install.sh` (new), `.chezmoiignore` (add the script to the work ignore block) | Install `tavily-cli` via `uv tool` on personal when the script content changes | `bash run_onchange_tavily-cli-install.sh`; `tvly --version`; work render excludes the script |
| Vendored skills | `dot_pi/agent/exact_skills_personal/{tavily-best-practices,tavily-cli,tavily-crawl,tavily-dynamic-search,tavily-extract,tavily-map,tavily-research,tavily-search}/` (new; upstream files + `VENDOR.md` each) | Agent guidance for search/extract/crawl/map/research via `tvly`, refreshable upstream | `npm run test:skills(:profiles)`; target listing after apply |
| Extension retirement | `dot_pi/agent/exact_extensions/web-search.ts` (delete), `.chezmoiignore` (remove dead work ignore entry) | Remove the deprecated `tavily_api` tool and its now-dead ignore rule | Target file gone after apply; `npm run test:smoke` |
| Fish cleanup | `dot_config/private_fish/private_config.fish.tmpl` (remove 2 work-block lines) | Stop exporting a work-profile key nothing consumes | Work render has zero TAVILY references; personal render unchanged |
| Docs | `dot_pi/agent/AGENTS.md` (Tool Use section) | Record `tvly` as the personal-profile web search tool and the sync path | Review |

**Key Decisions**
- Retire, not fix: the extension is already dead on work (`.chezmoiignore`), its auth form is undocumented, and its `research` misrepresents an advanced `/search` as deep research. Fixing it would mean maintaining Bearer auth plus `/research` polling in custom TypeScript against a moving API, duplicating what the CLI already implements.
- Vendor unmodified: upstream skills are valid pi skills as-is; adaptation would make every `/sync-vendored-skills` run a manual merge.
- Env-var auth, never `tvly login`: the key stays in 1Password and no credential is written to `~/.mcp-auth/` or `~/.tavily/config.json`. This deliberately overrides upstream skill instructions that suggest `tvly login` on auth errors — the env var preempts that path.
- CLI over MCP (user-confirmed): a Tavily MCP server through the existing `mcp-cli` path was considered, but the CLI plus the eight upstream skills give richer search/extract/crawl/map/research guidance and a scriptable `--json` surface.
- New run_onchange script instead of the brew bundle: no Homebrew formula exists for `tavily-cli`; `uv tool install` matches the guarddog precedent. The script is ignored on the work profile.
- Version upgrades stay manual (`uv tool upgrade tavily-cli`); the script reruns only when its content changes. Same limit as the guarddog script.
- Dead config removed in the same change: the `.chezmoiignore` work entry for the deleted extension and the work-profile fish export both map to the retirement; the same work block gains the personal-only install-script ignore.

**Implementation Constraints**
- Work from the feature worktree `~/src/.worktrees/chezmoi/maruina-tavily-cli-skills`; chezmoi defaults to the base source directory, so every chezmoi command needs `--source` (helper below).
- This machine renders the personal profile, so apply and live smoke tests are allowed; still confirm with `cm data | jq -e '.profile == "personal"'` before applying.
- Run `npm ci --ignore-scripts` in `dot_pi/agent/` before npm tests; remove `node_modules` there after `npm test` and `npm run test:all` complete (disposable per repo guidance).
- Do not touch the hand-maintained `home-assistant`/`home-assistant-mcp` skills or any unrelated file.

**Security Requirements**
- The API key exists only in 1Password and the fish env at runtime; never in a source file, example, or doc; never printed. No `tvly login`, so no credential is written to `~/.mcp-auth/` or `~/.tavily/config.json`; no `tvly init`/`tvly update` (they install bundled skills into other agents).
- No Tavily credential, skill, or install script renders on the work profile; the shared `AGENTS.md` mentions `tvly` only as personal-profile guidance.
- Queries sent to Tavily are personal-profile traffic only — same exposure as the existing extension.

**Observability Requirements**
- None beyond local operability: personal tooling, no telemetry. The CLI's exit codes (0 success, 1 setup/update failure, 2 usage, 3 auth, 4 API) and stderr are the failure signal; the vendored skills document them.

**Failure Modes to Handle**
- `uv` missing: script exits 1 with a message (guarddog pattern). Verified by inspection.
- `TAVILY_API_KEY` unset (non-fish shell): `tvly` exits 3; skills surface stderr. Fix: launch pi from fish, or set the key for one command with `TAVILY_API_KEY="$(op read 'op://Private/Tavily/api-key')" tvly --status`. Verified non-interactively.
- API error or rate limit: `tvly` exits 4 with stderr visible; agent reports instead of retrying blindly. Verified by the e2e search step succeeding.
- Upstream skill setup side effects: the vendored `tavily-cli` skill suggests `curl … | bash` and `tvly init`. The run_onchange install and env-var auth preempt both; `tvly init`/`tvly update` must not run because they install bundled skills into `~/.claude/skills`, `~/.codex/skills`, and `~/.cursor/skills`. Verified by `tvly --version` and no new files under those directories.
- Upstream skill drift: `/sync-vendored-skills tavily-cli tavily-search …` refreshes from the pinned clone.

**Rollout and Rollback**
- Rollout: apply per target as each slice lands (`cm apply` for the script, `skills_personal`, `extensions`, fish config); each slice is independently verifiable.
- Rollback: `git revert` on the branch plus `chezmoi apply` restores the extension, the `.chezmoiignore` entries, and the fish export, and removes the vendored skills (parent `exact_skills_personal` is exact); `uv tool uninstall tavily-cli` is optional manual cleanup.
- Owner: Matteo (personal dotfiles).

**Test Strategy**
- File-level and render checks (`test`, `ls`, `grep`, `chezmoi execute-template` with profile override) plus the existing npm seams: `test:skills`, `test:skills:profiles`, `test:unit`, `test:smoke`.
- Each task has a narrow failing check that fails before the edit and passes after.
- One live integration check: `tvly search … --json` (costs ~1 credit), run by the user from fish or with the key from `op read`; it is not part of the automated gate.
- No new automated tests: the only executable addition is a 10-line install script mirroring the untested guarddog script.

## Acceptance criteria
### Requirement: tavily-cli installed and authenticated on the personal profile
The system SHALL provide a working `tvly` CLI authenticated via the `TAVILY_API_KEY` environment variable, with no credential stored on disk.
#### Scenario: install and status
- GIVEN the personal machine with `uv` installed and the fish personal block exporting `TAVILY_API_KEY`
- WHEN `chezmoi apply` runs the new `run_onchange_` script
- THEN `tvly --version` prints a version, `tvly --status` reports authentication (from fish, or with the key from `op read`), and neither `~/.mcp-auth/` nor `~/.tavily/config.json` holds a Tavily credential.

### Requirement: all eight Tavily skills vendored and valid
The system SHALL vendor the eight upstream Tavily skills unmodified into `exact_skills_personal/` with `VENDOR.md` pins.
#### Scenario: validation
- GIVEN the vendored skill directories in the worktree
- WHEN `npm run test:skills` and `npm run test:skills:profiles` run from `dot_pi/agent/`
- THEN both pass with valid, unique frontmatter names and descriptions
- AND the Task 2 checks confirm each skill directory contains `VENDOR.md` and every `../tavily-*/SKILL.md` cross-link resolves to a sibling that exists.

### Requirement: skills discovered by personal pi sessions
The system SHALL make the vendored skills discoverable to personal-profile pi sessions.
#### Scenario: post-apply discovery
- GIVEN `chezmoi apply` has rendered the skills to `~/.pi/agent/skills_personal/`
- WHEN a new pi session starts on the personal profile
- THEN the tavily skills appear in the available-skills list and `/skill:tavily-search` loads the skill.

### Requirement: end-to-end web search via the CLI
The system SHALL return live search results through `tvly`.
#### Scenario: search round-trip
- GIVEN an authenticated `tvly` in a fish shell
- WHEN `tvly search "pi coding agent" --max-results 3 --json` runs
- THEN stdout is valid JSON with a non-empty `results` array.

### Requirement: the tavily_api extension is retired
The system SHALL remove the `tavily_api` tool from personal pi sessions.
#### Scenario: removal
- GIVEN the extension deleted from `exact_extensions/`
- WHEN `chezmoi apply ~/.pi/agent/extensions` runs
- THEN `~/.pi/agent/extensions/web-search.ts` no longer exists and `npm run test:smoke` reports no extension issues.

### Requirement: the work profile renders zero Tavily references
The system SHALL keep all Tavily capability on the personal profile only.
#### Scenario: work render
- GIVEN the work-profile fish template after cleanup and `.chezmoiignore` after gating
- WHEN the template renders with `profile = work` with `onepasswordRead` neutralized, and `.chezmoiignore` renders with `profile = work`
- THEN the fish output contains no `TAVILY` reference, the ignore output names `run_onchange_tavily-cli-install.sh`, while the personal render still exports `TAVILY_API_KEY` from the Private vault.

## Task 1: Install tavily-cli via a run_onchange script
**Delivers:** A reproducible `tvly` install on the personal profile, authenticated by the existing env var.
**Blocked by:** None
**Traces to:** Requirement "tavily-cli installed and authenticated"; confirmed decision 3.
**Files:** `run_onchange_tavily-cli-install.sh` (new), `.chezmoiignore` (add the script to the work ignore block)

- [x] Failing check: `test -f run_onchange_tavily-cli-install.sh && echo EXISTS || echo MISSING` — expect `MISSING`; `command -v tvly || echo NOT_INSTALLED` — expect `NOT_INSTALLED`.
- [x] Create `run_onchange_tavily-cli-install.sh` mirroring `run_onchange_guarddog-install.sh` exactly (shebang, `set -eufo pipefail`, uv guard with error message, then `uv tool install tavily-cli`).
- [x] Add `run_onchange_tavily-cli-install.sh` to the `{{- if eq .profile "work" }}` block in `.chezmoiignore` so the script never runs on work.
- [ ] Define the worktree helpers used by every later step:
  ```bash
  cd ~/src/.worktrees/chezmoi/maruina-tavily-cli-skills
  cm() { chezmoi --source "$PWD" "$@"; }
  cm execute-template '{{ .chezmoi.sourceDir }}' | grep -Fx "$PWD"
  cm data | jq -e '.profile == "personal"'
  ```
- [x] Verify the work gate: `{ printf '{{- $_ := set . "profile" "work" -}}\n'; cat .chezmoiignore; } | cm execute-template | grep -Fx 'run_onchange_tavily-cli-install.sh'` — expect the filename to print.
- [x] Run `bash run_onchange_tavily-cli-install.sh`; expect `tvly --version` to print a version and `tvly --status` to report authentication. In a non-fish shell, set the key for one command: `TAVILY_API_KEY="$(op read 'op://Private/Tavily/api-key')" tvly --status`. Expect no `~/.mcp-auth/` or `~/.tavily/config.json` credential.
  - Note: `tvly --status` reports "Authenticated via TAVILY_API_KEY"; no Tavily credential exists under `~/.mcp-auth/` or `~/.tavily/config.json`.
- [x] Register the script with chezmoi: `cm diff` (expect no target changes; scripts are not listed), then `cm apply` — expect it to run the new script (no-op reinstall, exit 0) and record its hash; no other target changes.
  - Deviation: full `cm diff` fails on an unrelated ambient issue — `op://Private/Opencode/api-key` (fish config line 92, untouched here) now matches two 1Password items, so the fish template cannot render. Script-scoped verification instead: the script is managed as `~/tavily-cli-install.sh` (chezmoi strips `run_onchange_` from the target name), `cm apply ~/tavily-cli-install.sh` reran it as a no-op reinstall with exit 0.
- [ ] Commit: `feat(chezmoi): install tavily-cli via uv tool`.

## Task 2: Vendor the eight Tavily skills into the personal profile
**Delivers:** All upstream Tavily skills available to personal pi sessions, refreshable via `/sync-vendored-skills`.
**Blocked by:** 1 (skills instruct an installed, authenticated CLI).
**Traces to:** Requirements "all eight Tavily skills vendored and valid" and "skills discovered"; confirmed decision 2.
**Files:** `dot_pi/agent/exact_skills_personal/{tavily-best-practices,tavily-cli,tavily-crawl,tavily-dynamic-search,tavily-extract,tavily-map,tavily-research,tavily-search}/` (new)

- [x] Failing check: `ls dot_pi/agent/exact_skills_personal/ | grep -c '^tavily-'` — expect `0`.
- [x] Clone upstream to the sync-prompt location: `git clone https://github.com/tavily-ai/skills ~/go/src/github.com/tavily-ai/skills` (or fetch if present); record HEAD with `git -C ~/go/src/github.com/tavily-ai/skills log -1 --format='%H'`.
  - Recorded HEAD at vendor time: `778122e5f9c680f541eeceda5a5b36405eb7980c` (the plan-time pin `017fc3cc…` was stale; the clone fetched the current HEAD).
- [x] Copy each `skills/<name>/` from the clone into `dot_pi/agent/exact_skills_personal/<name>/` unmodified (including `references/` subdirectories where present).
- [x] Add a `VENDOR.md` to each skill directory matching the `exact_skills/` precedent: upstream `https://github.com/tavily-ai/skills`, path `` `skills/<name>` ``, the recorded HEAD as pinned commit, and the `/sync-vendored-skills` update note.
- [x] Verify `VENDOR.md` count: `find dot_pi/agent/exact_skills_personal -maxdepth 2 -name VENDOR.md | wc -l` — expect `8`.
- [x] Verify cross-links resolve:
  ```bash
  for link in $(grep -rhoE '\.\./tavily-[a-z-]+/SKILL\.md' dot_pi/agent/exact_skills_personal/ | sort -u); do
    test -f "dot_pi/agent/exact_skills_personal/${link#../}" || echo "MISSING ${link}"
  done
  ```
  expect no `MISSING` lines.
- [x] Validate: `cd dot_pi/agent && npm ci --ignore-scripts && npm run test:skills && npm run test:skills:profiles` — expect both green.
  - Result: 38 skills validated; both profile passes green.
- [x] Apply and verify discovery: `cm apply ~/.pi/agent/skills_personal`; `ls ~/.pi/agent/skills_personal/` shows the eight `tavily-*` directories plus the two `home-assistant` ones.
- [x] Live check (user-run from fish, or with the key from op read): `tvly search "pi coding agent" --max-results 3 --json | jq '.results | length'` — expect a number greater than 0; not required for the automated gate.
  - Result: 3 results; valid JSON round-trip through `tvly search --json`.
- [x] Commit: `feat(pi): vendor Tavily skills into the personal profile`.

## Task 3: Retire the tavily_api extension and remove dead work-profile config
**Delivers:** No `tavily_api` tool in any session; no Tavily key export on the work profile.
**Blocked by:** 2 (the replacement must be functional before the old tool is removed).
**Traces to:** Requirements "the tavily_api extension is retired" and "the work profile renders zero Tavily references"; confirmed decisions 1 and 4.
**Files:** `dot_pi/agent/exact_extensions/web-search.ts` (delete), `.chezmoiignore` (edit), `dot_config/private_fish/private_config.fish.tmpl` (edit)

- [ ] Failing checks: `test -f dot_pi/agent/exact_extensions/web-search.ts` — expect present (the removal target); `grep -n 'extensions/web-search.ts' .chezmoiignore` — expect the dead work entry; `grep -n 'Employee/Tavily' dot_config/private_fish/private_config.fish.tmpl` — expect the dead work export.
- [x] Delete `dot_pi/agent/exact_extensions/web-search.ts`.
- [x] Remove the `.pi/agent/extensions/web-search.ts` line from the work block in `.chezmoiignore` (the ignored source file no longer exists; the `skills_personal` and `run_onchange_tavily-cli-install.sh` entries stay).
- [x] Remove the two work-block lines in `dot_config/private_fish/private_config.fish.tmpl` (`# Tavily agentic web search` and the `set -gx TAVILY_API_KEY … Employee/Tavily …` line). Leave the personal block untouched.
- [x] Verify renders. Work-profile templates read `op://Employee/...` (this fish file and `dot_config/sops/age/private_keys.txt.tmpl`), which this personal machine cannot access, so neutralize every `onepasswordRead` before rendering:
  ```bash
  render() { { printf '{{- $_ := set . "profile" "%s" -}}\n' "$1"; sed -E 's/\{\{ *onepasswordRead [^}]*\}\}/REDACTED/g' "$2"; } | cm execute-template; }
  render work dot_config/private_fish/private_config.fish.tmpl | grep -c TAVILY   # expect 0
  render personal dot_config/private_fish/private_config.fish.tmpl | grep -c 'TAVILY_API_KEY'   # expect 1
  ```
- [x] Apply the removals: `cm apply ~/.pi/agent/extensions ~/.config/fish/config.fish`; then `test ! -f ~/.pi/agent/extensions/web-search.ts` — expect success.
  - Deviation: the extension apply succeeded and the target file is gone. The fish apply is deferred to Task 4: the full fish config cannot render because the unrelated `op://Private/Opencode/api-key` reference (template line 92, untouched by this plan) now matches two 1Password items.
- [x] Regression: from `dot_pi/agent/`, `npm run test:unit && npm run test:smoke` — expect green and no `[Extension issues]` in smoke output.
- [x] Commit: `feat(pi): retire the tavily_api web-search extension`.

## Task 4: Documentation and final verification
**Delivers:** Durable guidance for future agents; full-suite verification; branch pushed.
**Blocked by:** 3.
**Traces to:** Plan-contract documentation task; requirements above.
**Files:** `dot_pi/agent/AGENTS.md` (edit)

- [x] Add one durable line to the Tool Use section of `dot_pi/agent/AGENTS.md`: personal-profile web search uses the `tvly` CLI through the vendored `tavily-*` skills in `~/.pi/agent/skills_personal`; refresh them with `/sync-vendored-skills`.
- [x] Record why other docs are unchanged: the chezmoi skill's source layout already covers `exact_skills_personal/`; `/sync-vendored-skills` is already generic over `VENDOR.md` skills.
- [x] Final verification from `dot_pi/agent/`: `npm test && npm run test:all` — expect green; then remove the worktree's `dot_pi/agent/node_modules`.
- [x] Confirm no drift: `cm diff` — expect empty for all changed targets (`~/.pi/agent/skills_personal`, `~/.pi/agent/extensions`, `~/.config/fish/config.fish`).
  - Deviation: `skills_personal` and `extensions` diffs are empty. The fish target diff cannot run because of the unrelated `op://Private/Opencode/api-key` 1Password ambiguity (Task 3 deviation); the fish source edit is render-verified instead.
- [x] Confirm `tvly --status` still authenticates, from fish or with the key from `op read`.
- [x] Commit: `docs(pi): record tvly as the personal web search tool`.
- [ ] Push the branch: `git push -u origin maruina/tavily-cli-skills`.
