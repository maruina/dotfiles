---
name: chezmoi
description: Manage dotfiles with chezmoi. Use when editing managed dotfiles, adding new files to chezmoi, updating template files, applying source changes to the home directory, or diagnosing drift between source and target state.
---
# Chezmoi
Use this skill when working with chezmoi-managed dotfiles.

**Critical rule**: never edit files directly in `$HOME`. The chezmoi source directory (`~/.local/share/chezmoi`) is the source of truth. Edit there, then apply.

## Source directory layout
```
~/.local/share/chezmoi/
  dot_pi/agent/
    exact_skills/        # ~/.pi/agent/skills/ (exact_ removes untracked files)
    exact_prompts/       # ~/.pi/agent/prompts/
    exact_extensions/    # ~/.pi/agent/extensions/
    models.json.tmpl     # ~/.pi/agent/models.json  (template)
    modify_private_settings.json.tmpl
  dot_config/private_fish/
  dot_ssh/config.tmpl
  run_onchange_brew-install.sh.tmpl
```

## File naming prefixes
| Prefix | Effect |
|--------|--------|
| `dot_` | Maps to `.` in target (e.g. `dot_pi` → `.pi`) |
| `private_` | Sets target permissions to `0600` |
| `exact_` | Removes files from the target directory that are not in the source |
| `run_onchange_` | Runs the script when its content hash changes |
| `.tmpl` suffix | File is a Go `text/template`; rendered before writing to target |

## Adding a new file
Always use `chezmoi add` with the **target path** (in `$HOME`), not the source path:
```bash
chezmoi add ~/.pi/agent/skills/my-skill/SKILL.md
# Set permissions if needed
chezmoi chattr +private ~/.some/private/file
# Mark a directory as exact (removes untracked files from target)
chezmoi chattr +exact ~/.pi/agent/skills/
```

## Editing an existing non-template file
```bash
# Option 1: edit source directly (preferred)
chezmoi edit ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi apply ~/.pi/agent/skills/my-skill/SKILL.md

# Option 2: edit target, then re-add to sync source
# (Only works for non-template files)
# edit ~/.pi/agent/skills/my-skill/SKILL.md in $HOME, then:
chezmoi re-add ~/.pi/agent/skills/my-skill/SKILL.md
```

## Updating a template file — IMPORTANT
**`chezmoi re-add` does not work with templates.** It silently does nothing (the source is unchanged, `chezmoi diff` keeps showing the drift).

The only correct approach is to **edit the source template directly**:
```bash
# Find the source path
chezmoi source-path ~/.pi/agent/models.json
# → /Users/you/.local/share/chezmoi/dot_pi/agent/models.json.tmpl

# Edit the source template
hx ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl
# (or use chezmoi edit)
chezmoi edit ~/.pi/agent/models.json

# Preview and apply
chezmoi diff
chezmoi apply ~/.pi/agent/models.json
```

If the target file has been changed in `$HOME` and you want to merge those changes back into the template:
```bash
chezmoi merge ~/.pi/agent/models.json
```
`merge` opens a three-way diff (source rendered, target current, source raw) and lets you reconcile manually. Use it instead of `re-add` for templated files.

## Updating pi models after `/refresh-models`
`/refresh-models` updates the rendered target file:
```
~/.pi/agent/models.json
```

The chezmoi source of truth is the template:
```
~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl
```

When `/refresh-models` changes `~/.pi/agent/models.json`, sync those changes into chezmoi with a template merge:
```bash
chezmoi diff ~/.pi/agent/models.json
chezmoi merge ~/.pi/agent/models.json
chezmoi diff ~/.pi/agent/models.json
chezmoi apply ~/.pi/agent/models.json
```

After merging, verify that rendering the template matches the target and that chezmoi has no remaining diff:
```bash
chezmoi execute-template < ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl | diff -u - ~/.pi/agent/models.json
chezmoi diff ~/.pi/agent/models.json
```

Do **not** use `chezmoi re-add ~/.pi/agent/models.json`; `models.json` is a template target, so `re-add` will not update `models.json.tmpl` correctly.

## Secrets
Use 1Password exclusively. Never hardcode secrets in source files:
```
{{ onepasswordRead "op://vault/item/field" }}
```

## Template syntax
Templates use Go `text/template` with sprig helpers. Key variables:
- `.profile` — `"work"` or `"personal"`
- `.email`
- `.signingKey`
- `.chezmoi.os` — `"darwin"`, `"linux"`, etc.

Profile guard pattern:
```
{{- if eq .profile "work" -}}
# work-only config
{{- end -}}
```

Inspect available data:
```bash
chezmoi data
```

Test a template fragment:
```bash
chezmoi execute-template '{{ .chezmoi.os }}'
chezmoi execute-template < ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl
```

## Common operations
```bash
# Preview all pending changes
chezmoi diff

# Apply everything
chezmoi apply

# Apply a single target file
chezmoi apply ~/.pi/agent/models.json

# Re-sync all managed non-template files from $HOME
chezmoi re-add

# List managed files
chezmoi managed

# List unmanaged files under a directory
chezmoi unmanaged ~/.pi/agent/skills/

# Check source path for a target
chezmoi source-path ~/.pi/agent/models.json
```

## Workflow for adding a new pi skill to chezmoi
```bash
# 1. Create the skill in the target location
mkdir -p ~/.pi/agent/skills/my-skill
# write SKILL.md to ~/.pi/agent/skills/my-skill/SKILL.md

# 2. Add to chezmoi source
chezmoi add ~/.pi/agent/skills/my-skill/SKILL.md

# 3. Verify source was created correctly
chezmoi source-path ~/.pi/agent/skills/my-skill/SKILL.md

# 4. Commit in the chezmoi source repo
cd ~/.local/share/chezmoi
git add dot_pi/agent/exact_skills/my-skill/
git commit -m "feat: add my-skill pi skill"
```
