---
description: Review upstream Home Assistant skills and ha-mcp, then propose curated local pi skill updates.
---
# Sync Home Assistant Skills
Review upstream Home Assistant agent guidance and tooling, then recommend curated updates for this dotfiles repo. Do not edit files unless the user explicitly tells you to apply changes.

## Sources to inspect
- Upstream `homeassistant-ai/skills`
- Upstream `homeassistant-ai/ha-mcp`
- Local `dot_pi/agent/exact_skills_personal/exact_home-assistant/`
- Local `dot_pi/agent/exact_skills/home-assistant-mcp/SKILL.md.tmpl`

Record the upstream URL, commit/date, source method, and a short summary of what changed upstream.

## Compare and report
Highlight:
- useful upstream guidance or tooling worth curating locally;
- stale local guidance;
- duplicated content that should be trimmed;
- changed safety assumptions;
- renamed, deprecated, added, or removed `ha-mcp` tools.

The local Home Assistant safety policy is authoritative: read-only by default, safety tiers, confirmation protocol, verification, rollback, and token/privacy rules must not be weakened. Avoid wholesale mirroring from upstream; curate only the parts that improve the local skills.

## Privacy and secrets
Never include the Home Assistant token, bearer headers, private Home Assistant URLs, entity/state dumps, presence details, or other household-private data in output or files.

## Before editing
Ask before editing unless the user explicitly requested applying updates. If editing is approved, summarize the curated changes, preserve the local safety policy, and update only the relevant local skill or prompt files.
