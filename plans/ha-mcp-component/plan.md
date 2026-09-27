# HA-MCP Component Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the personal-profile stdio `ha-mcp` transport with the HACS in-process component's direct HTTP URL so `mcp-cli` one-shot calls can pass ha-mcp's strict best-practices gate.
**Smallest user-feedback slice:** A successful `mcp-cli call ha-mcp-remote ha_get_overview '{}'` against the component's direct URL, plus two `ha_get_skill_guide` reads more than 60 seconds apart returning the same acknowledgment key, before any active entry changes.
**Out of Scope:** Migrating the vendored best-practices skill or safety policy; work-profile HA; `ha_auth` OAuth; publishing through Traefik/`hass.malazan.xyz`; the `/readonly` connection; the component's File & YAML services entry; the add-on fallback (kept as the design's revisit trigger); retiring the `pi_api_token` 1Password item (kept for rollback).
**Architecture:** The HACS custom component (`ha_mcp_tools`) runs the ha-mcp server in-process inside HA Core, provisions its own admin token, and exposes a secret-path port (`9584`). chezmoi renders a `type: remote` mcp-cli entry whose URL comes from a new fish export backed by 1Password. Local skills stay the authoritative safety policy; only transport and secret-handling prose change.
**Tech Stack:** chezmoi (Go `text/template`, `onepasswordRead`), fish, mcp-cli v0.3.0 (`type: remote`), HACS component `homeassistant-ai/ha-mcp-integration` (domain `ha_mcp_tools`), Home Assistant Core 2026.9.x on `172.16.0.14`.

---

## Skills loaded and used

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | /plan contract | Checklist; matched `chezmoi`, `codebase-research`, `write` triggers |
| `resolve-worktree` | `prompt-required` | Path argument | Resolved `plans/ha-mcp-component/design.md` and switched to the feature worktree |
| `chezmoi` | `skill-loader` | Chezmoi source files affected | Edit source not targets; `exact_`/`private_` prefixes; render-before-apply; template edits go in `.tmpl` sources |
| `codebase-research` | `skill-loader` | Unfamiliar file area | Verified current content of every affected file before mapping design to code |
| `write` | `skill-loader` | Prose edits to skills, prompt, and this plan | Clarity and precision for skill prose and task wording |
| `obsidian-cli` | `agent-selected` | Advisory learning lookup | Read `Datadog/Learnings.md` and piped it to `learn-evidence.mjs learning-sections` |

Advisory learnings: 1 of 11 sections matched — **"Render piped chezmoi templates against an initialized config, not `--init`"** (2026-07-15). Applied: every render check pipes through an initialized config with the profile override (`render` helper below); no `--init --promptString` calls anywhere.

## Implementation Contract

**Components Affected**

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| HA-side component (manual) | None (HA UI) | Install `homeassistant-ai/ha-mcp-integration` via HACS; add the HA-MCP Server entry with auto server updates off, local-only mode, auth `none`; copy the direct URL | HACS shows the repository; the entry exists; the Configure screen shows a direct URL |
| Secret URL plumbing | `dot_config/private_fish/private_config.fish.tmpl` | Add `HA_MCP_URL` export from 1Password inside the personal block; keep `HOME_ASSISTANT_*` until cutover | Source grep; `fish -lc 'test -n "$HA_MCP_URL"'` returns `SET` |
| mcp-cli server config | `dot_config/mcp/mcp_servers.json.tmpl` | Personal branch: temporary `ha-mcp-remote` entry, then cutover `ha-mcp` to `type: remote` with `url: ${HA_MCP_URL}` | Rendered personal JSON is valid with the expected entries; work profile unchanged |
| Driver skill | `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md` | Remote configuration section plus a best-practices acknowledgment key section | Greps: no `uvx`/`HOME_ASSISTANT_TOKEN`; `BestPracticeKey` section present |
| Router skill and references | `dot_pi/agent/exact_skills_personal/exact_home-assistant/SKILL.md`, `references/core-concepts.md`, `references/safety-and-routing.md` | Secret-URL handling replaces token handling; operational checks become HA logs and repair issues | Greps: no `HOME_ASSISTANT_TOKEN`; no stale `ha-mcp startup output` checks |
| Sync prompt | `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md` | Fix stale `SKILL.md.tmpl` path; add the component repository as a source; extend privacy rules to the secret URL | Grep: no `SKILL.md.tmpl`; component repo listed |

**Key Decisions**
- Tracer-bullet order from the design: prove the transport and gate on a temporary entry (`ha-mcp-remote`) before touching the active `ha-mcp` entry. The temporary entry is committed, then removed at cutover, so history records the proof.
- The connect URL is the only credential. It lives in 1Password (`op://Private/Home Assistant/mcp_url`) and reaches mcp-cli through `${HA_MCP_URL}`; no literal URL or token is ever committed or printed.
- The fish template already runs `onepasswordRead` at shell startup for other items; `HA_MCP_URL` follows the same pattern. `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` exports stay until cutover so rollback is a two-line restore.
- Verification commands must never emit the secret URL: use exit-code/count checks, `test -n`, and `op read` captured by the shell (see Security Requirements).

**Implementation Constraints**
- This worktree is not chezmoi's default source directory. Define and use these helpers for every chezmoi command in this plan:
  ```bash
  cd /Users/ruio/go/src/.worktrees/chezmoi/maruina-ha-mcp-component
  export CHEZMOI_SOURCE_DIR="$PWD"
  cm() { chezmoi --source "$CHEZMOI_SOURCE_DIR" "$@"; }
  render() { { printf '{{- $_ := set . "profile" "%s" -}}\n' "$1"; cat "$2"; } | cm execute-template; }
  cm execute-template '{{ .chezmoi.sourceDir }}' | grep -Fx "$CHEZMOI_SOURCE_DIR"
  ```
- The `render` helper pipes template content through an initialized config with `.profile` overridden via `set . "profile"`. Never use `--init --promptString profile=...` for piped templates; it cannot resolve custom data and fails with a misleading `map has no entry for key "profile"` error (learning above, and proven in `plans/home-assistant-pi-skills/plan.md`).
- `dot_config/mcp/mcp_servers.json.tmpl` contains no `onepasswordRead` calls, so rendering it never emits secrets. The fish template does; never dump its rendered output.
- **Apply gate:** before any `cm apply`, run `cm data | jq -e '.profile == "personal"'`. These targets are personal-profile only; on a work-profile machine, record skipped applies as a follow-up instead of forcing them.
- The temporary and final entries reuse the exact `type: remote` shape the work profile already uses, so mcp-cli behavior is a proven seam.

**Security Requirements**
- The connect URL is the single credential. It must never appear in source files, examples, prompts, command output, session logs, or this plan. Only `${HA_MCP_URL}` and the `op://` field reference are committed.
- Forbidden command shapes: `echo $HA_MCP_URL`, printing rendered fish output, or pasting the URL into any pi-visible command. Allowed checks: `test -n "$HA_MCP_URL"`, `grep -c` counts, and `curl "$(op read 'op://Private/Home Assistant/mcp_url')"` indirection whose output is only an HTTP status.
- If the URL leaks, rotate with **Regenerate connect secrets now** in the entry options, update 1Password, and re-apply chezmoi.
- The endpoint stays LAN/tailnet-only plain HTTP; no server-side gating is added. Policy enforcement stays in the skills.

**Observability Requirements**
- None added, per design (personal setup; no metrics, alerts, or dashboards). The router skill documents the operational checks instead: Home Assistant logs (Settings → System → Logs) and repair issues (Settings → System → Repairs), replacing the old `ha-mcp` startup-output check.

**Failure Modes to Handle**
- `172.16.0.14:9584` unreachable over Tailscale or mcp-cli rejects plain-HTTP streamable: slice 3 proves both before cutover. Fallback ladder from the design: the local webhook on `http://172.16.0.14:8123` (still tailnet-only), then the deferred domain/TLS option. Verified by the slice 3 live calls.
- `HA_MCP_URL` unset in the calling shell: `mcp-cli call ha-mcp` fails with a substitution error. Check with `fish -lc 'test -n "$HA_MCP_URL"; and echo SET; or echo UNSET'` and open a new fish shell after applying the fish config.
- 1Password field missing: `onepasswordRead` fails at apply. Add `mcp_url` to the item before applying the fish template.
- Acknowledgment key expires mid-session (hourly rotation, previous hour as grace): the driver skill instructs re-reading `ha_get_skill_guide` when a gated write returns `BPS_ACKNOWLEDGMENT_REQUIRED`.
- HA Core update wipes the in-process pip install of `ha-mcp`: repair issue appears; reinstall the frozen version. Repeated install failure is the pre-agreed trigger to switch to the add-on (design fallback).

**Rollout and Rollback**
- Rollout follows the slices: install and prove on the temporary entry, then cutover the active entry and update the skills. Owner: Matteo.
- Rollback: restore the stdio `ha-mcp` entry and the `HOME_ASSISTANT_*` exports in the two templates (the `pi_api_token` 1Password item still exists), `cm apply` both targets, and optionally disable the component entry in HA.

**Test Strategy**
- This is a config/docs/template change set. Verification is deterministic shell checks (`chezmoi execute-template` piped to `jq`/`grep`) plus live `mcp-cli` one-shot calls. No test framework exists in this dotfiles repo; this matches repository conventions.
- Boundaries: do not mock ha-mcp or Home Assistant. Live checks run once per validation point, with the user present, per the prior plan's proven boundary rule.
- Each template task starts with a narrow failing check that fails before the edit and passes after. Expected first-failure commands are named per task.

## Requirements

### Requirement: Remote transport read
The system SHALL serve successful `mcp-cli` reads for the active `ha-mcp` entry over the component's direct HTTP URL.

#### Scenario: One-shot read through the remote URL
- GIVEN the component entry is installed and `HA_MCP_URL` is exported in a fresh fish shell
- WHEN `mcp-cli call ha-mcp ha_get_overview '{}'` runs
- THEN the call succeeds and returns Home Assistant overview data

### Requirement: Stable acknowledgment key
The system SHALL return the same best-practices acknowledgment key from one-shot `ha_get_skill_guide` calls spaced more than 60 seconds apart, because the server process is long-lived.

#### Scenario: Key stability across one-shot calls
- GIVEN the active `ha-mcp` entry points at the component URL
- WHEN `ha_get_skill_guide` runs twice more than 60 seconds apart in separate `mcp-cli call` invocations
- THEN both outputs contain the same acknowledgment key

### Requirement: Gated write succeeds with the key
The system SHALL accept a gated write that carries the `BestPracticeKey` read from the guide.

#### Scenario: Confirmed mutation passes the gate
- GIVEN the router skill has produced a confirmation checklist and received explicit user confirmation for a benign mutation
- WHEN the agent reads `ha_get_skill_guide`, then calls the write tool with `BestPracticeKey` set from the acknowledgment line
- THEN the write succeeds and a read-back verifies the result

### Requirement: Gate not silently disabled
The system SHALL still reject a gated write that omits `BestPracticeKey`.

#### Scenario: Negative gate check
- GIVEN the remote transport is active
- WHEN a write tool is called without `BestPracticeKey`
- THEN the call returns `BPS_ACKNOWLEDGMENT_REQUIRED` and performs no mutation

### Requirement: Secret hygiene
The repository SHALL contain no secret URL or Home Assistant token literal; the URL reaches the client only through `${HA_MCP_URL}` / `onepasswordRead`.

#### Scenario: Rendered and source checks
- GIVEN all edits from this plan
- WHEN the personal and work renders of `mcp_servers.json.tmpl` and the source templates are inspected
- THEN no `op://` field value, URL literal, or token literal appears, and only `${HA_MCP_URL}` references the endpoint

### Requirement: Work profile unchanged
The system SHALL render the work profile with zero Home Assistant references.

#### Scenario: Work render
- WHEN `render work dot_config/mcp/mcp_servers.json.tmpl` runs
- THEN server keys are exactly `datadog-prod`, `datadog-staging`, `slack` and no `ha-mcp` or `homeassistant` text appears

## Slices and tasks

### Slice 1: Component install (manual, user)

### Task 1: Install the HACS component and the server entry
**Delivers:** A long-lived ha-mcp server on `172.16.0.14:9584` with a copied direct connect URL
**Blocked by:** None
**Traces to:** Design "HA side (manual, outside chezmoi)" and the smallest user-feedback slice
**Files:** None (Home Assistant UI; outside chezmoi)

- [ ] In HACS → Integrations → Custom repositories, add `https://github.com/homeassistant-ai/ha-mcp-integration` with category Integration, download it, and restart HA.
- [ ] In Settings → Devices & Services → Add Integration, add **HA-MCP Custom Component** → **HA-MCP Server**.
- [ ] Set options: automatic server updates off; remote access via webhook off (local-only); authentication mode `none`; server package field empty; network access at default.
- [ ] Copy the direct connect URL (`http://172.16.0.14:9584/private_<random>`) from the entry's Configure screen into a local scratch buffer only; do not paste it into chat, files, or this plan.
- [ ] Verify manually: the repository appears in HACS, the entry exists, and the Configure screen shows the direct URL.

### Slice 2: Secret URL plumbing

### Task 2: Store the URL in 1Password and export `HA_MCP_URL`
**Delivers:** `HA_MCP_URL` exported from 1Password in new fish shells; `HOME_ASSISTANT_*` exports still present for rollback
**Blocked by:** Task 1
**Traces to:** Design "chezmoi side" steps 2–3
**Files:** `dot_config/private_fish/private_config.fish.tmpl`

- [ ] Ask Matteo to add an `mcp_url` field to the existing `Private/Home Assistant` 1Password item holding the full direct URL.
- [ ] Failing check (should fail before the edit):
  ```bash
  grep -n 'HA_MCP_URL' dot_config/private_fish/private_config.fish.tmpl
  ```
  Expected before: no match.
- [ ] Inside the personal `{{ if eq .profile "personal" }}` block, after the existing `HOME_ASSISTANT_*` lines, add:
  ```fish
  # HA-MCP component direct URL (HACS in-process server); consumed by mcp_servers.json.
  set -gx HA_MCP_URL '{{ onepasswordRead "op://Private/Home Assistant/mcp_url" }}'
  ```
  Keep the `HOME_ASSISTANT_*` exports and their comment until cutover.
- [ ] Apply and verify without printing the value:
  ```bash
  cm apply ~/.config/fish/config.fish
  fish -lc 'test -n "$HA_MCP_URL"; and echo SET; or echo UNSET'
  ```
  Expected: `SET`.
- [ ] Source-level secret check: the template contains only the `op://Private/Home Assistant/mcp_url` reference, no URL literal.
- [ ] Commit: `feat(fish): export HA_MCP_URL from 1Password`

### Slice 3: Transport and gate proof

### Task 3: Add a temporary `ha-mcp-remote` entry and prove the transport and gate
**Delivers:** A successful remote read plus a stable acknowledgment key across one-shot calls more than 60 seconds apart, with the active `ha-mcp` entry untouched
**Blocked by:** Task 2
**Traces to:** Design "Smallest user-feedback slice" steps 3–4 and "Testing strategy" transport/gate checks
**Files:** `dot_config/mcp/mcp_servers.json.tmpl`

- [ ] Failing check (should fail before the edit):
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers["ha-mcp-remote"]'
  ```
  Expected before: jq error (no such key).
- [ ] In the personal branch, add the temporary entry next to the existing stdio `ha-mcp` entry:
  ```json
  "ha-mcp-remote": {
    "type": "remote",
    "url": "${HA_MCP_URL}"
  }
  ```
- [ ] Verify and apply through the apply gate:
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers | keys'
  cm data | jq -e '.profile == "personal"'
  cm apply ~/.config/mcp/mcp_servers.json
  mcp-cli list
  ```
  Expected: keys include both `ha-mcp` and `ha-mcp-remote`; profile is `personal`; apply succeeds; `mcp-cli list` shows `ha-mcp-remote`. If the entry does not appear, the daemon cached the old config — restart the mcp-cli daemon (or the shell session) and re-run `mcp-cli list`.
- [ ] Live transport check (user present), output discarded so no household data enters the session:
  ```bash
  mcp-cli call ha-mcp-remote ha_get_overview '{}' > /dev/null && echo READ_OK
  ```
  Expected: `READ_OK`. This settles both design open questions (Tailscale reach of `172.16.0.14:9584`, mcp-cli plain-HTTP streamable support). On failure, stop and apply the design's fallback ladder before any cutover.
- [ ] Gate stability check: run `mcp-cli info ha-mcp-remote ha_get_skill_guide` to learn the exact arguments and output shape. Then run the call twice more than 60 seconds apart, saving each output to `/tmp/guide1.json` and `/tmp/guide2.json`, extract only the acknowledgment key line per the discovered schema into `/tmp/guide1.key` and `/tmp/guide2.key`, and compare:
  ```bash
  diff /tmp/guide1.key /tmp/guide2.key && echo KEY_STABLE
  rm /tmp/guide1.json /tmp/guide2.json /tmp/guide1.key /tmp/guide2.key
  ```
  Expected: `KEY_STABLE`; the diff output itself must not be printed if it contains skill content.
- [ ] Record the observed results (success/failure and stability, no secret values) in this task's checkboxes.
- [ ] Commit: `feat(mcp): add temporary ha-mcp-remote entry for transport validation`

### Slice 4: Cutover

### Task 4: Point the active `ha-mcp` entry at the component and remove the stdio path
**Delivers:** The active `ha-mcp` entry is `type: remote`; stdio entry, temporary entry, and `HOME_ASSISTANT_*` exports are gone; rendered configs verified
**Blocked by:** Task 3
**Traces to:** Design "chezmoi side" step 1 and "Smallest user-feedback slice" step 5
**Files:** `dot_config/mcp/mcp_servers.json.tmpl`, `dot_config/private_fish/private_config.fish.tmpl`

- [ ] In `dot_config/mcp/mcp_servers.json.tmpl` personal branch, delete the temporary `ha-mcp-remote` entry and replace the stdio `ha-mcp` entry with:
  ```json
  "ha-mcp": {
    "type": "remote",
    "url": "${HA_MCP_URL}"
  }
  ```
- [ ] In `dot_config/private_fish/private_config.fish.tmpl`, delete the `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` exports and reword the comment to describe `HA_MCP_URL` as the ha-mcp component direct URL consumed by `mcp_servers.json`.
- [ ] Verify renders (source-level, no rendered fish output printed):
  ```bash
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers | keys'
  render personal dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers["ha-mcp"].type == "remote"'
  ! render personal dot_config/mcp/mcp_servers.json.tmpl | grep -iE 'uvx|HOME_ASSISTANT'
  ! render work dot_config/mcp/mcp_servers.json.tmpl | grep -iE 'ha-mcp|homeassistant'
  render work dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers | keys'
  ```
  Expected: personal keys are `["ha-mcp"]` and type is `remote`; absence checks pass; work keys are `["datadog-prod","datadog-staging","slack"]`.
- [ ] Apply through the apply gate and smoke-test, discarding read output:
  ```bash
  cm data | jq -e '.profile == "personal"'
  cm apply ~/.config/mcp/mcp_servers.json ~/.config/fish/config.fish
  fish -lc 'mcp-cli call ha-mcp ha_get_overview "{}"' > /dev/null && echo READ_OK
  ```
  Expected: apply succeeds; `READ_OK` proves the active `ha-mcp` entry answers a read.
- [ ] Commit: `feat(mcp): switch personal ha-mcp to the HACS in-process component`

### Slice 5: Skills and sync prompt

### Task 5: Update the driver skill for the remote transport and the acknowledgment key
**Delivers:** `home-assistant-mcp` documents the remote configuration and the gated-write key flow
**Blocked by:** Task 4
**Traces to:** Design "chezmoi side" step 4 (driver skill)
**Files:** `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md`

- [ ] Rewrite the **Configuration** section: server name `ha-mcp`; config file `~/.config/mcp/mcp_servers.json`; transport `type: remote` with `url: ${HA_MCP_URL}`; no env mapping and no local token; the connect URL is the credential and comes from 1Password through the fish export. Delete the `uvx`/`HOME_ASSISTANT_*` wording.
- [ ] Add a **Best-practices acknowledgment key** section: before any gated write, call `ha_get_skill_guide` for the best-practices skill, read the acknowledgment line, and pass `BestPracticeKey` on the write call. State that the key rotates hourly with a previous-hour grace window, so re-read the guide when a write returns `BPS_ACKNOWLEDGMENT_REQUIRED`.
- [ ] Keep discovery-first and read-only-first guidance and the mutation deferral to the router skill unchanged.
- [ ] Verify:
  ```bash
  ! grep -nE 'uvx|HOME_ASSISTANT' dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md
  grep -n 'BestPracticeKey' dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md
  grep -n 'BPS_ACKNOWLEDGMENT_REQUIRED' dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md
  ```
  Expected: first check finds nothing; the other two find the new section.
- [ ] Commit: `docs(pi): update home-assistant-mcp skill for the remote component`

### Task 6: Switch the router skill and references to secret-URL handling
**Delivers:** The router skill and references treat the connect URL as the protected secret and check HA logs/repair issues instead of server startup output
**Blocked by:** Task 4
**Traces to:** Design "chezmoi side" step 4 (router skill and references)
**Files:** `dot_pi/agent/exact_skills_personal/exact_home-assistant/SKILL.md`, `dot_pi/agent/exact_skills_personal/exact_home-assistant/references/core-concepts.md`, `dot_pi/agent/exact_skills_personal/exact_home-assistant/references/safety-and-routing.md`

- [ ] In all three files, replace `HOME_ASSISTANT_TOKEN` handling with connect-URL handling: never print, log, persist, or include the direct connect URL in prompts, files, command output, examples, or summaries. Keep the existing bearer-header and private-URL prohibitions.
- [ ] In `SKILL.md` and `references/safety-and-routing.md`, change the operational checks from "`ha-mcp` startup output or errors" to "Home Assistant logs and the server's repair issues" (Settings → System → Logs / Repairs).
- [ ] Rename the `safety-and-routing.md` heading "Privacy and token handling" to "Privacy and secret URL handling" and update its body.
- [ ] Verify:
  ```bash
  ! grep -rn 'HOME_ASSISTANT' dot_pi/agent/exact_skills_personal/exact_home-assistant/
  ! grep -rn 'startup output' dot_pi/agent/exact_skills_personal/exact_home-assistant/
  grep -n 'secret URL handling' dot_pi/agent/exact_skills_personal/exact_home-assistant/references/safety-and-routing.md
  ```
  Expected: absence checks pass; the heading check finds the renamed section.
- [ ] Commit: `docs(pi): switch Home Assistant router skill to secret-URL handling`

### Task 7: Refresh the sync prompt
**Delivers:** The sync prompt points at real source paths and includes the component repository
**Blocked by:** Task 4
**Traces to:** Design "chezmoi side" step 4 (sync prompt)
**Files:** `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md`

- [ ] Fix the stale local source path `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md.tmpl` to `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md`.
- [ ] Add `homeassistant-ai/ha-mcp-integration` to **Sources to inspect**.
- [ ] In **Privacy and secrets**, extend the protected material with the ha-mcp connect URL alongside the token.
- [ ] Verify:
  ```bash
  ! grep -n 'SKILL.md.tmpl' dot_pi/agent/exact_prompts/sync-home-assistant-skills.md
  grep -n 'ha-mcp-integration' dot_pi/agent/exact_prompts/sync-home-assistant-skills.md
  ```
  Expected: absence check passes; the component repo is listed.
- [ ] Commit: `docs(pi): refresh Home Assistant sync prompt sources`

### Task 8: Final verification
**Delivers:** Feature-level acceptance evidence: gate works both ways over the remote transport
**Blocked by:** Tasks 4, 5
**Traces to:** Requirements "Stable acknowledgment key", "Gated write succeeds with the key", "Gate not silently disabled", "Remote transport read"
**Files:** None (live validation; record results in this task)

- [ ] Negative gate check with no mutation expected: through the router's confirmation flow, call one discovered gated write tool without `BestPracticeKey` using harmless arguments, and expect `BPS_ACKNOWLEDGMENT_REQUIRED` with no state change.
- [ ] Positive gated write: after router confirmation for a benign mutation (recommended: create and then delete a label), read `ha_get_skill_guide`, pass `BestPracticeKey`, confirm the write succeeds, read back the result, then perform the documented rollback step. This can also ride along on the first real confirmed mutation after cutover.
- [ ] Confirm a read still succeeds without printing output:
  ```bash
  fish -lc 'mcp-cli call ha-mcp ha_get_overview "{}"' > /dev/null && echo READ_OK
  ```
  Expected: `READ_OK` from a fresh fish shell.
- [ ] Record outcomes (no secret values) in this task's checkboxes.

### Task 9: Documentation and future-agent guidance review
**Delivers:** Stale references removed from repo agent guidance or explicitly recorded as unchanged
**Blocked by:** Task 8
**Traces to:** Durable-plan contract (documentation and future-agent guidance)
**Files:** `AGENTS.md`, `dot_pi/agent/exact_skills/chezmoi/SKILL.md` (review only; update only if stale)

- [ ] Search the repository for leftover `uvx ha-mcp`, `HOME_ASSISTANT_`, and stdio-`ha-mcp` references outside the files already updated:
  ```bash
  rg -n 'uvx ha-mcp|HOME_ASSISTANT|ha-mcp@latest' --glob '!plans/**' --glob '!node_modules/**'
  ```
- [ ] For each hit outside this plan's files: update it, or record here why it stays. Add to `AGENTS.md` only durable commands, traps, or procedures (for example, the worktree `--source` override if not already present). Do not add narrative prose.
- [ ] Documentation impact summary for this feature: the skills, the sync prompt, and the fish comment are the user-facing docs; no README or runbook exists for this setup, so nothing else is affected.
- [ ] Commit (only if files changed): `docs: refresh Home Assistant transport references`
