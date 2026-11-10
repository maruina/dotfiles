---
name: herdr
description: Drive and customize the Herdr app and herdr-core on this machine. Use when asked to change Herdr's layout, look, keys, themes, or mods, start or steer agent terminals with `hc`, debug mod UIs, or read anything under ~/.config/herdr-app.
---
# Herdr
Customize and drive the Herdr app (a desktop app for terminals and coding agents) and herdr-core (`hc`) on this personal machine.
## Session setup
1. Read `~/.config/herdr-app/AGENTS.md` first. It is the complete agent manual for the installed version, and Herdr rewrites it on every start, so read it again each session instead of trusting memory or this skill. It lists the commands, the file format of layouts, keys, settings and mods, and what you can and can not do.
2. For herdr-core work outside the app, get the core manual with `hc --skill`; `hc --help` covers one-shot flags.
## Safety rules
- Herdr's own layouts and mods are read-only, and Herdr replaces them whole on every start. To change them, run `layout.clone` or `mod.clone` and edit the clone.
- After you edit a config file, check the sibling `<name>.error` file (`layout.error`, `keys.error`, `settings.error`, `programs.error`). When a file is invalid, the app keeps its last good version.
- Validate a mod with `herdr-app check <mod folder>` before you call it done, then look at it in the app; the check does not cover deferred rows, nested renders, or async states.
- Debug UIs with `herdr-app shot`; it saves the last rendered frame as a PNG. When more than one Herdr window runs, `HERDR_APP_HOME` selects which one.
- `ctrl-alt-shift-escape` always restores the default layout. Nothing can rebind it.
## Changing the look, this machine
The user's look is tracked in the chezmoi source at `~/.local/share/chezmoi/dot_config/herdr-app/`:
- `settings.json`: font MesloLGS NF at size 15, theme `catppuccin-frappe`.
- `themes/catppuccin-frappe.json`: the theme, its palette copied from the Ghostty setup.
Edit the chezmoi source, not the target files.
## Background
- A **space** is a place to work on one machine (the working convention is one repo per space); a **tab** is one task in it; panes hold terminals and mods.
- Agents are terminals whose program reports its status through OSC 7501. An agent starts helpers with `hc run` and steers them with `hc send`.
- The site [herdr.dev/guide](https://herdr.dev/guide/) is a summary for people; its tutorial content points back to the local AGENTS.md.
