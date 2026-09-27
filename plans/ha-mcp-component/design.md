# Replace the local ha-mcp stdio transport with the HACS in-process component

Date: 2026-09-26
Status: design, awaiting plan
Branch: `maruina/ha-mcp-component`

## Summary
pi reaches Home Assistant (HA) today through a local stdio MCP server, `uvx --python 3.13 ha-mcp@latest`, configured only in the personal profile. That transport cannot satisfy ha-mcp's strict best-practices gate: the gate's acknowledgment key derives from a per-process salt, and `mcp-cli` one-shot calls spawn a fresh server on every call, so a read-key-then-write sequence always fails. This design replaces the stdio entry with upstream's recommended HACS in-process component, running as a long-lived server, and points `mcp-cli` at its direct HTTP URL. The local safety policy stays authoritative and unchanged.

## Alignment brief

### Problem
ha-mcp's strict best-practices gate blocks its six write tools unless the call carries an acknowledgment key that is published only inside the best-practices skill content. The key is derived from `_ACK_KEY_SALT = secrets.token_hex(8)` (set once per server process) plus an hourly time bucket, with the previous hour honored as a grace window. `mcp-cli` one-shot calls spawn a fresh `uvx ha-mcp` process each time, so the salt rotates per call and the read-then-write round-trip is structurally impossible. The only current workaround is driving a persistent interactive session.

### User / audience
Matteo, personal profile only. The local HA skills (`home-assistant`, `home-assistant-mcp`, and their references) remain the safety authority: read-only by default, safety tiers, confirmation protocol, verification, rollback, and token/privacy rules.

### Goal
Replace the personal-profile stdio entry with the HACS in-process component as a long-lived server (automatic server updates off, local-only mode), and point `mcp-cli` at its direct URL with a `type: remote` entry, so gated writes work in one-shot calls. Keep the change small, reproducible from chezmoi, and rollback-friendly.

### Non-goals
- Migrating the vendored `home-assistant-best-practices` skill or the safety policy.
- Multiple HA instances or any work-profile HA integration.
- Broad autonomous HA management.
- `ha_auth` OAuth (mcp-cli has no OAuth flow; auth stays `none` with the secret URL).
- Publishing the endpoint through Traefik/`hass.malazan.xyz`.
- The component's File & YAML services entry (opt-in beta file/YAML tools).

### Known facts and assumptions

Verified facts:
- HA is Home Assistant OS, Core 2026.9.3, OS 18.3, Supervisor 2026.09.2, amd64/KVM, on VM `172.16.0.14`. HACS is installed and functional (it listed installed repositories).
- No ha-mcp add-on or component is installed today.
- The gate key rotates per process. Two `ha_get_skill_guide` calls 5 seconds apart returned different keys, and two 70 seconds apart also differed. `mcp-cli` daemon caching does not preserve the server process across invocations.
- Upstream `ha-mcp` (master, release v8.5.0, 2026-09-16) recommends the HACS custom component `homeassistant-ai/ha-mcp-integration` (domain `ha_mcp_tools`, component 2.2.x). It requires HA ≥ 2026.8.0 for HACS install (met) and Core ≥ 2026.7 to load.
- The component runs the server in-process, provisions its own HA admin token, exposes a direct port (`9584`) with a secret path, adds an admin-only sidebar panel, registers an HA conversation-agent LLM API, and offers `none`/`ha_auth`/`legacy` auth modes and a `/readonly` connection suffix. Server auto-update defaults on and can be frozen; component updates come through HACS and need an HA restart.
- `hass.malazan.xyz` has no public A record (1.1.1.1, 8.8.8.8, 9.9.9.9 all return empty); it resolves only internally to the Traefik nodes `172.16.0.4`/`172.16.0.5`. The Cloudflare Tunnel publishes only `nas.malazan.xyz` plus an `http_status:404` catch-all, and the only documented internet NAT forward is Plex on 32400. The domain is LAN/tailnet-only.
- Tailscale split DNS maps `malazan.xyz` to `172.16.0.1`, so tailnet clients resolve internal names.
- mcp-cli v0.3.0 supports `type: remote` with a `url` (the work profile already uses this for Datadog) and has no OAuth flow.

Assumptions:
- Tailscale subnet routing reaches `172.16.0.14:9584` (the user states full LAN access off-LAN; confirm port-level reachability during the slice).
- mcp-cli can POST to a plain-HTTP streamable-HTTP endpoint (confirm during the slice).

### Skills loaded and used

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `learning-opportunities` | `prompt-required` | brainstorm coaching contract | question framing, one-question turns, pause discipline |

Advisory learning source: `Datadog/Learnings.md` was reviewed and contained no relevant technical sections, so no learning guidance was applied.

## Context reviewed
- `dot_config/mcp/mcp_servers.json.tmpl` (work and personal branches).
- `dot_config/private_fish/private_config.fish.tmpl` (personal HA exports).
- `dot_pi/agent/exact_skills_personal/exact_home-assistant/` (router skill and references).
- `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md`.
- `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md`.
- `plans/home-assistant-pi-skills/design.md` and `plan.md` (prior design and its stated tradeoffs).
- Upstream: `homeassistant-ai/ha-mcp` README, `docs/in-process-server.md`, `homeassistant-addon/DOCS.md`, `strict_bps.py`, add-on `config.yaml`, and `philschmid/mcp-cli` README.
- Local network docs: `~/src/malazan.xyz/docs/home-assistant.md`, `docs/traefik-security.md`, `terraform/cloudflare-tunnel/main.tf`, `terraform/tailscale/main.tf`, `apps/home-assistant/`.

## Current behavior
The personal profile renders one MCP server, `ha-mcp`, as a stdio server launched with `uvx --python 3.13 ha-mcp@latest`. Its `env` block maps `${HOME_ASSISTANT_URL}` and `${HOME_ASSISTANT_TOKEN}` (exported in fish from 1Password) to ha-mcp's expected variable names. Because the server is short-lived, the best-practices gate's acknowledgment key changes between the read and the write, and gated writes fail in one-shot calls.

## Design overview

### HA side (manual, outside chezmoi)
1. Install the component: HACS → Integrations → Custom repositories → add `https://github.com/homeassistant-ai/ha-mcp-integration` (category Integration) → Download → restart HA.
2. Add the entry: Settings → Devices & Services → Add Integration → **HA-MCP Custom Component** → **HA-MCP Server**.
3. Set options: **Automatic server updates** off (freeze the server package); **Remote access via webhook** off (local-only mode); **Authentication mode** `none`; leave the server package field empty. Leave **Network access** at its default so the direct port is reachable on the LAN/tailnet.
4. Copy the direct connect URL from the entry's Configure screen: `http://172.16.0.14:9584/private_<random>`.

### chezmoi side
1. `dot_config/mcp/mcp_servers.json.tmpl`, personal branch: replace the stdio `ha-mcp` entry with
   ```json
   "ha-mcp": {
     "type": "remote",
     "url": "${HA_MCP_URL}"
   }
   ```
2. `dot_config/private_fish/private_config.fish.tmpl`, personal branch: replace the `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` exports with a single URL export sourced from 1Password:
   ```fish
   set -gx HA_MCP_URL '{{ onepasswordRead "op://Private/Home Assistant/mcp_url" }}'
   ```
3. 1Password: add an `mcp_url` field to the existing `Private/Home Assistant` item holding the full direct URL. Keep `pi_api_token` for rollback.
4. Skills and prompt:
   - `exact_home-assistant-mcp/SKILL.md`: update the Configuration section to the remote transport (server name `ha-mcp`, `type: remote`, `${HA_MCP_URL}`, no env token) and add a "Best-practices acknowledgment key" section: before a gated write, call `ha_get_skill_guide` for the best-practices skill, read the acknowledgment line, and pass `BestPracticeKey` on the write. Keep discovery-first and read-only-first guidance.
   - `exact_home-assistant/SKILL.md` and `references/core-concepts.md`, `references/safety-and-routing.md`: change "token handling" to "secret URL handling" (never print/persist the connect URL), and update the operational checks from "`ha-mcp` startup output" to "Home Assistant logs and the server's repair issues".
   - `sync-home-assistant-skills.md`: fix the stale `SKILL.md.tmpl` path and add the component repo as a source to review.

## Smallest user-feedback slice
Do first:
1. Install the component and the server entry with auto-update off and local-only mode; copy the direct URL.
2. Store the URL in 1Password and add `HA_MCP_URL` to the fish template.
3. Add a temporary mcp-cli entry `ha-mcp-remote` (`type: remote`, `url: ${HA_MCP_URL}`) without touching the active `ha-mcp` entry.
4. Run `mcp-cli call ha-mcp-remote ha_get_overview '{}'`; call `ha_get_skill_guide` twice in the same hourly rotation and compare the acknowledgment keys; then prove the gate both ways through the temporary entry with a scratch scene: `ha_config_set_scene` is rejected without `BestPracticeKey`, accepted with it, and the scratch scene is removed afterward.
5. Only if both pass: replace the active `ha-mcp` entry, remove the `HOME_ASSISTANT_*` exports, and update the skills.

What the user sees: pi queries HA over the component, a read-key-then-write sequence no longer fails the gate, and a keyless write is still rejected.

What the team learns: whether mcp-cli speaks plain-HTTP streamable MCP to the component, whether Tailscale reaches `172.16.0.14:9584`, that the long-lived key is stable across one-shot calls, and that the component's strict gate is effective in both directions.

Why no smaller slice produces this feedback: the long-lived server is the fix, and it exists only after the component is installed. The gate proof needs one real gated write, so it runs on a scratch scene through the temporary entry before any active entry changes.

Success criteria and validation:
- `mcp-cli call ha-mcp ha_get_overview '{}'` succeeds against the remote URL.
- Two `ha_get_skill_guide` reads in the same hourly rotation return the same acknowledgment key.
- `ha_config_set_scene` without `BestPracticeKey` returns `BPS_ACKNOWLEDGMENT_REQUIRED` and creates no scene; with the key it succeeds, and the scratch scene is removed.
- No token or secret URL is committed; the URL lives only in 1Password and the rendered config.

## Alternatives considered
- **Add-on (app) instead of the component.** Genuine merit: an isolated Supervisor-managed container, no HA-core package install, and a stable biweekly stable-release cadence. Rejected because the component's admin sidebar panel, HA conversation-agent/voice integration, and stronger auth options outweighed those benefits; kept as the deferred fallback.
- **Local persistent HTTP server (`uvx ha-mcp` in HTTP mode) with the existing token.** Genuine merit: no HA-side install, keeps the token model, and a long-lived process also fixes the salt rotation. Rejected because it is not upstream's recommended method, adds a locally managed daemon, and dies when the Mac is off.
- **Keep stdio and patch the client.** Genuine merit: no migration at all. Rejected because the 5-second control shows the salt rotates even within the daemon window, so no one-shot-safe stdio path exists.
- **Use `https://hass.malazan.xyz/api/webhook/<id>`.** Genuine merit: TLS in transit and a stable, memorable name. Rejected because it adds OPNsense DNS, Traefik, and cert-manager as dependencies and puts a reverse proxy in front of the streaming transport; deferred until TLS in transit becomes a requirement.
- **Use the component's `ha_auth` OAuth mode.** Genuine merit: a leaked URL alone would no longer grant access. Rejected because mcp-cli has no OAuth flow; deferred until mcp-cli supports it.
- **Point at the `/readonly` connection.** Genuine merit: transport-enforced read-only. Rejected because confirmed writes are required; deferred.

## Risks and mitigations
- **mcp-cli cannot reach a plain-HTTP streamable endpoint.** Mitigation: the slice tests `ha_get_overview` against a temporary entry before the active entry changes; if HTTP fails, fall back to the local webhook on `http://172.16.0.14:8123` (still tailnet-only) or revisit the domain option.
- **Tailscale does not route port 9584.** Mitigation: verify in the slice; if it fails, use the local webhook on 8123, which already works today.
- **HA-core package mutation.** The component pip-installs `ha-mcp` into HA core's Python environment at runtime, and an HA core update replaces that environment and forces a reinstall of the frozen version. This is the residual downside of choosing the component over the add-on. Mitigation: auto server-updates off, and treat repeated install failures as a trigger to switch to the add-on.
- **Version skew between component and server.** The component can hold a server update and raise a repair issue. Mitigation: update the component through HACS on the user's schedule; read repair issues.
- **Acknowledgment key expiry mid-session.** The key still rotates hourly. Mitigation: the skill instructs re-reading the guide if a gated write returns `BPS_ACKNOWLEDGMENT_REQUIRED`.
- **Strict gate not effective in the component.** `ENABLE_MANDATORY_BPS` and `ENABLE_STRICT_MANDATORY_BPS` default on and the pip wheel bundles the skills vendor, but the server fails open when the vendor is missing or settings fail to load. Mitigation: the slice reads the guide, requires the acknowledgment line, and proves a keyless gated write is blocked; on failure, reinstall the pinned server package and check the log for the "strict-BPS gate disabled" warning.
- **Secret URL leakage.** The URL is the only credential. Mitigation: never commit it; store it in 1Password; rotate with **Regenerate connect secrets now** if it leaks, and re-apply chezmoi.

## Operability
- The server logs into HA's normal log (`Settings → System → Logs`); startup failures and version holds appear as HA repair issues.
- Auto server-updates off means the server package stays on the installed version across reloads and restarts; component updates are manual via HACS and need an HA restart.
- Secret rotation: **Regenerate connect secrets now** in the entry options, then update 1Password and re-apply chezmoi.
- The direct port is LAN/tailnet-only and plain HTTP; the secret path is the credential.

## Rollout and rollback
Rollout follows the smallest slice: install and verify on a temporary entry, then replace the active entry and update the skills.
Rollback:
1. Restore the stdio `ha-mcp` entry in the personal branch of `mcp_servers.json.tmpl` and the `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` exports in the fish template (the token remains in 1Password).
2. `chezmoi apply` the two targets.
3. Optionally disable or remove the component entry in HA.

## Security and data handling
- The connect URL is a credential and must never appear in source, examples, prompts, or output. Only the `${HA_MCP_URL}` reference is committed.
- The component's in-process server runs with HA admin access and a Supervisor `manager` role; it exposes the same toolset the stdio server did, so the local policy's capability scope is unchanged.
- The endpoint stays LAN/tailnet-only and is not published through Traefik or the Cloudflare Tunnel.
- Policy enforcement stays in the skills; no server-side gating is added (no `read_only_mode`, no tool security policies).

## Testing strategy
- Transport: `mcp-cli call ha-mcp-remote ha_get_overview '{}'` returns success.
- Gate: two `ha_get_skill_guide` reads in the same hourly rotation return the same key; a gated write on the temporary entry without `BestPracticeKey` returns `BPS_ACKNOWLEDGMENT_REQUIRED`, and the same write with the key succeeds.
- Rendered config: `chezmoi execute-template`/`chezmoi diff` shows valid JSON for the personal profile and an unchanged work profile.
- Negative case: confirm a gated write without `BestPracticeKey` still returns `BPS_ACKNOWLEDGMENT_REQUIRED` (the gate is not silently disabled).

## Open questions
- Confirm `172.16.0.14:9584` is reachable over Tailscale (settled by the slice).
- Confirm mcp-cli's plain-HTTP streamable support (settled by the slice).
- Whether to keep the `HOME_ASSISTANT_TOKEN` 1Password item indefinitely or retire it after the remote path is proven.

## Self-review
- The chosen direction's clearest downside is the HA-core runtime pip install and its reinstall-on-core-update behavior; it is named explicitly and paired with a fallback trigger (switch to the add-on).
- Every rejected alternative names a genuine merit and is deferred with a revisit trigger rather than merged.
- The smallest slice produces real user feedback (a working remote read, a rejected keyless write, an accepted keyed write, and a stable gate key) before any active configuration changes.
