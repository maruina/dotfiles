---
name: chezmoi
description: Manage dotfiles with chezmoi. Use when editing managed dotfiles, adding new files to chezmoi, updating template files, applying source changes to the home directory, or diagnosing drift between source and target state.
---
# Chezmoi
Use for chezmoi-managed dotfiles.

**Rule:** edit the chezmoi source, not target files in `$HOME`. Preview with `chezmoi diff`, then apply.

## Source layout
```text
~/.local/share/chezmoi/
  dot_pi/agent/exact_skills/       # ~/.pi/agent/skills/
  dot_pi/agent/exact_prompts/      # ~/.pi/agent/prompts/
  dot_pi/agent/exact_extensions/   # ~/.pi/agent/extensions/
  dot_pi/agent/models.json.tmpl    # ~/.pi/agent/models.json
  dot_config/mcp/
  dot_config/private_fish/
  dot_ssh/config.tmpl
  run_onchange_brew-install.sh.tmpl
```

## Prefixes
| Prefix/suffix | Meaning |
|---|---|
| `dot_` | Target path starts with `.` |
| `private_` | Target permissions `0600` |
| `exact_` | Remove target files absent from source |
| `run_onchange_` | Run when content hash changes |
| `.tmpl` | Render with Go `text/template` |

## Common commands
```bash
chezmoi source-path ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi edit ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi diff ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi apply ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi managed
chezmoi unmanaged ~/.pi/agent/skills/
```

Add a new target file with the target path, not the source path:

```bash
chezmoi add ~/.pi/agent/skills/my-skill/SKILL.md
chezmoi chattr +private ~/.some/private/file
chezmoi chattr +exact ~/.pi/agent/skills/
```

## Templates
`chezmoi re-add` does not update templates correctly. For targets rendered from `.tmpl` files, edit the source template directly:

```bash
chezmoi source-path ~/.pi/agent/models.json
chezmoi edit ~/.pi/agent/models.json
chezmoi diff ~/.pi/agent/models.json
chezmoi apply ~/.pi/agent/models.json
```

Use `chezmoi merge <target>` only when target drift must be reconciled back into a template.

Key template data:
- `.profile`: `work` or `personal`
- `.email`
- `.signingKey`
- `.chezmoi.os`

Profile-gated config:

```gotemplate
{{- if eq .profile "work" -}}
# work-only config
{{- end -}}
```

Inspect and test templates:

```bash
chezmoi data
chezmoi execute-template '{{ .chezmoi.os }}'
chezmoi execute-template < ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl
```

## Secrets
Use 1Password only. Never hardcode secrets:

```gotemplate
{{ onepasswordRead "op://vault/item/field" }}
```

## Pi models after `/refresh-models`
`/refresh-models` changes `~/.pi/agent/models.json`; sync those changes into `dot_pi/agent/models.json.tmpl`.

Classify providers before editing:
- Work: Datadog URLs such as `https://ai-gateway.us1.ddbuild.io` or `https://ai-gateway.us1.prod.dog`, or headers containing `x-dd-tag-dd.user_email: matteo.ruina@datadoghq.com`.
- Personal: all other providers.
- If URL and headers disagree, stop and ask.

Verify after editing:

```bash
chezmoi execute-template < ~/.local/share/chezmoi/dot_pi/agent/models.json.tmpl | diff -u - ~/.pi/agent/models.json
chezmoi diff ~/.pi/agent/models.json
```

## Completion workflow
For verified changes, unless unsafe or the user asked for preview only:
1. Run `chezmoi diff`.
2. Run `chezmoi apply` for changed targets.
3. Commit source changes with a Conventional Commit message.
4. Push the branch.

Do not auto-commit or push when there are unrelated local changes, the change is incomplete, applying would affect broad targets, or repo state is unsafe.
