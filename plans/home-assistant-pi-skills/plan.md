# Home Assistant pi skills Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pi useful for personal Home Assistant work with cheap models by replacing the unmanaged upstream skills checkout with a curated, chezmoi-managed personal Home Assistant skill, a personal-only `ha-mcp` server wired through `mcp-cli`, and an upstream-sync prompt template, all behind safety tiers.

**Architecture:** Pi has no native MCP, so Home Assistant live access follows this repo's existing MCP pattern: a stdio server entry in `~/.config/mcp/mcp_servers.json` plus a profile-gated skill that drives it via `mcp-cli`. The personal `home-assistant` skill becomes the authoritative safety/router layer (read-only default, confirmation tiers, verification/rollback), with the REST helper scripts kept only as a fallback. All Home Assistant capability stays behind `.profile == "personal"` chezmoi gating; the work profile gets nothing.

**Tech Stack:** chezmoi (Go `text/template`), pi agent skills + prompt templates, `mcp-cli` (`~/.bun/bin/mcp-cli`), `uvx ha-mcp@latest` (Astral `uv`), Fish-exported `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` (1Password-backed), Bash helper scripts, Homebrew bundle.

---

## Implementation Contract

**Components Affected**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Personal MCP server config | `dot_config/mcp/mcp_servers.json.tmpl` | Add a `.profile == "personal"` branch that registers a `ha-mcp` stdio server (`uvx ha-mcp@latest`) using `${HOMEASSISTANT_URL}`/`${HOMEASSISTANT_TOKEN}` env substitution | `cm execute-template` renders valid JSON for personal; renders empty/work-only for work; `cm diff ~/.config/mcp/mcp_servers.json` |
| `ha-mcp` driver skill | `dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl` | Profile-gated (`personal`) skill documenting how to drive `ha-mcp` via `mcp-cli` (discovery, read-only inventory, confirmed calls) | Renders only for personal; `mcp-cli info ha-mcp` lists tools |
| Personal Home Assistant router skill | `dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md` (renamed from `home-assistant-api`), `references/core-concepts.md`, `references/safety-and-routing.md`, `scripts/*.sh` | Authoritative safety/router layer: read-only default, tiers, confirmation, verify/rollback, doc-update guidance, routing between `ha-mcp` / curated docs / REST fallback; remove dangling missing-reference links | pi discovers the skill; skill text contains tier/confirmation language; no links to nonexistent files |
| Personal settings gating | `dot_pi/agent/modify_private_settings.json.tmpl` | Remove the unmanaged upstream `/Users/ruio/.../homeassistant-ai/skills/skills/` runtime path; keep local `exact_skills_personal` path | Rendered personal settings omit the upstream path and keep `exact_skills_personal`; rendered work settings contain no Home Assistant references |
| Upstream sync prompt | `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md` | Prompt template to review upstream `homeassistant-ai/skills` + `ha-mcp` and curate local updates without mirroring or weakening safety | `cm diff ~/.pi/agent/prompts/sync-home-assistant-skills.md`; appears as `/sync-home-assistant-skills` |
| Tooling prerequisite | `run_onchange_brew-install.sh.tmpl` | Declare `uv` (provides `uvx`) so `ha-mcp` install is reproducible | `uv` present in the Brewfile heredoc, alphabetical position |
| Docs / future-agent guidance | `dot_config/private_fish/private_config.fish.tmpl` (comment only if needed), `AGENTS.md` files, chezmoi skill | Record durable MCP + Home Assistant knowledge | Reviewed in final task |

**Key Decisions**
- pi has **no native MCP** (`docs/usage.md`, `README.md`). The design phrase "add `ha-mcp` MCP server configuration" is implemented through this repo's established MCP seam: an entry in `dot_config/mcp/mcp_servers.json.tmpl` plus a `mcp-cli`-driver skill — **not** a `mcpServers` key in pi settings (no such key exists). `modify_private_settings.json.tmpl` therefore only loses the upstream skills path; it gains nothing.
- `mcp_servers.json.tmpl` currently renders **work-only** (whole file guarded by `{{ if eq .profile "work" }}`). Add a separate personal branch rather than ungating, so the work profile keeps exactly its current three servers and personal gets only `ha-mcp`.
- Use `uvx ha-mcp@latest` as the install/run path (upstream README documents `uvx --python 3.13 --refresh ha-mcp@latest` with `HOMEASSISTANT_URL`/`HOMEASSISTANT_TOKEN`). It is inspectable, rollback-friendly (delete the server entry), and avoids the opaque `curl | sh` installer.
- Reuse the already-present, personal-only Fish vars `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` (1Password-backed). The server entry maps them to `ha-mcp`'s expected `HOMEASSISTANT_URL`/`HOMEASSISTANT_TOKEN` via the `mcp_servers.json` `env` block referencing `${HOME_ASSISTANT_URL}`/`${HOME_ASSISTANT_TOKEN}`. No new secret, no token in any file.
- Rename the skill directory `home-assistant-api` → `home-assistant` to reflect its new router role; the skill is loaded via the `exact_skills_personal` **directory**, so renaming the subdirectory needs no settings change.
- Keep REST helper scripts as a documented fallback (design: "scripts remain useful as fallback/debug tools"). Do not rewrite them in this iteration.

**Security Requirements**
- No Home Assistant token in any source file, example, prompt, or doc. Token stays in the Fish 1Password template only; `mcp_servers.json` references it via `${HOME_ASSISTANT_TOKEN}` substitution.
- All Home Assistant capability (server entry, driver skill, router skill path) stays behind `.profile == "personal"`. The work profile must render zero Home Assistant references.
- Treat entity names, states, presence, and device inventory as household-private; the skill must say so and keep read-only the default.
- The driver and router skills must forbid printing or persisting the token.

**Observability Requirements**
- None beyond local operability, per design (small personal setup; no metrics/alerting/dashboards). The router skill documents the operational checks already in the design: pi transcript/history, `ha-mcp` startup output/errors, Home Assistant logbook/history, config validation before reload/restart, and a read-only inventory after setup. Recorded here as the explicit reason no telemetry is added.

**Failure Modes to Handle**
- `ha-mcp` fails to start (bad token/URL, `uvx` missing): `mcp-cli info ha-mcp` errors → skill instructs stop-and-report, check token/URL, confirm `uv` installed. Verified by the read-only smoke-test task.
- Token unset in the current shell: `mcp_servers.json` uses `${HOME_ASSISTANT_TOKEN}`; with `MCP_STRICT_ENV false` (already set in `conf.d/mcp.fish`) unrelated servers keep working. Verified by rendering + `mcp-cli info`.
- Work profile accidentally gains Home Assistant access: guarded branches; verified by rendering both profiles and grepping for `homeassistant`/`HOME_ASSISTANT`/`ha-mcp`.
- Cheap model attempts an unconfirmed mutation: read-only default + tiered confirmation checklist (target/action/effect/rollback/verify) in the router skill; verified by inspecting skill text.
- Dangling skill references (current skill links to 6 missing files): removed/replaced; verified by grepping the skill for the missing filenames and finding none.
- YAML/config edit breaks Home Assistant: router skill requires diff/summary, confirmation, config validation, one change at a time, recorded rollback path; verified by inspecting skill text.

**Test Strategy**
- This is a config/docs/template change set; "tests" are deterministic render and content assertions run with `chezmoi execute-template`, `jq`, and `grep`, plus a manual `mcp-cli` smoke test gated behind the user.
- Each template task has a narrow failing check that fails before the edit (e.g. `grep -q ha-mcp` on the rendered personal config fails first) and passes after.
- **Chezmoi source override (critical):** implementation runs from this feature worktree, but `chezmoi` defaults to the base source directory (`~/.local/share/chezmoi`) even when `cwd` is a worktree. Define and use these helpers for every `chezmoi` command in this plan:
  ```bash
  cd /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills
  export CHEZMOI_SOURCE_DIR="$PWD"
  cm() { chezmoi --source "$CHEZMOI_SOURCE_DIR" "$@"; }
  render() { # usage: render <profile> <template-path>
    { printf '{{- $_ := set . "profile" "%s" -}}\n' "$1"; cat "$2"; } | cm execute-template
  }
  cm execute-template '{{ .chezmoi.sourceDir }}' | grep -Fx "$CHEZMOI_SOURCE_DIR"
  ```
- **Profile override for rendering (critical):** `.profile` comes from chezmoi config data, not from a prompt. This implementation may run on a `work` profile for model quality, so render personal-profile output with the `render personal ...` helper above. `--init --promptString profile=personal` does **not** override `.profile` for target rendering. For the `modify_` settings script, pipe the rendered script through `sh` with `printf '{}'` as the simulated current target (proven).
- **Apply gate:** when implementing from a work profile, do not apply personal Home Assistant targets. Task 7 must run render/diff checks from the feature worktree, then skip `cm apply` and live `mcp-cli` smoke tests unless `cm data | jq -e '.profile == "personal"'` succeeds. Record skipped apply/smoke-test as a personal-profile follow-up.
- Boundaries: do not mock `ha-mcp` or Home Assistant. The single live integration check (`mcp-cli info ha-mcp`, read-only inventory) is run once, manually, and only on a personal profile with the user present, per the design's smoke-test step.
- No automated test framework exists in this dotfiles repo; verification uses shell one-liners, matching repository conventions.

---

## Task 1 — Declare `uv` in Homebrew bundle

**Files:** `run_onchange_brew-install.sh.tmpl`

- [x] Failing check (should fail before edit):
  ```bash
  cd /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills
  grep -q '^brew "uv"$' run_onchange_brew-install.sh.tmpl && echo PRESENT || echo MISSING
  ```
  Expected before: `MISSING`.
- [x] Add `brew "uv"` in alphabetical order in the Brewfile heredoc (between `brew "typescript-language-server"` and `brew "wget"` — verify exact neighbors when editing; `uv` sorts after `typescript-language-server` and before `wget`).
- [x] Verify:
  ```bash
  grep -n '^brew "uv"$' run_onchange_brew-install.sh.tmpl
  uvx --version
  ```
  Expected: line present; `uvx` already installed (`/opt/homebrew/bin/uvx`), so no install needed now — this only makes the dependency reproducible.
- [ ] Commit: `chore: declare uv for ha-mcp in brew bundle`

## Task 2 — Register personal `ha-mcp` server in `mcp_servers.json.tmpl`

**Files:** `dot_config/mcp/mcp_servers.json.tmpl`

- [x] Define the chezmoi source and render helpers (used by all checks below):
  ```bash
  cd /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills
  export CHEZMOI_SOURCE_DIR="$PWD"
  cm() { chezmoi --source "$CHEZMOI_SOURCE_DIR" "$@"; }
  render() { { printf '{{- $_ := set . "profile" "%s" -}}\n' "$1"; cat "$2"; } | cm execute-template; }
  cm execute-template '{{ .chezmoi.sourceDir }}' | grep -Fx "$CHEZMOI_SOURCE_DIR"
  ```
- [x] Failing check (should fail before edit):
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers["ha-mcp"]' \
    && echo HAS_HA || echo NO_HA
  ```
  Expected before: personal currently renders empty → `NO_HA` (jq errors on empty input; treat any non-`HAS_HA` as failing).
- [x] Restructure the template so the existing work block is wrapped in `{{ if eq .profile "work" }}...{{ end }}` (unchanged content) and add a sibling `{{ if eq .profile "personal" }}` block:
  ```json
  {{ if eq .profile "personal" -}}
  {
    "mcpServers": {
      "ha-mcp": {
        "command": "uvx",
        "args": ["--python", "3.13", "ha-mcp@latest"],
        "env": {
          "HOMEASSISTANT_URL": "${HOME_ASSISTANT_URL}",
          "HOMEASSISTANT_TOKEN": "${HOME_ASSISTANT_TOKEN}"
        }
      }
    }
  }
  {{- end }}
  ```
  Keep the work block exactly as-is (three servers). Do not include `--refresh` (avoids opaque per-call upgrades; pin behavior is `@latest` resolved at install).
- [x] Verify personal renders valid JSON with the server and **no token literal**:
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | tee /tmp/ha-mcp-personal.json | jq -e '.mcpServers["ha-mcp"].command == "uvx"'
  grep -Eo '\$\{HOME_ASSISTANT_(URL|TOKEN)\}' /tmp/ha-mcp-personal.json
  ! grep -qi 'op://\|eyJ\|[a-f0-9]\{40\}' /tmp/ha-mcp-personal.json && echo NO_SECRET
  ```
  Expected: `true`; both `${HOME_ASSISTANT_URL}` and `${HOME_ASSISTANT_TOKEN}` present; `NO_SECRET`.
- [x] Verify work renders unchanged (three servers, no Home Assistant):
  ```bash
  render work dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers | keys'
  ! render work dot_config/mcp/mcp_servers.json.tmpl | grep -qi 'ha-mcp\|homeassistant'
  ```
  Expected: keys are `["atlassian","datadog-prod","datadog-staging","slack"]`; absence check exits successfully.
- [ ] Commit: `feat(mcp): add personal-only ha-mcp server`

## Task 3 — Add the `ha-mcp` driver skill (profile-gated)

**Files:** `dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl`

This mirrors the existing `datadog-mcp`/`slack-mcp` driver-skill pattern (profile-gated `.tmpl`, documents `mcp-cli` usage).

- [x] Failing check:
  ```bash
  test -f dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl && echo EXISTS || echo MISSING
  ```
  Expected before: `MISSING`.
- [x] Create the file wrapped in `{{ if eq .profile "personal" -}}...{{- end }}` with frontmatter (`name: home-assistant-mcp`, a specific `description` stating this skill is subordinate: use only after loading the `home-assistant` router skill or when that skill routes to live MCP access). Body must cover:
  - mandatory routing rule: for every Home Assistant task, load `home-assistant` first; this skill only documents `mcp-cli` mechanics for the router-selected live MCP path;
  - config: server name `ha-mcp`, config file `~/.config/mcp/mcp_servers.json`;
  - discovery: ``mcp-cli info ha-mcp`` and ``mcp-cli info ha-mcp <tool>``;
  - read-only inventory/state examples via ``mcp-cli call ha-mcp <tool> '{...}'`` using stdin/heredoc for complex JSON;
  - explicit rule: defer all mutation safety to the `home-assistant` router skill and its tiers; never call mutating tools directly from this skill without the router's confirmation protocol;
  - rule: never print or persist `HOME_ASSISTANT_TOKEN`.
  Do not invent exact tool names beyond what discovery returns; instruct the agent to run discovery first (upstream advertises 95+ tools and may rename them).
- [x] Verify gating and discoverability (reuse the `render` helper from Task 2):
  ```bash
  render work dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl | wc -c   # expect ~0
  render personal dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl | grep -q 'mcp-cli info ha-mcp' && echo OK
  ```
  Expected: work render is empty/whitespace; personal render contains the discovery command.
- [ ] Commit: `feat(skills): add personal ha-mcp driver skill`

## Task 4 — Reframe the personal Home Assistant skill as the safety/router layer

**Files:** rename `dot_pi/agent/exact_skills_personal/home-assistant-api/` → `dot_pi/agent/exact_skills_personal/home-assistant/`; rewrite `SKILL.md`; keep `scripts/*.sh`; keep `references/core-concepts.md`; add `references/safety-and-routing.md`.

- [ ] Rename the directory with git to preserve history:
  ```bash
  git mv dot_pi/agent/exact_skills_personal/home-assistant-api dot_pi/agent/exact_skills_personal/home-assistant
  ```
- [ ] Failing check (current skill links to 6 missing references):
  ```bash
  for f in state-management service-reference entity-types templates system-config examples; do
    grep -q "references/$f.md" dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md && echo "DANGLING:$f"
  done
  ```
  Expected before: prints `DANGLING:` for each of the six.
- [ ] Rewrite `SKILL.md` so it is concise and deterministic for cheap models. Frontmatter `name: home-assistant`, specific `description` (personal smart-home work, routes between `ha-mcp`, curated docs, and REST fallback; read-only by default; requires confirmation for mutations). Body sections:
  - **Routing:** prefer the `home-assistant-mcp` skill (live `ha-mcp`) for inventory/state/control; use `references/` for curated best practices; use `scripts/*.sh` only as REST fallback/debug.
  - **Safety tiers** (verbatim intent from design):
    - Tier 0 read-only, no confirmation (list/inspect, draft changes without applying).
    - Tier 1 normal mutation, requires the model to state target, exact action, expected effect, rollback path, verification step, then get explicit user confirmation (light/switch/climate, create/update helpers/automations/scripts/scenes/dashboards/areas/labels/groups, YAML/config edits).
    - Tier 2 sensitive/broad mutation, requires a second explicit confirmation and prefers dry-run/diff (locks/alarms/cameras/presence/device trackers, restart/reload, disabling integrations/add-ons, deletions, bulk ops).
  - **Confirmation protocol:** the target/action/effect/rollback/verify checklist.
  - **Verification and rollback:** verify after every change via read-back; for config edits run validation before reload/restart; one change at a time; record rollback path before applying.
  - **Documentation-update guidance:** when durable setup facts or reusable patterns are discovered, ask before writing docs; do not auto-write during incidental exploration.
  - **Token handling:** never print or persist `HOME_ASSISTANT_TOKEN`; treat entity/state/presence data as household-private.
  - Remove all links to the six nonexistent reference files. Keep a short pointer to `references/core-concepts.md` (REST basics) and `references/safety-and-routing.md`.
- [ ] Create `references/safety-and-routing.md` holding the long-form tier table, the confirmation checklist, the verify/rollback protocol, and the routing decision (so `SKILL.md` stays lean). No tool names invented beyond "run `mcp-cli info ha-mcp` to discover tools."
- [ ] Trim `references/core-concepts.md` only if it points at missing siblings: it currently links `state-management.md`, `service-reference.md`, `templates.md` in its "Next Steps". Replace those with a pointer to the `home-assistant-mcp` skill and `safety-and-routing.md`.
- [ ] Verify no dangling references remain and tiers are present:
  ```bash
  ! grep -rqE 'references/(state-management|service-reference|entity-types|templates|system-config|examples)\.md' dot_pi/agent/exact_skills_personal/home-assistant/ && echo NO_DANGLING
  grep -q 'Tier 0' dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md \
    && grep -q 'Tier 1' dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md \
    && grep -q 'Tier 2' dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md && echo TIERS_OK
  grep -qi 'never print\|never persist' dot_pi/agent/exact_skills_personal/home-assistant/SKILL.md && echo TOKEN_RULE_OK
  ```
  Expected: `NO_DANGLING`, `TIERS_OK`, `TOKEN_RULE_OK`.
- [ ] Verify scripts still exist and are referenced as fallback only:
  ```bash
  ls dot_pi/agent/exact_skills_personal/home-assistant/scripts/*.sh | wc -l   # expect 5
  ```
- [ ] Commit: `refactor(skills): reframe home-assistant skill as safety router`

## Task 5 — Remove the unmanaged upstream skills path from personal settings

**Files:** `dot_pi/agent/modify_private_settings.json.tmpl`

Do this only after Tasks 3–4 exist (local replacement guidance present), per the design rollout order.

- [ ] Failing check (path currently present):
  ```bash
  grep -q 'homeassistant-ai/skills/skills' dot_pi/agent/modify_private_settings.json.tmpl && echo PRESENT
  ```
  Expected before: `PRESENT`.
- [ ] Remove the line `"/Users/ruio/src/github.com/homeassistant-ai/skills/skills/",` from the personal `.skills` array. Keep the `{{ .chezmoi.sourceDir }}/dot_pi/agent/exact_skills_personal` entry and the obsidian entries. Note: the script is a `jq` filter inside a templated `sh` script — the change is a single-line deletion; ensure the resulting JSON array still has valid comma placement.
- [ ] Verify personal settings render valid JSON without the upstream path and with the local path. The `modify_` file renders to a shell script that reads the current target on stdin and prints the new JSON; simulate an empty current target with `printf '{}'`:
  ```bash
  render personal dot_pi/agent/modify_private_settings.json.tmpl > /tmp/ha-settings.sh
  printf '{}' | sh /tmp/ha-settings.sh | jq -e '.skills | index("/Users/ruio/src/github.com/homeassistant-ai/skills/skills/") == null'
  printf '{}' | sh /tmp/ha-settings.sh | jq -e '[.skills[] | select(endswith("exact_skills_personal"))] | length == 1'
  ```
  Expected: both `true` (upstream path absent; local path present).
- [ ] Verify work settings still contain zero Home Assistant references:
  ```bash
  render work dot_pi/agent/modify_private_settings.json.tmpl > /tmp/ha-settings-work.sh
  ! printf '{}' | sh /tmp/ha-settings-work.sh | grep -qi 'homeassistant\|home_assistant\|ha-mcp'
  ```
  Expected: absence check exits successfully.
- [ ] Commit: `feat(pi): drop unmanaged upstream home assistant skills path`

## Task 6 — Add the `sync-home-assistant-skills` prompt template

**Files:** `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md`

- [ ] Failing check:
  ```bash
  test -f dot_pi/agent/exact_prompts/sync-home-assistant-skills.md && echo EXISTS || echo MISSING
  ```
  Expected before: `MISSING`.
- [ ] Create the prompt with frontmatter `description:` (review upstream Home Assistant skills + ha-mcp and curate local updates). Body must instruct the agent to:
  - inspect upstream `homeassistant-ai/skills` and `homeassistant-ai/ha-mcp`;
  - compare upstream guidance/tooling against local `dot_pi/agent/exact_skills_personal/home-assistant*` and `dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl`;
  - highlight useful changes, stale local guidance, duplicated content, changed safety assumptions, and renamed/deprecated `ha-mcp` tools;
  - state that the local safety policy (tiers, confirmation, read-only default) is authoritative and must not be weakened;
  - avoid wholesale mirroring;
  - ask before editing unless explicitly told to apply;
  - record upstream URL, commit/date, source method, and a summary of curated updates;
  - never include the Home Assistant token or private URLs in output.
- [ ] Verify discoverability and content:
  ```bash
  grep -q 'safety policy' dot_pi/agent/exact_prompts/sync-home-assistant-skills.md \
    && grep -q 'commit/date\|commit / date' dot_pi/agent/exact_prompts/sync-home-assistant-skills.md && echo OK
  ```
  Expected: `OK`.
- [ ] Commit: `feat(prompts): add sync-home-assistant-skills template`

## Task 7 — Render, diff, apply gate, and smoke-test gate

**Files:** none (verification + optional apply only)

- [ ] Full render/diff review of every changed target from the feature worktree source:
  ```bash
  cm diff ~/.config/mcp/mcp_servers.json
  cm diff ~/.pi/agent/skills/home-assistant-mcp/SKILL.md
  cm diff ~/.pi/agent/skills_personal/home-assistant
  cm diff ~/.pi/agent/prompts/sync-home-assistant-skills.md
  cm diff ~/.pi/agent/settings.json
  ```
  Expected: diffs show only intended changes; the old `skills_personal/home-assistant-api` directory is removed (it is under an `exact_` parent) and `home-assistant` is added; no token literals anywhere.
- [ ] Render-check personal outputs explicitly, even when implementing from a work profile:
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers["ha-mcp"]'
  render personal dot_pi/agent/modify_private_settings.json.tmpl > /tmp/ha-settings-personal.sh
  printf '{}' | sh /tmp/ha-settings-personal.sh | jq -e '[.skills[] | select(endswith("exact_skills_personal"))] | length == 1'
  ```
  Expected: `ha-mcp` exists in the personal MCP render and the personal settings render keeps the local skills path.
- [ ] Confirm no committed source file contains a token:
  ```bash
  git -C /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills grep -nEi 'HOMEASSISTANT_TOKEN.*[a-f0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}' -- . ':!plans' || echo NO_TOKENS
  ```
  Expected: `NO_TOKENS`.
- [ ] Apply gate: because this implementation may run from a `work` profile for better model access, apply only if the active chezmoi profile is personal:
  ```bash
  if cm data | jq -e '.profile == "personal"'; then
    cm apply ~/.config/mcp/mcp_servers.json
    cm apply ~/.pi/agent/skills/home-assistant-mcp
    cm apply ~/.pi/agent/skills_personal
    cm apply ~/.pi/agent/prompts/sync-home-assistant-skills.md
    cm apply ~/.pi/agent/settings.json
  else
    echo "SKIP_APPLY: active chezmoi profile is not personal; run apply from a personal-profile environment."
  fi
  ```
  Expected on the work profile: `SKIP_APPLY...`. Expected on a personal profile: the five targets apply from the feature worktree source.
- [ ] Read-only smoke-test gate (run only after the apply gate has applied on a personal profile, and only with the user present; this touches the live instance):
  ```bash
  if cm data | jq -e '.profile == "personal"'; then
    mcp-cli info ha-mcp
  else
    echo "SKIP_SMOKE_TEST: active chezmoi profile is not personal."
  fi
  ```
  Expected on a personal profile: tool list prints without error (server starts via `uvx`). If it errors, stop and check `uv`, `HOME_ASSISTANT_URL`, and `HOME_ASSISTANT_TOKEN` in the current Fish shell. Expected on the work profile: `SKIP_SMOKE_TEST...`.
- [ ] Optional (only after explicit user approval and only on a personal profile): one Tier 0 read-only inventory call via `mcp-cli call ha-mcp <discovered-list-tool>` to confirm entity count and that no locks/alarms/cameras are present. Do not perform any mutation in this plan.
- [ ] No commit (apply/verify only). If the apply gate is skipped on the work profile, record "personal-profile apply and smoke test pending" in the final summary.

## Task 8 — Documentation and future-agent guidance (required final task)

**Files:** inspect and update as needed: `AGENTS.md` (repo root + `/Users/matteo.ruina/AGENTS.md` + `~/.pi/agent/AGENTS.md`), the chezmoi skill (`~/.pi/agent/skills/chezmoi/SKILL.md`), any READMEs, and the Fish config comment near the Home Assistant vars.

For each item below, the implementer must either update it or record in the commit message why no update is needed.

- [ ] **Repo `AGENTS.md` (`/Users/matteo.ruina/.local/share/chezmoi/AGENTS.md` and the two mirrors):** add durable knowledge only if absent: (a) pi has no native MCP — MCP servers live in `~/.config/mcp/mcp_servers.json` (source: `dot_config/mcp/*.json.tmpl`) and are driven by `mcp-cli`-based skills; (b) Home Assistant capability is personal-profile-only; (c) `mcp_servers.json.tmpl` has separate work and personal branches. Keep it terse.
- [ ] **chezmoi skill (`~/.pi/agent/skills/chezmoi/SKILL.md`):** consider a one-line note that MCP server config is templated under `dot_config/mcp/` and gated by profile. Update only if it adds durable value; otherwise record why not.
- [ ] **Fish config comment:** the `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` block already has a comment. Add a one-line note that `ha-mcp` (in `mcp_servers.json`) consumes these vars, so renaming them breaks the MCP server. Update only if helpful.
- [ ] **README / runbook / examples:** the repo has no Home Assistant README or runbook; record "no user-facing or runbook docs exist for this area" in the commit if nothing is created. Do not create new top-level docs unless the user asks.
- [ ] **Driver/router skills as docs:** confirm the two skills themselves serve as the developer/operational doc for the operability checks listed in the design (transcript, `ha-mcp` startup output, logbook/history, config validation, read-only inventory). If any check is missing from the router skill, add it there.
- [ ] Verify nothing references removed paths:
  ```bash
  git -C /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills grep -n 'home-assistant-api' -- . ':!plans' || echo NO_OLD_NAME
  git -C /Users/matteo.ruina/.local/share/chezmoi-home-assistant-pi-skills grep -n 'homeassistant-ai/skills/skills' -- . ':!plans' || echo NO_UPSTREAM_PATH
  ```
  Expected: `NO_OLD_NAME`, `NO_UPSTREAM_PATH`.
- [ ] Commit: `docs: record ha-mcp and home assistant skill knowledge`
